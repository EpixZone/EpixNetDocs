---
description: A conceptual tour of EpixNet. What a xite is, how signed content is verified, how peers find each other, how .epix names resolve, and what the trust model does and does not cover.
---

# How EpixNet works

This page gives you a working mental model of EpixNet: what a xite is, how your node finds and verifies content, how names and identities work, and where the limits are. It is written for new users who want to understand what the software does on their machine, and for developers who are about to build a xite. Every section links to the page that covers the topic in depth.

## The short version

EpixNet is a peer-to-peer web platform. Websites, called *xites*, are folders of files that live on the computers of the people who visit them. There is no origin server.

1. A xite is identified by an address such as `epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g`. The address is derived from a public key.
2. The owner lists every file of the xite in a manifest named `content.json` and signs that manifest with the matching private key.
3. When you open a xite, your node asks trackers, a distributed hash table and other peers who has it, downloads the manifest, checks the signature against the address, then downloads the files and checks each one against the hashes in the manifest.
4. Your node keeps a copy and serves it to other peers, so every visitor adds a little capacity.
5. When the owner publishes a change, peers receive a new signed manifest, verify it, and fetch only what changed.
6. Human-readable names such as `talk.epix` are registered on Epix Chain through xID and resolved by your node with a cryptographic proof.

The node is written in Rust. The same core runs on Windows, macOS, Linux, Android and iOS, although features and release availability vary by platform. On desktop it ships with EpixNet Browser, a managed Firefox with the Epix Wallet built in. See [Install EpixNet](install.md) to get it running.

!!! note "What EpixNet does not promise"
    A xite loads only while a copy is available locally or from a reachable peer. A valid signature proves who published the content, not that the content is safe or lawful. Tor and I2P support change how traffic is routed but do not guarantee anonymity. The sections below explain each of these limits.

## Xites

A xite is a directory of ordinary web files (HTML, CSS, JavaScript, images, JSON data) plus a signed `content.json`. Your node stores each xite in its own folder, named after the xite address, inside the `data` subfolder of your node's [data folder](running.md).

A xite can be a static page, but most are applications. The page runs in your browser and talks to your local node through the [EpixFrame API](../api/index.md) to read files, query a database, sign and publish user content, and more. Forums, mail, social feeds, wikis and video libraries are all built this way. [Featured xites](apps.md) shows what exists today.

There is no server-side code. Anything dynamic happens in the visitor's browser and in the visitor's own node.

## Addresses and keys

Every xite has a key pair on the secp256k1 curve.

- The **private key** signs the xite's manifest. Whoever holds it can publish updates. The node never sends it to peers or exposes it to pages.
- The **address** is computed from the public key: the Keccak-256 hash of the 64-byte uncompressed public key (its X and Y coordinates), reduced to its last 20 bytes, encoded as bech32 with the prefix `epix`. That is why every address starts with `epix1`.

Because the address is a function of the public key, nobody can publish under an address without the matching private key, and no registry is needed to hand out addresses. You create a xite locally and it has a globally unique address at once.

Your node holds a *master seed* in `private/users.json`. Keys for the xites you create are derived from it, and a newly created xite records the derivation index (`address_index`) in its signed `content.json` so that another installation with the same seed can recover the owner key. [Sign and publish](../build/publishing.md) covers key backup and recovery.

!!! warning "Keep keys private"
    A leaked private key gives someone else full control of the xite. A lost key with no backup means the xite can never be updated again. Back up your keys before you publish anything you care about. See [Dashboard and sidebar](dashboard.md) for the backup wizard.

## Signed content

### The manifest

`content.json` at the root of a xite is both its metadata and its signed file inventory. A trimmed example:

```json title="content.json"
{
 "address": "epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g",
 "title": "Dashboard",
 "description": "Epix Dashboard",
 "domain": "dashboard.epix",
 "inner_path": "content.json",
 "modified": 1783901827,
 "files": {
  "index.html": {
   "sha512": "<hash>",
   "b3": "<hash>",
   "size": 3919
  }
 },
 "signs": {
  "epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g": "<signature>"
 }
}
```

- `files` maps each path to its size and hashes. `sha512` is the first 32 bytes of a SHA-512 digest. `b3` is the BLAKE3 hash used by EDX, the transfer protocol described [below](#how-files-move-edx).
- `modified` is a Unix timestamp that acts as the xite's version. A manifest only replaces a stored one when it is newer.
- `signs` holds the signature. The signed payload is the whole manifest with the signature fields removed, serialized in a fixed canonical form, so any change to any field or file entry invalidates it.

The full field list is in the [content.json reference](../build/content-json.md).

### What your node checks

Before a manifest from a peer is accepted, your node verifies that:

- the signature recovers to an address that is allowed to sign this manifest. The xite address itself is always valid. An owner can also delegate to a list of other signers;
- the manifest names the right address and path, and every file path is a valid relative path;
- the declared sizes fit the size limit you have allowed for that xite.

Each file is then verified against the hash in the manifest as it downloads. Data that does not match is discarded.

A xite can be split into several signed units. The root manifest can list other manifests under `includes`, each with its own permitted signers, and a `user_contents` section defines rules for manifests that visitors sign themselves. This is how a forum lets thousands of people write to one xite without sharing the owner's key. See [Identity and user content](#identity-and-user-content).

## What happens when you open a xite

<figure class="epix-diagram-figure" markdown="0">
<div class="epix-diagram">
--8<-- "docs/en/img/diagrams/visit-flow.svg"
</div>
<figcaption>Opening a xite: every byte a peer sends is checked against the signed manifest before it is used.</figcaption>
</figure>

1. **You enter an address or a name.** In EpixNet Browser you type `talk.epix`. With a system browser you open `http://127.0.0.1:42222/talk.epix/` or the same URL with the `epix1` address.
2. **Names are resolved.** If you used a `.epix` name, the node resolves it to an address through xID. See [Names](#names-epix-through-xid).
3. **The wrapper loads.** The node serves a small trusted page called the *wrapper*. It shows a loading screen, owns the connection to the node, and embeds the xite in a sandboxed iframe.
4. **Peers are found.** The node looks for peers that have the xite. See [Peers and discovery](#peers-and-discovery).
5. **The manifest is fetched and verified**, then the files. The files a page needs to draw are fetched first so the page can appear before the whole xite has arrived.
6. **The xite is stored and shared.** From now on it opens from your disk, including when you are offline, and your node serves it to other peers.

By default a xite may use up to 1000 MB of storage. If a xite is larger, the wrapper asks before raising the limit.

Not everything is downloaded up front. Files the owner marks as *optional*, such as videos and large images, are fetched when you open them. You can change this per xite in the [xite sidebar](dashboard.md) and set node-wide defaults on the Config page. See [Files, media and EDX](../build/files.md).

## Peers and discovery

A *peer* is another node that has, or wants, the same xite. Your node keeps a peer list per xite and uses several independent ways to fill it.

| Mechanism | How it works | Default |
| --- | --- | --- |
| Epix trackers | Nodes that answer announce requests over the peer protocol. Your node tells a tracker which xite it has and gets back other peers. Trackers can be reached over TCP, Tor onion services or I2P. | On. A built-in list is used, and every node also answers announces from others unless you turn that off. |
| BitTorrent trackers | Public BitTorrent trackers are used as a neutral meeting point. Nodes announce a hash of the xite address and find each other. No torrent data is involved. | On in builds that include the BitTorrent feature. The iOS build omits it. |
| DHT | A private Kademlia distributed hash table, keyed by a hash of the xite address. It runs over the same peer connections as everything else and keeps working for rare xites or when trackers are unreachable. | On |
| Peer exchange | Your node asks a connected peer for other peers of the same xite. | On |
| Tracker exchange | Nodes share their working tracker lists with each other, so the tracker set stays current without a shipped list. | On |
| LAN discovery | UDP broadcast on port 1544 finds peers on the same IPv4 subnet, with no Internet, tracker or DNS. | Off. While it is on, your node answers anyone on the local network with the list of xites it serves. |
| Reticulum mesh | Verified mesh announcements supply peers for xites you have already requested, over TCP links or nearby radios. | Off |
| Manual | You can add a peer by hand in the xite sidebar. | Always available |

Trackers and the DHT only tell your node *where peers are*. They never deliver content, and nothing they say is trusted: whatever a peer sends is still verified against the signed manifest.

To be reachable, a desktop node listens for peers on a TCP port (26552 by default, or the next free port) and tries to open it on your router with UPnP. An open port is not required to browse. A node without one can still connect out to others, and in the default Tor mode it also hosts an onion service that Tor-capable peers can reach. Phones do not accept incoming clearnet connections. See [Run a node](running.md) for ports and [Privacy and routing](privacy.md) for the details.

## How updates spread

When an owner signs and publishes a change, the new manifest is pushed directly to connected peers. Each receiving node verifies it, fetches the changed files and passes the news on.

Nodes that were not connected at that moment catch up through three background loops:

| Loop | Default interval | Purpose |
| --- | --- | --- |
| Update hints | 30 seconds | Polls peers for a short log of "xite X changed" notifications, then syncs those xites right away. A hint is not trusted: it only triggers a normal, verified sync. |
| Resync | 5 minutes | Checks each xite's peers for a newer manifest. |
| Announce | 20 minutes | Re-announces your xites to trackers and refreshes peer lists. |

A node that wakes from sleep notices the clock jump and announces again immediately. Between well-connected nodes a new forum post can appear within seconds, but there is no delivery guarantee: propagation depends on which peers are reachable.

## How files move: EDX

EDX (Epix Data eXchange) is the single peer protocol. The same protocol runs over direct TCP, Tor, I2P and Reticulum mesh links.

- **Content addressing.** Every file is identified by the BLAKE3 hash of its bytes, recorded as `b3` in the manifest.
- **Verified streaming.** Files travel as *verified slices*. Each slice carries the hash-tree nodes needed to check it, with a granularity of 16 KiB. A node can request any byte range of a file and verify it without downloading the rest, which is what makes seeking in a video work.
- **Bundles.** Many xites consist of hundreds of small files. Small files are packed into bundles so that they arrive in a few requests.
- **Encryption on the wire.** Direct TCP connections are encrypted and authenticated with the Noise protocol. Tor, I2P and mesh links rely on the encryption of their own transport.
- **Reciprocity.** Serving is generous by default. When more peers ask than a node can serve at once, peers that have shared more are served first. No payment is involved in reading, posting or seeding.

[EDX distribution](../internals/edx.md) describes manifests, slices and the wire protocol in detail.

## Names: .epix through xID

Addresses are precise but hard to remember. *xID* is the naming and identity system of Epix Chain. A name such as `talk.epix` is registered on chain by its owner, who can attach records to it. One of those records carries a xite address.

When you open a `.epix` name, your node:

1. asks a chain endpoint for the name's record together with a Merkle inclusion proof;
2. checks the proof against a chain state digest;
3. checks that the digest was signed by validators holding more than two thirds of the voting power, using a validator set that the node tracks with a built-in light client.

A chain endpoint that returns a forged record fails these checks. When verification cannot be completed, resolution fails rather than falling back to an unverified answer.

A fresh install establishes its first trusted validator set only when several independent chain endpoints agree. The endpoints and the required quorum are listed under **Epix Chain Config** on the Config page.

Two details are worth knowing:

- A xite can state the name it expects in the `domain` field of its `content.json`. This is a claim that is checked against the xID record. Setting it does not register a name.
- Name resolution needs the chain. On an offline LAN or mesh, use the `epix1` address directly.

For registering and managing names, see [xID names and identity](xid.md). For the verification design, see [xID light client](../internals/xid-light-client.md).

## Identity and user content

Browsing needs no account and no identity. Writing is different: a post, a comment or a vote has to be signed by someone.

- **Your node holds your keys.** The master seed and the identities derived from it live in `private/users.json` in your data folder. They are never sent to peers or exposed to pages.
- **An identity is a linked xID.** You register a name such as `alice.epix`, link an identity address from your node to it on chain, and choose which identity each xite uses. A xite can also be set to use no identity at all.
- **User content is signed by the user.** In a typical xite your data lives in `data/users/alice.epix/`, with its own small `content.json` signed by your identity key. The xite owner never sees or needs your key.
- **The owner sets the rules.** A manifest signed by the owner defines which files a user may write, how large they may be, and which identities are accepted. For xID users, peers confirm against the chain that the signing key really is linked to the name. Every node enforces these rules when it verifies user content, so a modified client cannot bypass them.

Some xites accept *local profiles* instead: signing identities created by the node for one xite, with no chain registration. They make chat possible on a network with no Internet access. See [Channels and local profiles](../build/messaging.md).

[User content](../build/user-content.md) explains permission rules, size limits and moderation.

## The database

Reading thousands of small JSON files from JavaScript would be slow, so a xite can ship a `dbschema.json` that maps its JSON data files to SQL tables. The node builds a SQLite database from the files and keeps it current as files arrive. Pages query it with SQL through the API.

The database is a local index, not shared state. It is never sent to peers. Every node builds its own copy from the same signed files, and it can be rebuilt at any time. See [Database](../build/database.md).

### Merge files

Classic user data files have one weakness: two devices writing the same file overwrite each other. For data such as posts and votes, xites can declare *merge files*. A merge file is a set of individually signed records. Nodes combine the records they hold with the records they receive and never drop a record because one side lacks it, so concurrent writers converge instead of colliding. See [Files, media and EDX](../build/files.md).

## Private messaging: channels

Signed user content is public by design. For private communication the node provides *channels*.

A channel message is sealed into an *envelope* and posted to a shared pool that all participating nodes replicate. Envelopes are padded to fixed sizes, carry only a day-level timestamp, and are posted under one-time keys, so the pool does not show who wrote to whom. Each node tries to open every envelope locally and keeps the ones addressed to it in a private index that is never shared. Posting requires a small proof of work to limit spam.

Epix Mail is the first application built on channels, and any xite can request its own channel scope. The design has documented limits, for example a peer you are directly connected to can see that your node sent something unless you route through Tor. See [Channels and local profiles](../build/messaging.md) and [Channel cryptography](../internals/channels-crypto.md).

## Routing: direct, Tor, I2P and mesh

Peer connections can travel over several transports. The node combines them, so a xite can be fetched from a mix of peers.

| Transport | Peer address looks like | Notes |
| --- | --- | --- |
| Direct (clearnet) | IP address and port | Fastest. The peer sees your IP address. |
| Tor | `.onion` | Tor runs inside the node. No separate Tor program is needed. |
| I2P | `.b32.i2p` | Uses an embedded router or an external one you already run. |
| Reticulum mesh | `rns:` destination | For links without Internet, including LAN and radio. Off by default. |

The Tor setting has three modes:

| Mode | Behavior |
| --- | --- |
| `disable` | Tor is off. Onion peers are unreachable. |
| `enable` (default) | Onion peers are reached through Tor, and your node hosts an onion service. Other peers are still dialed directly, and those peers and the trackers see your IP address. |
| `always` | All peer traffic is routed through Tor or I2P. The node waits for Tor to be ready before it dials anything. |

!!! warning "Enabling Tor is not the same as being anonymous"
    In the default mode your node still makes direct connections. Browser traffic and wallet traffic have their own routing controls. Even in `always` mode, what you publish under an identity is public, and a xite's page may call ordinary web services, which travel directly or through Tor depending on the browser's routing setting. Read [Privacy and routing](privacy.md) before you rely on any of this.

## The page sandbox

A xite is code written by someone you may not know, running in your browser next to a node that holds your keys. The wrapper is what keeps the two apart.

- The xite page runs in a sandboxed iframe. It cannot read the wrapper or other xites.
- The page has no direct connection to the node. It sends commands to the wrapper with `postMessage`, and the wrapper forwards them. The [EpixFrame](../libraries/epixframe.md) library hides this plumbing.
- Each command is checked against what that xite is allowed to do. Administrative commands require the `ADMIN` permission, which only the Dashboard holds by default.
- Extra abilities are granted one at a time through a prompt drawn by the wrapper, never by the page itself. Examples are reading the xites of a merger type (`Merger:<type>`), reading another xite's files (`Cors:<address>`), or using channels.

In EpixNet Browser, and when you use a local node through a system browser, each xite also gets its own browser origin, so its storage is separate from every other xite.

[Sandbox and security](../build/sandbox.md) has the full model.

## What stays on your machine

| Stays local | Shared with peers |
| --- | --- |
| Your master seed, identity keys and xite owner keys (`private/users.json`) | The signed files of xites you have downloaded |
| Node settings and the list of xites you hold | Content you sign and publish, such as posts, comments and profile data |
| The SQL databases built from xite files | The fact that your node has, or is asking for, a given xite |
| The decrypted index of your channel messages | Sealed channel envelopes, which every participating node replicates |
| Files you edited but have not signed | Your node's reachable addresses (IP, onion, I2P) so that others can connect |
| Browser profile and wallet data | |

Two consequences follow. First, peers and trackers can observe which xites a node at a given address is interested in, which is why routing matters. Second, a desktop node can donate disk space to hold *encrypted shards*: pieces of private files that it stores and serves but cannot read. The default donation is 2 GiB on desktop and 0 on phones. You change it under **Storage** on the Config page, and setting it to 0 turns it off.

## The trust model in one place

### What is verified

- A manifest was signed by a key that is authorized for that xite or user directory.
- Every file your node accepts from a peer matches the hash in a verified manifest.
- A `.epix` name maps to an address according to finalized chain state.
- A user's content was signed by an identity that the chain links to the name it claims.

### What is not verified

- *Whether content is safe, true or lawful.* The signature identifies the publisher's key. Nothing more.
- *Whether a xite's code deserves your trust.* The sandbox limits what a page can do. Granting `ADMIN` or `NOSANDBOX` removes those limits, so grant them only to xites you trust completely.
- *Availability.* If no reachable peer holds a file and you do not have it, it cannot load.
- *Your local files.* Verification gates what your node accepts from the network. Files already in your data folder, including your own unsigned edits to a xite you own, are served to your browser as they are. Peers will not accept those edits until you sign them.
- *The owner's intentions.* An owner can publish any update, including one that removes content or changes how the xite behaves. Updates are applied automatically.

## Where to go next

<div class="grid cards" markdown>

- :material-download: **Install and run**

    Pick your platform in [Install EpixNet](install.md), then learn the run modes in [Run a node](running.md).

- :material-view-dashboard-outline: **Look around**

    Tour the [Dashboard and sidebar](dashboard.md) and try the [featured xites](apps.md).

- :material-shield-lock-outline: **Understand the privacy limits**

    Read [Privacy and routing](privacy.md) before relying on Tor or I2P.

- :material-rocket-launch-outline: **Build something**

    Follow the [quick start](../build/quickstart.md) to publish your first xite, then read [Anatomy of a xite](../build/anatomy.md).

- :material-book-open-variant: **Look up a term**

    The [glossary](../reference/glossary.md) defines every term used in these docs.

- :material-help-circle-outline: **Common questions**

    The [FAQ](../faq.md) answers the questions that come up most often.

</div>
