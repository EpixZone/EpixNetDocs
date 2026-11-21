---
description: Definitions of the terms used across the EpixNet documentation, from xite and wrapper to EDX, channels and xID.
---

# Glossary

Short definitions of the terms you meet in these docs, in alphabetical order. Each entry links to the page that explains the topic in depth. If you are new to EpixNet, read [How EpixNet works](../start/how-it-works.md) first: it introduces most of these terms in context.

Names in `code font` are literal: file names, fields, permissions or settings that appear exactly as written.

## A

### Address

See [xite address](#xite-address). The same format is used for identity addresses, see [auth address](#auth-address).

### ADMIN

A [permission](#permission) that lets a xite administer the whole node: change settings, list and delete xites, read logs and more. Only the Dashboard holds it by default, and granting it to another xite means trusting that xite's developer completely. See [Admin commands](../api/admin.md).

### ajax_key

A random secret the node keeps for each xite. A page obtains it from the [wrapper](#wrapper) with `wrapperGetAjaxKey` and adds it to its own HTTP requests for xite files, so that they are accepted from a sandboxed origin. EpixFrame's `monkeyPatchAjax()` adds it to `fetch` and `XMLHttpRequest` requests for the node's own host (EpixFrame 1.0.x: to `XMLHttpRequest` only). It is never included in `siteInfo` or other data a page can read back. See [Sandbox and security](../build/sandbox.md).

### Announce

To tell a [tracker](#tracker) or the [DHT](#dht) that your node has a xite and to ask for other peers that have it. By default the node re-announces every 20 minutes.

### Auth address

The address of the identity key a user signs content with. For an [xID](#xid) user it is an address that the chain links to the user's name, which is how other nodes confirm that a post really comes from `alice.epix`. See [User content](../build/user-content.md).

## B

### b3

The field in a [content.json](#contentjson) file entry that holds the BLAKE3 hash of the file's bytes. [EDX](#edx) uses it to identify and verify the file.

### Big file

A large file that a page uploads through the dedicated upload command `bigfileUploadInit` instead of an ordinary file write. Big files are usually also [optional files](#optional-file). See [Files, media and EDX](../build/files.md).

### BitTorrent bridge

A node feature that fetches media referenced by a magnet link and streams it to a xite through a local endpoint. It is included in desktop and Android builds and left out of the iOS build.

### Bridge

A way to reach the Tor network when direct Tor connections are blocked. EpixNet builds with bridge support can use a built-in Snowflake bridge, enabled with **Use Tor bridges** on the Config page. See [Privacy and routing](../start/privacy.md).

### Bundle

A packed object that holds many small files of a xite so that they can be fetched in a few requests instead of one request each. Bundle membership is recorded in the signed [manifest](#manifest). See [EDX distribution](../internals/edx.md).

## C

### Cert

Short for certificate: the fields in a user's signed manifest (`cert_user_id`, `cert_sign` and related) that bind the signing key to a name. For xID the user id has the form `alice@xid.epix`, and nodes check the binding against the identities the chain links to that name.

### cert_signers

The part of a xite's [user content](#user-content) rules that says which identity providers are accepted. The entry `"xid.epix": ["chain"]` delegates the decision to Epix Chain, meaning any identity linked to an xID name is accepted.

### Channel

An encrypted conversation with a defined set of members, carried as sealed [envelopes](#envelope) in a shared [pool](#pool). A one-to-one mail thread is a channel with two members. See [Channels and local profiles](../build/messaging.md).

### Channel hub

The xite that holds the channel [pool](#pool) and every identity's public key bundle. By default it is the xID xite, and the node adds it automatically when channels are enabled.

### CHANNELS

A [permission](#permission) that lets a xite read and send in your whole private message inbox, across every app. The narrower form `Channels:<app>` covers only the threads of one named app.

### Clearnet

The ordinary Internet, as opposed to Tor, I2P or a mesh. A clearnet peer connection is a direct TCP connection in which each side sees the other's IP address.

### Clone

To copy a xite into a new xite with a new address and a key that you hold. A xite signals that it is meant to be cloned with `"cloneable": true` in its `content.json`. See [Sign and publish](../build/publishing.md).

### Config page

The settings page of the node's web interface, served at `/Config`. It edits the values stored in `private/config.json`. See [Dashboard and sidebar](../start/dashboard.md).

### content.json

The signed [manifest](#manifest) of a xite, or of one separately signed part of a xite such as a user's directory. It lists every file with its size and hashes and carries the signature. See the [content.json reference](../build/content-json.md).

### Cors permission

The [permission](#permission) `Cors:<address>`, which lets one xite read files of another xite. It is requested through the wrapper and granted by the user.

## D

### Dashboard

The xite that acts as the control panel of your node, at `dashboard.epix`. See [Dashboard and sidebar](../start/dashboard.md).

### Data folder

The directory where the node keeps everything: `data` holds the xites and `private` holds keys and settings. Also called the data directory. See [Data directory](../internals/data-directory.md).

### dbschema.json

A file in a xite that maps its JSON data files to SQL tables. The node uses it to build a local SQLite database that pages can query. See [Database](../build/database.md).

### DHT

Distributed hash table. EpixNet runs a private Kademlia DHT, keyed by a hash of the xite address, as a way to find peers that does not depend on trackers. See [Peer protocol](../internals/protocol.md).

### distribution

A field in `content.json` in which the owner declares, per path, how content should be kept: as a unit (`package`, `feed` or `file-refs`) and with which retention (`complete` or `partial`). See [Files, media and EDX](../build/files.md).

### domain

A field in `content.json` in which a xite states the `.epix` name it expects to be reached by. It is a claim that the node checks against the xID record. Setting it does not register a name.

## E

### EDX

Epix Data eXchange: the peer protocol and content distribution system of EpixNet. Files are identified by BLAKE3 hashes and transferred as [verified slices](#slice), over direct TCP, Tor, I2P or mesh links. See [EDX distribution](../internals/edx.md).

### Envelope

A sealed, size-padded message record in a channel [pool](#pool). It carries no sender, recipient or conversation identifier, and its timestamp is only precise to the day.

### .epix name

A human-readable name such as `talk.epix`, registered on Epix Chain through [xID](#xid). A name can point to a xite address and can have identities linked to it. See [xID names and identity](../start/xid.md).

### Epix Chain

The blockchain that stores `.epix` names and identities and runs EVM smart contracts. Its mainnet chain ID is `epix_1916-1`, and its EVM chain ID is 1916 (`0x77C`). See [Epix Chain for xites](../web3/index.md).

### EpixFrame

The bridge between a xite page and the node. The term covers both the command API a page can call and the small JavaScript library that implements the messaging with the [wrapper](#wrapper). See the [API overview](../api/index.md) and the [EpixFrame library](../libraries/epixframe.md).

### EpixKit

A dependency-free JavaScript library for connecting a wallet in a xite. It discovers installed wallets, shows a picker, and handles chain switching. See [EpixKit](../libraries/epixkit.md).

### EpixNet Browser

The desktop application that bundles the node with a managed Firefox and the [Epix Wallet](#epix-wallet), so that `.epix` names load like ordinary web addresses. See [Browser and wallet](../start/browser-wallet.md).

### epix-server

The node's command line binary. It starts the node and also provides authoring and diagnostic actions such as `siteCreate` and `siteSign`. See [Run a node](../start/running.md).

### Epix Wallet

The wallet embedded in the EpixNet shells. It is a fork of Keplr with Epix Chain built in. See [Browser and wallet](../start/browser-wallet.md).

### EVX

Epix Virtual eXecution: a runtime that runs WebAssembly programs published by xites on the user's machine, inside a sandbox, with access only to capabilities the user has granted. See [EVX programs](../build/evx.md).

### Extension

A Firefox WebExtension that a xite publishes as a signed file and that a user installs through the extension manager on desktop or Android. The source code calls these addons. See [Browser extensions](../build/extensions.md).

## F

### Feed

A stream of updates built from xite data. A xite can register feed queries with `feedFollow`, and the Dashboard's activity feed shows the results across all xites. See [Feeds and search](../build/feeds-search.md).

### File server

The part of the node that accepts connections from other peers and serves them xite data. It listens on TCP port 26552 by default.

### files_optional

The section of `content.json` that lists [optional files](#optional-file). Required files are listed under `files`.

### Finality

The property that a piece of chain state can no longer be reverted. The node only accepts an xID answer when the state it is proven against was signed by validators holding more than two thirds of the voting power. See [xID light client](../internals/xid-light-client.md).

## H

### Headless

Running the node without opening a browser, by setting `EPIX_HEADLESS=1`. Used on servers.

### Hub

A xite that holds the data of a [merger xite](#merger-xite). For example, Epix Post is an application, and the posts live in separate hub xites. A hub declares its type in the `merged_type` field of its `content.json`. For the messaging meaning, see [channel hub](#channel-hub). See [Merger xites and hubs](../build/merger-hubs.md).

## I

### I2P

An anonymity network that EpixNet can use as a peer transport. I2P peers have `.b32.i2p` addresses. The node can run an embedded I2P router or use an external one. See [Privacy and routing](../start/privacy.md).

### Identity

An xID name that you have linked to an address held by your node, together with the key for that address. A node can hold several identities, has one default, and lets you choose a different one, or none, per xite. See [xID names and identity](../start/xid.md).

### includes

A field in `content.json` that hands part of a xite to a separate signed manifest, with its own list of permitted signers. User content directories are attached this way.

### inner_path

The path of a file relative to the root of its xite, for example `data/users/content.json`. API commands use inner paths to name files.

## L

### LAN discovery

Finding peers on the local network with UDP broadcast on port 1544, without Internet, trackers or DNS. It is off by default, because a node that takes part tells anyone on the network which xites it serves. See [Privacy and routing](../start/privacy.md).

### Light client

The part of the node that follows Epix Chain's validator set by verifying signed block headers, so that xID answers can be checked without trusting any single chain endpoint. See [xID light client](../internals/xid-light-client.md).

### Local profile

A signing identity that the node creates for one xite and one user, without an xID or any chain contact. Xites use local profiles for public messages and small encrypted groups, for example on networks without Internet access. Requires the `LOCAL_PROFILE` permission. See [Channels and local profiles](../build/messaging.md).

## M

### Manifest

The signed list of a xite's files and metadata. In EpixNet the manifest is the file [content.json](#contentjson).

### Master seed

The secret from which your node derives your keys. It is stored in `private/users.json` and is the most important thing to back up.

### Merge file

A data file made of individually signed records that nodes combine instead of overwriting, so that edits from several devices or users converge. The current record format is named `epix-orset-1`. See [Files, media and EDX](../build/files.md).

### Merger xite

A xite that reads the data of several other xites of one type, its [hubs](#hub), as if they were one data set. It needs the permission `Merger:<type>`. See [Merger xites and hubs](../build/merger-hubs.md).

### Mesh

See [Reticulum](#reticulum).

### modified

The Unix timestamp in `content.json` that serves as the version of a manifest. A node replaces a stored manifest only with a newer one.

### Mute

To hide the content of one user on your own node. Muting is a local choice and does not affect other nodes.

## N

### Node

A running instance of the EpixNet software. It stores xites, verifies and exchanges content with peers, and serves the local web interface that your browser talks to.

### NOSANDBOX

A [permission](#permission) that removes the origin isolation of a xite's frame. A xite that holds it could act with the wrapper's authority, so the prompt describes it as full trust. See [Sandbox and security](../build/sandbox.md).

## O

### Onion service

A Tor address ending in `.onion` under which a node can be reached without revealing its IP address. In the default Tor mode the node hosts one for its file server.

### Optional file

A file that is listed in the manifest but downloaded only when needed, for example a video. The owner marks files as optional with the `optional` pattern in `content.json`. See [Files, media and EDX](../build/files.md).

### order_policy

A field in `content.json` in which the owner declares which files to fetch first (`first_paint`), how a feed should be ordered, and what to prefetch.

### Owner

Whoever holds the private key of a xite and can therefore sign its root manifest. The sidebar's **This is my xite** switch tells your node that you own a xite.

## P

### Peer

Another node that your node exchanges data with. Peers are tracked per xite and can be reached by IP address, onion address, I2P address or mesh destination.

### Peer exchange

Asking a connected peer for other peers of the same xite. Often abbreviated PEX.

### Permission

A named ability that a xite does not have until the user grants it through a prompt drawn by the wrapper. Examples are `ADMIN`, `NOSANDBOX`, `CHANNELS`, `Channels:<app>`, `LOCAL_PROFILE`, `Merger:<type>` and `Cors:<address>`. See [Sandbox and security](../build/sandbox.md).

### permission_rules

The part of a xite's [user content](#user-content) rules that says which files a user may write and how large they may be. Every node enforces these rules when it verifies a user's manifest.

### Pool

The shared set of sealed [envelopes](#envelope) that carries channel messages. Every participating node replicates the whole pool and tries to open each envelope locally, so fetching reveals nothing about who a message is for. A xite declares a pool in the `pool` field of its `content.json`.

### Private key

The secret half of a key pair. A xite's private key signs its manifest, and an identity's private key signs that user's content. The node stores private keys in `private/users.json` and never sends them to peers or pages.

### Proof of work

A small computation that must be performed before a record is accepted. The channel pool requires one for every envelope to make spam costly.

### Publish

To send a newly signed manifest to peers so that they fetch the changes. Signing and publishing are separate steps. See [Sign and publish](../build/publishing.md).

## R

### Record

One individually signed entry in a [merge file](#merge-file), such as a post, a vote or a page revision. The node signs records with the `recordSign` command, using the user's identity key.

### Resync

The periodic check, every 5 minutes by default, in which the node asks a xite's peers whether a newer manifest exists.

### Reticulum

A mesh networking stack that EpixNet can use as a peer transport over TCP links and, on Android, nearby Bluetooth or Wi-Fi Aware radios. It is off by default. See [Privacy and routing](../start/privacy.md).

### RLN

Rate-limiting nullifier: a zero-knowledge technique that lets a pool limit how much each member may post without revealing which member posted. A pool owner can require it for a pool. See [Channel cryptography](../internals/channels-crypto.md).

## S

### Sandbox

The isolation that keeps a xite page away from the node, the wrapper and other xites. The page runs in a restricted iframe and can reach the node only through commands that the wrapper forwards. See [Sandbox and security](../build/sandbox.md).

### Seeding

Serving the xites your node holds to other peers. Setting the file server port to `0` disables it.

### Shard

An encrypted piece of a private file, stored and served by nodes that cannot read it. The owner selects files for this treatment with the `shard` pattern in `content.json`. A desktop node donates a configurable amount of disk space to holding shards.

### Sidebar

The panel that slides out over a xite and shows its peers, files and settings, along with the ownership and signing controls. See [Dashboard and sidebar](../start/dashboard.md).

### Sign

To compute a signature over a manifest with a private key, after recalculating the file list and hashes. Peers accept only content that is signed by an authorized key.

### Signer

An address that is allowed to sign a given manifest. The xite address is always a valid signer of the root manifest. Owners can name additional signers, including xID names, in the `signers` lists of `content.json`.

### Size limit

The maximum storage a xite may use on your node, 1000 MB by default. The wrapper asks before raising it.

### Slice

A verified slice is the unit in which [EDX](#edx) transfers file data: the requested byte ranges together with the hash-tree nodes needed to check them. Data is verified in groups of 16 KiB as it arrives.

## T

### Tor

An anonymity network that EpixNet can use as a peer transport. Tor runs inside the node, so no separate Tor program is needed. The `tor` setting has the modes `disable`, `enable` and `always`. See [Privacy and routing](../start/privacy.md).

### Tracker

A service that tells nodes which peers have a given xite. EpixNet uses Epix trackers, which are ordinary nodes answering announce requests, and public BitTorrent trackers as a meeting point. A tracker never delivers content.

## U

### UPnP

A router feature that lets a program open a port automatically. A desktop node uses it to make its file server port reachable.

### User content

Data that visitors write into a xite, such as posts and votes. Each user's files live in their own directory under a path such as `data/users/`, with a manifest signed by that user's identity. The xite owner sets the rules in a `user_contents` section. See [User content](../build/user-content.md).

### users.json

The file `private/users.json` in the data folder. It holds your master seed, your identities and the private keys of xites you own. Never share it.

## V

### VRF beacon

A verifiable random value that Epix Chain publishes and that smart contracts can use as a source of randomness. See [Work with contracts](../web3/contracts.md).

## W

### Wrapper

The trusted page that the node serves around every xite. It owns the connection to the node, embeds the xite in a sandboxed iframe, forwards the page's commands, and draws notifications, permission prompts and the sidebar. See [Anatomy of a xite](../build/anatomy.md).

### wrapper_key

A random secret the node keeps for each xite. The wrapper uses it to open its privileged WebSocket to the node. It is rendered only into the wrapper page and is never given to the xite page.

## X

### xID

The naming and identity system of Epix Chain. It registers `.epix` names, stores their records and profiles, and links identity addresses to names. See [xID names and identity](../start/xid.md) and [xID for developers](../web3/xid.md).

### xID precompile

The built-in contract at `0x0000000000000000000000000000000000000900` through which smart contracts on Epix Chain resolve xID names. See [xID for developers](../web3/xid.md).

### Xite

A website on EpixNet: a folder of files with a signed manifest, identified by an address and distributed between peers. The plural is xites. API command names such as `siteInfo` keep the older spelling.

### Xite address

The identifier of a xite: a bech32 string with the prefix `epix`, derived from the xite's public key, for example `epix1dashanwfts3qcflekhmkvcz66ss4kxz2tr2k6g`.

## Z

### Zite, site

Older words for [xite](#xite) that appear in legacy material and in API command names.
