---
description: A summary of the cryptography behind EpixNet channels. The anonymous envelope pool, key agreement with X3DH and Double Ratchet, detection tags, the count-hiding multi-slot record, multi-device delivery, admission by proof of work or RLN, the group engine, and the known limits.
---

# Channel cryptography

Channels are EpixNet's metadata-private messaging layer. Epix Mail uses them, and any xite can carry private conversations over the same system. This page summarizes the cryptographic design as it is implemented in the node: how messages are sealed, how a recipient finds its own messages in a pool that everyone replicates, how sending is rate limited without identifying the sender, and what an observer can still learn. It is written for reviewers and contributors.

This page is a summary. The specifications in the node repository are the authority:

- [`docs/channel-crypto-spec.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/channel-crypto-spec.md): the pairwise protocol, with primitives, key derivations and parameters.
- [`docs/channels.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/channels.md): the design, the threat model and node configuration.
- [`docs/channel-count-privacy.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/channel-count-privacy.md): the multi-slot record.
- [`docs/channel-multi-device.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/channel-multi-device.md): delivery to several devices of one name.
- [`docs/channel-group-engine.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/channel-group-engine.md): the group engine.

To use channels from a xite, see [Messaging](../build/messaging.md) and the [messaging commands](../api/messaging.md).

!!! warning "Not externally reviewed"
    The specification describes the protocol as pre-production and review-gated. It has not had an external cryptographic review. It contains deliberate deviations from the published Signal specifications, which are listed below. Do not rely on channels where a failure of confidentiality or anonymity would put someone at risk.

## Vocabulary and layers

| Term | Meaning |
| --- | --- |
| Envelope | A sealed, size-padded, day-stamped, anonymous record. The unit on the wire. |
| Pool | The fully replicated set of envelopes that a xite hosts. Every node that has the xite has every envelope, so fetching one reveals nothing. |
| Channel | The encrypted audience an envelope is addressed to. A mail thread between two people is a channel with two members. |
| Engine | The cryptography that seals and opens envelopes for a channel. |
| Hub | The xite that holds the pool and every identity's public key bundle. By default it is the xID xite. |

The implementation is layered so that only the top layer knows about mail:

| Layer | Crate | Role |
| --- | --- | --- |
| Pool record class | `epix-content` (`pool.rs`) | The `epix-pool-1` record format, admission checks and the merge rule. Knows nothing about messaging. |
| Envelope engine seam | `epix-envelope` | The `Engine` trait, the trial-decrypt indexer and the multi-slot record. |
| Pairwise engine | `epix-pairwise-engine` | X3DH, Double Ratchet, header encryption and detection tags. |
| Group engine | `epix-group-engine` | Sender-Keys group messaging. A foundation only. |
| Private index | `epix-channel` | `private/channels.db`: decrypted threads and messages, search, ratchet sessions and the set of expected detection tags. |
| Rate limiting | `epix-rln` | Rate-Limiting Nullifiers for pools that require them. |

A page never touches key material. It calls the node's `channel*` commands, and only the results cross that boundary. The private index lives outside every xite folder, so peers cannot fetch it.

## The anonymous pool

Any xite can declare a pool in its root `content.json`. The node then maintains a grow-only set of records under the pool directory, split into files by week and by a fan-out bucket: `pool/w<week>/<xx>.json`.

A pool record has exactly these fields. Any other key is rejected, so that a record cannot carry a covert channel.

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | integer, `1` | Record version. |
| `epoch` | integer | Days since the Unix epoch. Time is only known to the day. |
| `tag` | base64, 32 bytes | A value that places the record in a shard. Opaque to the network. |
| `ct` | base64 | The sealed ciphertext, padded to one of the pool's bucket sizes. |
| `pow` | integer | The proof-of-work nonce. |
| `author` | `epix1` address | A fresh throwaway signer created for this one record. |
| `sign` | base64 | A recoverable signature by `author` over the record. |

A record has no sender, no recipient, no conversation identifier and no sequence number. Records are immutable: there are no edits and no tombstones. Deleting a message is a local action in your private index.

Merging two copies of a shard is a union of their verified records. A record is never removed because one side lacks it.

The owner-signed pool descriptor sets the rules for every record:

| Descriptor field | Meaning |
| --- | --- |
| `dir`, `class` | The pool directory and the record class (`epix-pool-1`). |
| `since_week` | The first week shards exist for. Earlier records are rejected. |
| `fanout` | How many shards a week is split into, by the first byte of `tag` (1 to 256). |
| `pow_bits` | The proof-of-work difficulty. |
| `pad_buckets` | The exact permitted ciphertext lengths. |
| `max_record_bytes`, `max_shard_bytes` | Size caps for a record and a shard file. |
| `sync_order` | `newest_first` (the default) or `oldest_first`, for history backfill. |
| `rln_required` | Whether records must also carry an RLN proof. |
| `retention_weeks` | How many weeks of history to keep. `0` keeps everything. |

## Admission: proof of work and RLN

Nobody is authorized to post by an access list, because that would identify senders. Admission is by cost.

### Proof of work

Every record must carry a nonce such that the double SHA-256 hash of its canonical signed payload has at least `pow_bits` leading zero bits. The nonce is inside the signed payload, so the work is done first and the record is signed afterwards. Verification is cheap. Posting costs real CPU time, which makes bulk spam expensive.

A node also rejects a record whose `epoch` is before the pool's start, further than one day in the future, or in the wrong week for its shard.

The channel hub's pool descriptor, as documented in the node repository, sets `pow_bits` to 20 with bucket sizes of 8192, 32768 and 131072 bytes.

### Rate-Limiting Nullifiers

A pool can additionally require an RLN proof by setting `rln_required`. It is off unless the pool owner sets it. With it on:

- The pool owner publishes a signed **roster** of member commitments (`rln_roster`) and a per-epoch allowance in units (`rln_limit`).
- A record's cost in units is its size bucket: the smallest bucket costs one unit, and a bucket `k` times larger costs `k` units. The cost is computed from the ciphertext alone, so a sender cannot understate it.
- Each record carries a zero-knowledge proof that the sender is on the roster and is spending fresh units of its allowance for that epoch. The proof does not reveal which member sent it.
- A member who spends the same unit twice in one epoch produces two shares from which that member's secret can be recovered. The record is dropped, and the identity can be removed from the roster. Detection does not depend on the order in which nodes see the records.
- On the sending side the node keeps a persistent per-epoch counter, so an unmodified client never reuses a unit and never exposes itself. Sending is refused once the allowance is used up.

The proof system is the `rln` crate from zerokit (a Groth16 circuit with Poseidon hashing). `epix-rln` is a thin layer over it. One allowance is shared by every identity a node holds, so the volume a node sends does not reveal how many identities it runs.

## Identity keys and bundles

Each linked xID identity on a node has its own channel identity. The engine receives a 32-byte seed that the node derives for that identity. The node's master seed never reaches the engine.

| Key | Derivation | Lifetime |
| --- | --- | --- |
| Identity key `IK` | `HKDF("epix-channel/ik/v1", ...)` over the seed | Permanent |
| Signed prekey `SPK(idx)` | `HKDF("epix-channel/spk/v1", ...)` over the seed followed by `idx`, the week number as a 32-bit little-endian integer | Rotates weekly |

Both are X25519 keys. There are **no one-time prekeys**, because there is no server to hand each one out once.

The node publishes a public bundle for each identity in the hub, in that identity's user directory:

```json title="data/users/alice.epix/data.json"
{
  "v": 3,
  "xid": "alice.epix",
  "auth": "epix1...",
  "ik": "<base64 identity public key>",
  "spk": "<base64 signed prekey public key>",
  "spk_idx": 2957,
  "auth_sig": "<signature by the linked address>"
}
```

`auth_sig` is a domain-separated signature by the linked address over the `v`, `xid`, `auth`, `ik`, `spk` and `spk_idx` values. Bundles without it are rejected. Setup is automatic: linking an identity derives its keys and publishes its bundle. An identity with channels turned off has no public bundle.

Whether a bundle really belongs to a still-valid device of a name is decided outside the engine, in three places:

1. The node verifies the signature on the user's `content.json`, accepting only active linked keys as signers.
2. The first message of a conversation proves knowledge of the sender's identity key, and the node requires that key to match one of the sender's published bundles (see [Anti-spoofing](#anti-spoofing)).
3. A bundle is dropped when the chain shows that its name has no active linked identity, or that its own address is no longer in the name's active set.

## Key agreement

The first message between two identities uses an X3DH-style agreement. Alice has her identity key and Bob's bundle.

1. Alice samples an ephemeral key `EK` whose public key has an Elligator2 representative. The representative becomes the first message's detection tag.
2. She computes three Diffie-Hellman values: `DH1 = DH(IK_A, SPK_B)`, `DH2 = DH(EK, IK_B)` and `DH3 = DH(EK, SPK_B)`.
3. The shared secret is `SK = HKDF("epix-channel/x3dh/v1", salt = 32 bytes of 0xFF, DH1 || DH2 || DH3)`.

Bob recovers `EK` from the tag, opens the first-contact header to learn Alice's identity key, and derives the same three values.

There is no signature over message content. Only the holder of `IK_A` could have produced `DH1`, so the sender is authenticated implicitly, and the message is deniable.

## Double Ratchet

After the first message, the conversation runs a Double Ratchet with header encryption:

- **Symmetric ratchet.** Each message key is derived from a chain key that is then advanced and discarded: `mk = HMAC(ck, 0x01)`, `ck' = HMAC(ck, 0x02)`.
- **DH ratchet.** Whenever a header carries a new ratchet public key, both sides mix a fresh Diffie-Hellman value into the root key. This restores secrecy after a temporary compromise.
- **Skipped keys.** Up to 64 message keys and 64 header keys are stored for out-of-order delivery. A larger jump is refused.
- **Encryption.** ChaCha20-Poly1305 with a 16-byte tag. The record's tag is the associated data.

Key derivation uses HKDF-SHA256 and HMAC-SHA256, the same primitives as the Signal specifications, with EpixNet's own context strings.

## Finding your own messages

Every node has every record, so a recipient needs a cheap way to recognize its own without decrypting everything and without a label that links records together.

### Established conversations: tag chains

Each direction of a conversation has a tag-chain key. For message `i`:

- `tag_i = HMAC(tck_i, "tag")` is the detection tag.
- `hk_i = HMAC(tck_i, "hdr")` is the key that encrypts the header.
- `tck_{i+1} = HMAC(tck_i, "chain")`, after which `tck_i` is deleted.

A session registers the next 64 expected tags in the private index. Detection is then a constant-time set lookup. Past tags cannot be linked to each other, because the chain state that produced them is gone. The window of 64 tags equals the skipped-key limit, so any record whose tag is registered can also be opened.

### First contact: Elligator2 tags

The tag of a first message is the Elligator2 representative of the sender's ephemeral public key. It is uniformly random to an observer and looks the same as an established tag. For a record that matches no registered tag, the node tries each local identity: decode the representative, compute one Diffie-Hellman value, derive the header key and attempt to open the first-contact header. The cost is one decode, one X25519 operation and one AEAD open per identity per candidate.

Established and first-contact records are indistinguishable on the wire. Both are a tag followed by opaque, padded ciphertext.

## One record per send

A message to a name must reach every device linked to that name. Posting one record per device would let a peer directly connected to the sender count the records in the burst and learn the recipient's device count. Linked identities are public on chain, so an unusual count could identify the recipient.

Every send is therefore **one fixed-width record** that carries 8 slots:

```text
ct = [ 8 x 32-byte detection tag ]    real tags and uniform random dummies
     [ 8 x 512-byte keyslot ]         a per-device seal of the message key, or a dummy
     [ 4-byte body length ][ body ]   one shared encrypted body
     [ random padding up to the bucket size ]
```

- The body is encrypted once under a fresh single-use key. Each real keyslot is an ordinary pairwise seal, for one device, of that key together with a hash of the encrypted body. A substituted body is therefore rejected.
- Dummy slots are uniformly random and have the same shape as real ones. Slots are shuffled, so the number of real destinations cannot be read from positions.
- The record's public `tag` is a fresh random value used only to place the record in a shard. The real detection tags are inside the ciphertext.
- A record with one destination and a record with eight are the same size.

A send to more than 8 destinations spans the minimum number of records. The first is posted at once. The rest are released from a background task with a random gap between them (`channel_burst_jitter_max_secs`, 60 seconds by default), so they do not arrive as one simultaneous burst.

The price of the constant width is a floor of about 8 KB per record.

## Several devices and identities

- **Each device has its own keys.** A device's identity key comes from its own node seed, so two devices of one name have different identity keys and publish separate bundles: the first device uses `data.json`, later ones `data-<address>.json`.
- **Sending reaches every device.** The node resolves every valid bundle of each recipient name and seals a slot for each.
- **Revocation is per device.** A bundle whose address the chain no longer lists as active for the name is dropped, and that exclusion is remembered across restarts.
- **Several identities on one node.** If one record addresses two identities held by the same node, each receives its own copy.
- **Read state is per device.** The private index is local to a node.

### Anti-spoofing { #anti-spoofing }

The first-contact header names the sender, and that text alone could be forged. The node therefore resolves every published bundle of the claimed sender and accepts the message only if the identity key proven by the key agreement equals one of them.

If none matches, the record is **deferred**, not discarded. Two cases look the same at that moment: a forgery, and a genuine message from a device whose bundle has not reached this node yet. A genuine message is indexed once the bundle arrives. A forgery never matches and is never attributed to anyone.

## The group engine

Small groups work today by sealing a slot for each member with the pairwise engine. `epix-group-engine` is the foundation for larger groups. It follows the Sender Keys design: each member owns a forward-secure message-key chain and a detection-tag chain per group, with a lookahead window of 256, and distributes its chain state to the other members once over existing pairwise sessions. One member then seals one record that every member can detect and open.

!!! danger "Do not rely on the group engine yet"
    Only the key-management core is implemented. Records are authenticated by a sender key that every member holds, so a member could forge a message as another member until per-sender signatures are added. Membership changes with rekeying and the node commands for groups are not built. The group engine is not wired into the node.

## What is and is not protected

Properties the design aims for, all subject to the pending review:

| Property | How |
| --- | --- |
| Confidentiality and integrity | X3DH-derived secrets, Double Ratchet message keys, authenticated encryption. |
| Forward secrecy for established messages | Chain keys and tag-chain keys are advanced and deleted. Ratchet state is random per session and cannot be recomputed from the seed. |
| Recovery after compromise | The DH ratchet adds fresh entropy on every round trip. |
| Sender anonymity | Each record is signed by a throwaway key. The sender's own copy is written to the private index and never posted. |
| Recipient anonymity | Detection is local. Everyone fetches everything. |
| Deniability | No signature covers message content. |

Known limits, stated in the specifications:

- **The first message has no forward secrecy against a later seed compromise.** Signed prekeys are a function of the seed for every week and are never deleted. Someone who later obtains the seed, and kept the pool, can recover the content and the sender of every first-contact message to that identity. Messages from the first reply onward are protected by the ratchet.
- **The tag chain does not heal after compromise.** Someone who learns a live tag-chain key learns all future tags and header keys for that direction. Message bodies still recover through the DH ratchet.
- **Your account is public.** That an xID has channels, its identity key, its current prekey and the number of linked devices are visible to anyone.
- **Coarse activity is visible.** An observer sees total pool volume, each record's size bucket and its day, and when bundles are updated.
- **A directly connected peer sees that you published something.** This is the largest residual. Running Tor in `always` mode addresses it. On other setups, `channel_send_jitter_max_secs` delays each send by a random time so the pool write is not tied to the moment you pressed send. It is off by default.
- **The private index is plain on disk by default.** Decrypted messages and ratchet state are stored in `private/channels.db`. Anyone who can read that file can read them. Turning on `channel_encrypt_at_rest` seals them under a key derived from the node's master seed. That protects a stray copy of the one file, but not against someone who has the whole data folder, because the seed is stored there too. Use full-disk encryption for that.
- **Stalled conversations.** If more than 64 consecutive records in one direction are lost, that direction stalls. The specification lists a user-visible "session stalled" signal as future work.

Tor and I2P change how traffic is routed. They do not guarantee anonymity, and the limits above apply with or without them. See [Privacy and routing](../start/privacy.md).

### Differences from the Signal specifications

1. HKDF-SHA256 and HMAC-SHA256 as in Signal, with different context strings.
2. X3DH passes the 32 bytes of `0xFF` as the HKDF salt instead of an input prefix, and has no one-time prekeys.
3. Elligator2 first-contact tags.
4. Forward-secure detection tag chains for constant-time matching over a replicated pool.
5. Header encryption keyed by the tag chain.
6. One Diffie-Hellman value (`DH2`) is used both inside the shared secret and for the first-contact header key, separated by context and salt.
7. Nonces are derived from the public tag.

The specification ends with an open review checklist covering each of these.

## Settings that affect privacy

| Setting | Default | Effect |
| --- | --- | --- |
| `channel_enabled` | `true` | Turns channels on or off for the node. |
| `channel_send_jitter_max_secs` | `0` (off) | Delays each send by a random time up to this many seconds. |
| `channel_burst_jitter_max_secs` | `60` | The random gap between the records of a send that spans several records. `0` disables it. |
| `channel_feed_per_identity` | `true` | Shows unread counts per identity on the dashboard. Turn it off on a shared screen so the dashboard does not show which identities the node holds. |
| `channel_feed_snippets` | `false` | Shows message snippets in the dashboard feed. |
| `channel_encrypt_at_rest` | `false` | Seals message content and ratchet state in the private index under a key derived from the node's master seed. Full-text search becomes slower. |
| `channel_allow_insecure_engine` | off | Development only. Runs a test engine that provides no confidentiality. |

## Related pages

- [Messaging](../build/messaging.md): using channels and local profiles from a xite.
- [Messaging commands](../api/messaging.md): the `channel*` command reference.
- [xID: names and identity](../start/xid.md): linking identities and devices.
- [Data directory layout](data-directory.md): where the private index is stored.
- [Glossary](../reference/glossary.md): short definitions of the terms used here.
