---
description: How the EpixNet node verifies xID names and profiles against Epix Chain. Leaf binding, Merkle proofs, validator finality, the embedded CometBFT light client, network-quorum bootstrap, the optional validator pin, thresholds, and what happens when verification cannot complete.
---

# xID verification and the light client

This page explains how an EpixNet node proves that an xID answer is true before it acts on it. xID is the name and identity system on Epix Chain: it maps names such as `talk.epix` to xite addresses and records which keys may sign as a name. The page covers every check the node performs, how it learns the validator set without trusting a single server, the exact thresholds, and how the node behaves when a check fails. It is written for contributors, node operators and anyone reviewing the trust model.

For what xID is and how to use it, see [xID: names and identity](../start/xid.md). For the developer view, see [xID for developers](../web3/xid.md). The code is in [`crates/epix-chain`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-chain).

## The problem

A node learns about names by asking a chain endpoint over HTTP. That endpoint can be wrong, out of date or hostile. If the node simply believed it, whoever runs the endpoint could point `talk.epix` at a different xite or claim that a key belongs to a name it does not.

The node therefore treats chain endpoints as untrusted carriers of data. An answer is accepted only when it comes with a proof that links it, step by step, to signatures from the chain's own validators:

```text
validators  ->  state digest  ->  Merkle leaf  ->  the name's record
```

Each arrow is a check the node performs locally. Any failure is an error. The resolver has no path that returns an unverified answer, and the node never downloads a xite on the strength of one.

## The verification pipeline

Resolving `name.tld` runs the following steps. They are implemented in `resolver.rs`, `leaf.rs`, `merkle.rs`, `finality.rs` and `checkpoint.rs`.

### Step 0: is there a trust anchor?

Before any request leaves the node, the resolver checks that a usable validator set is installed. If verification is on and no usable set exists, it returns "trust not established" at once. It does not ask the endpoint first, because the answer could not be verified anyway and the request would reveal the name to an endpoint before any trust exists. The caller waits for the light client and retries.

### Step 1: fetch the record with its proof

The node requests `/xid/v1/resolve_with_proof/<tld>/<name>` from a chain REST endpoint. The response contains the exact bytes the chain hashed for this name (`leaf_preimage`), the leaf hash, the leaf index, the sibling hashes and the proof root.

An unregistered name is reported as "not found", which is a definite answer, and not as a malformed response.

### Step 2: leaf binding

A Merkle proof shows that some leaf is in the tree. It says nothing about whether the data returned next to it is that leaf. The node closes that gap:

1. `sha256(leaf_preimage)` must equal the proof's leaf hash.
2. The record is parsed from the preimage bytes themselves. The node never re-serializes it.
3. The `name` and `tld` inside the record must equal what was asked for.

With verification on, the preimage is required. An endpoint cannot downgrade the check by leaving it out.

### Step 3: Merkle inclusion

The node recomputes the root from the leaf hash and the sibling hashes with SHA-256, ordering each pair by the parity of the current index, and requires the result to equal the proof root.

### Step 4: finality of the root

The proof root must be a state digest that validators have signed. The node requests `/xid/v1/attestations?digest=<root>` and receives a bundle: a height, a consensus round, a block time and one attestation per validator.

Each attestation is the validator's CometBFT vote-extension signature, made with its ed25519 consensus key as part of its precommit. Validators need no extra key and no registration. For every attestation the node:

1. parses the signed payload and requires its height, digest and block time to match the bundle;
2. looks the validator up in its **pinned set** by consensus address, and uses the pinned public key, never one supplied by the endpoint;
3. rebuilds the exact bytes CometBFT signed (the length-delimited canonical vote extension with the payload, height, round and the pinned chain identifier) and verifies the signature strictly;
4. counts each validator at most once per round.

Then it applies the acceptance rules:

| Rule | Value |
| --- | --- |
| Quorum is taken from one consensus round | The strongest single round is used. Power is never summed across rounds, so an endpoint cannot assemble a quorum that never existed. |
| Supermajority | Signed power times 3 must be strictly greater than total pinned power times 2. |
| Power floor | Signed power must be at least 6,667 basis points of the total. |
| Freshness | The bundle's block time must be within 120 seconds of the local clock. |
| No rollback | The bundle's height must not be lower than the highest height already accepted. |
| Not before the pin | The bundle's height must not be lower than the height the pinned set was captured at. |
| Pin age | The pinned set must be inside its weak-subjectivity window, 7 days by default. |
| Digest shape | The digest must be 32 bytes of valid hex. |

Because each attestation is a consensus precommit, signing two conflicting digests is equivocation under CometBFT's own rules.

### Step 5: the checkpoint

Signature verification and checkpoint publication share one process-wide lock. The highest accepted height and its digest are written to `xid_finality_checkpoint.json`, atomically and synced, **before** the resolution is reported as successful. On restart the node restores it. A lower height, a different digest at the same height, a corrupt file or an I/O error all fail closed.

Only after all five steps does the node use the record: to open a xite by name, to decide whether a user's signature is allowed, or to show a profile.

## Where the validator set comes from

Step 4 depends on a pinned validator set: a map from consensus address to public key and voting power, with the chain identifier and the height and time it was captured at. The node maintains it with an embedded CometBFT light client (`lightclient.rs`), so no release ever has to ship a new validator list.

### At boot

The trust anchor is installed during boot, before any name cache is read and before any chain endpoint is contacted. There are four cases:

| Situation | What the node does |
| --- | --- |
| A valid `xid_pin.json` is in the data folder | Installs it and requires finality from then on. This file is an optional anchor that an operator provides. |
| `xid_pin.json` exists but is unreadable or invalid | Refuses to start. Replace it with a trusted pin, or delete it to let the node bootstrap from the network. |
| No operator pin, but the node has run before | Restores `xid_lc_pin.json`, the last set the light client verified. This needs no network, so cached resolutions can be verified immediately. The set's 7-day window still applies. |
| Nothing on disk (a fresh install) | Verification is on with no set installed. Every resolution fails closed until the light client establishes trust from the network. |

There is also a development switch: with `EPIX_XID_ALLOW_INSECURE_LEGACY=1` and no pin file, the node falls back to trusting the endpoint's own "finalized" flag. It is logged as an insecure compatibility mode and must not be used on a real node.

### Network-quorum bootstrap

A node with no trust anchor asks several independent CometBFT RPC endpoints, run by different operators, what the chain currently looks like, and adopts an answer only when they agree exactly.

1. **Probe.** Ask every source for its latest height, all at once, with a 10-second timeout each. At least the quorum must answer.
2. **Pick a settled height.** Take the lowest reported height and step back 3 blocks.
3. **Compare headers.** Fetch the signed header at that height from every reachable source and group the answers by full header hash. The hash covers every field of the header, including the chain identifier, the time and the validator-set hashes.
4. **Require agreement.** The largest group must reach the quorum. If a second group also reaches it, the result is ambiguous (a fork or an attack) and the bootstrap fails closed. The agreed header's chain identifier must be `epix_1916-1`.
5. **Reject stale snapshots.** The agreed header must be less than one hour old.
6. **Bind the validator sets.** Fetch the validator set at that height and at the next one, and require them to hash to the header's `validators_hash` and `next_validators_hash`. After this, no single endpoint is trusted for the contents of the set.

The defaults are:

| Setting | Default |
| --- | --- |
| Sources (`xid_bootstrap_rpcs`) | `https://rpc.epix.zone`, `https://rpc-epix.onenov.xyz`, `https://rpc-m.epix.vinjan-inc.com`, `https://rpc-epix.dnsarz.net:443` |
| Quorum (`xid_bootstrap_quorum`) | 2 |

Both can be changed under **Epix Chain Config** on the Config page. Leaving the source list empty restores the built-in list.

!!! warning "What bootstrap agreement means"
    This step is agreement between observers, not a cryptographic proof. Forging it would require controlling a quorum of the listed endpoints at the same moment and holding the consensus keys of more than two thirds of some historical validator set, in order to fabricate a plausible chain. Disagreement, staleness or ambiguity fails closed and is retried later. If you want a stronger starting point, supply your own `xid_pin.json` (see [Providing your own pin](#own-pin)).

### Splicing onto an operator pin

When an operator pin is installed, the light client prefers it over the network bootstrap. It fetches the signed header at the pin's height and requires the validator set there to be equal to the pinned one (same consensus addresses, keys and powers) and to hash to the header. That header becomes the first trusted state. If the splice cannot be completed, the node falls back to the network bootstrap.

### Following the chain

From its trusted header the light client moves forward the way an IBC light client does, using the audited `tendermint-light-client-verifier` crate:

1. Fetch the chain head and aim for two blocks behind it, so that the next validator set always exists.
2. Verify the target header against the trusted one by **skipping verification**: the new header is accepted only if validators holding at least one third of an already trusted set signed it. If the set changed too much across the gap, verify a midpoint first and continue (bisection, at most 40 steps).
3. Fetch the validator set at the verified height and require it to hash to the header's `validators_hash`.
4. Write the new trusted state to `xid_lc_state.json`.
5. Publish the verified set as the active pin, and save it to `xid_lc_pin.json` for the next boot.

Trust is persisted before the pin is published, so a crash between the two steps re-derives the same pin instead of reviving an older set. Publishing is monotonic: a new pin must be for the same chain and a height that is not lower than the current one, and the checkpoint must accept it first.

| Parameter | Default | Meaning |
| --- | --- | --- |
| Trust threshold | 1/3 | The share of a trusted set that must have signed a skipped-to header. |
| Trusting period | 14 days | How old a trusted header may be and still serve as a base. Two thirds of the chain's 21-day unbonding period. |
| Clock drift allowance | 30 seconds | How far ahead of the local clock a header time may be. |
| Cycle interval | 1 hour | How often the client advances once trust is established. |

Since the pinned set follows the live set, validator changes and maintenance do not strand name resolution, and no margin beyond two thirds is needed. A node that connects at least once per trusting period keeps its trust without any manual step.

### Coming back after a long time offline

If the stored trusted header is older than the trusting period, it can no longer anchor skipping verification. The node then establishes a fresh anchor the same way a new install does: from an operator pin if one matches the chain, otherwise from the network-quorum bootstrap. If the source list has been deliberately emptied, the node logs a warning that the anchor has expired and resolution stays closed.

### Scheduling and endpoints

- After a successful cycle the client sleeps for the cycle interval (`xid_lc_interval_secs`, one hour by default, minimum 60 seconds). One cycle is a handful of small requests.
- Until trust is established, and after any failed cycle, it retries quickly, starting at 5 seconds and doubling. While a page is waiting on trust, the delay never exceeds 30 seconds.
- A network change, or the Retry button shown while a name is being checked, wakes the client at once and resets the backoff.
- The client rotates across its primary endpoint and the bootstrap sources, and starts the next cycle with whichever answered last.
- Chain requests use the same egress as every other chain fetch. In Tor mode `always` they travel through Tor, and they fail until Tor is ready. That is expected during startup.

## What is trusted

| Trusted | Why it is acceptable |
| --- | --- |
| More than two thirds of the validator voting power of Epix Chain | This is the security assumption of the chain itself. |
| The initial anchor: either agreement between independent RPC operators, or a pin you supplied | It is used once, at a cold start, and is then replaced by header verification. |
| The local clock, within the stated allowances | Freshness and trusting-period checks depend on it. |
| The node's own files on disk | The checkpoint and the trusted state are the node's memory of what it has accepted. |

| Not trusted | How it is handled |
| --- | --- |
| Any single REST or RPC endpoint | Every answer is checked against proofs and signatures. |
| The public keys or powers that an endpoint reports alongside attestations | The pinned values are used. |
| A "finalized" flag in a response | Ignored. Signatures are verified instead. |

What this does not protect against: an endpoint can still refuse to answer or answer slowly. The pipeline prevents forged and replayed answers. It does not guarantee availability.

## Failure behavior

The resolution pipeline fails closed. In practice:

- **A fresh install waits.** Names, including the name of the home xite, resolve only after the first bootstrap, which normally takes seconds after the first successful chain contact. The download of the home xite starts as soon as trust is anchored.
- **Content on disk is served first.** Boot never contacts the chain. A name whose xite is already on disk is served at once from the node's own earlier verified answer, and the mapping is verified again as soon as the chain answers. Such an earlier answer can only serve a copy that is already on disk under that address. It never starts a download.
- **User content is deferred, not rejected.** If a user's signature cannot be checked because trust is not yet established or the chain is unreachable, the content is held back. When the trusted set appears, the node re-indexes those xites.
- **Errors leave trust untouched.** A rejected header, a failed fetch or an inconsistent validator set leaves the current pin and the stored state exactly as they were. A hostile endpoint can stall the light client. It cannot rotate the set.
- **A wrong clock is reported as such.** If this machine's clock is behind the chain by more than the drift allowance, headers look as if they come from the future and no retry can succeed. The node logs a warning that names the cause once per failure streak.

The light client's state is exposed to pages and the dashboard as `xid_trust` in the `serverInfo` response. Its phase is one of `idle`, `probing`, `bootstrapping`, `verifying`, `anchored` or `failed`, with the last error and the next retry time.

## Caches

Verified answers are cached so that the chain is not asked repeatedly.

| Cache | Lifetime | Notes |
| --- | --- | --- |
| Name snapshots, in memory | 30 minutes | Each entry remembers the height and digest that verified it. A newer checkpoint invalidates older entries regardless of age. Revocation checks bypass this cache. |
| Last verified digest, in memory | 3 seconds | The digest is global chain state, so a burst of lookups shares one attestation fetch. |
| `xid-identity-cache.json` | Durable | Finality-proven name-to-identity resolutions, so the next boot can verify user content before any network exists. |
| `xid-profile-cache.json` | Durable | Display profiles (name, owner, avatar, bio) that were already proven. |
| `resolve-cache.json` | Durable, fresh for 24 hours | Name-to-address resolutions used when opening xites by name. Each entry is bound to the height and digest that verified it. A stale entry is resolved again when the chain is reachable and kept when it is not. |

**Clear xID Cache** on the Config page drops the cached answers so that the next lookup of any name is fetched and verified again.

## Settings

Config page fields are under **Epix Chain Config**. Keys without a Config page field are set in `private/config.json`.

| Setting | Where | Default | Effect |
| --- | --- | --- | --- |
| `chain_rpc_url` | Config page | `https://api.epix.zone` | REST endpoints for proofs and attestations, one per line. The node fails over to the next entry when one stops answering. |
| `xid_bootstrap_rpcs` | Config page | The four sources listed above | CometBFT RPC endpoints for the network-quorum bootstrap. |
| `xid_bootstrap_quorum` | Config page | `2` | How many sources must agree exactly. |
| `xid_lc_enabled` | `config.json` | `true` | Set to `false` to stop the light client. A static pin then expires on its 7-day window. |
| `xid_lc_interval_secs` | `config.json` | `3600` | Seconds between cycles once trusted. Values below 60 are ignored. |
| `xid_trusting_period_secs` | `config.json` | `1209600` | The trusting period. Values below 3600 are ignored. |
| `EPIX_CMT_RPC_URL` | Environment | `https://rpc.epix.zone` | The light client's primary CometBFT RPC endpoint. |
| `EPIX_XID_RPC_URL` | Environment | unset | Overrides the REST endpoint, for a local development chain. |

## Files

All of these are in the root of the [data directory](data-directory.md).

| File | Written by | Purpose |
| --- | --- | --- |
| `xid_pin.json` | You, optionally | An explicit trust anchor. |
| `xid_lc_pin.json` | The light client | The last verified validator set, for the next boot. |
| `xid_lc_state.json` | The light client | The last verified signed header and the next validator set. |
| `xid_finality_checkpoint.json` | The verifier | The highest accepted height and digest. Prevents rollback across restarts. |

Do not edit these files. Deleting `xid_lc_pin.json` and `xid_lc_state.json` makes the node bootstrap from the network again. A corrupt `xid_lc_state.json` is an error, not a silent reset.

## Providing your own pin { #own-pin }

Most nodes never need a pin file. If you want to hand the node its root of trust yourself, capture the full consensus validator set from a CometBFT RPC endpoint you trust:

```sh
python3 scripts/capture_xid_pin.py
python3 scripts/capture_xid_pin.py https://other-rpc.example
```

The script is in the node repository. It reads a settled recent height, fetches every bonded validator, derives each consensus address and writes `xid_pin.json`. Run it against a second independent endpoint and compare the output before you use it, because this file becomes the root of trust. Place it in the data folder and restart. The log then reports the number of pinned validators and that resolution requires attestation by more than two thirds.

Capture the full validator set, not only the validators that signed a particular block. The light client requires the pin to equal the validator set at the pin's height, so a pin that omits a validator never matches. Never invent or hand-edit a pin.

## Related pages

- [xID: names and identity](../start/xid.md): what xID is and how to use it.
- [xID for developers](../web3/xid.md): resolving and verifying names from a xite.
- [Node architecture](architecture.md): where `epix-chain` sits in the node.
- [Data directory layout](data-directory.md): every file the node keeps.
- [Glossary](../reference/glossary.md): short definitions of the terms used here.
