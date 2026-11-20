---
description: How the EpixNet node is put together. The layers, every crate in the Rust workspace, the main runtime flows (boot, visiting a xite, verifying an update, publishing) and the desktop, Android and iOS shells.
---

# Node architecture

This page describes how the EpixNet node is built: the layers, the role of every crate in the Rust workspace, what happens during the main runtime flows, and how the desktop and mobile shells embed the same core. It is written for people who want to read the source, debug a node, or contribute to it. If you only want to run a node or build a xite (a peer-hosted website on EpixNet), start with [How EpixNet works](../start/how-it-works.md) instead.

Everything here is taken from the source in the [EpixNet repository](https://github.com/EpixZone/EpixNet). File and crate names are linked where that helps you find the code.

## The big picture

EpixNet is a Cargo workspace of small crates in `crates/`. One engine is shared by every product: the standalone server, EpixNet Browser on desktop, and the Android and iOS apps. A change to name resolution, verification or routing is made once in the core and every shell receives it.

From top to bottom the node has six layers:

1. **Shells.** The programs a person starts: `epix-server` (standalone node and command line tool), `epix-browser` (the desktop launcher around a managed Firefox), and the mobile apps, which load the core through `epix-ffi`.
2. **The embeddable node.** `epix-node` boots everything: it prepares the data folder, loads settings, installs the xID trust anchor, restores xites from disk, starts the UI server and the background runtime.
3. **The local UI server.** `epix-ui` serves the wrapper page, xite files and the EpixFrame WebSocket API, on a loopback address by default. Plugins from `epix-plugins` add commands.
4. **Content and storage.** `epix-content` verifies signed manifests, `epix-xite` manages a xite folder, `epix-db` builds SQLite databases from JSON files, and `epix-blob` stores content-addressed objects.
5. **The peer protocol.** `epix-edx` is the one wire protocol between nodes. Discovery (`epix-discovery`, `epix-dht`, `epix-peer`) finds peers to speak it with.
6. **Transports.** `epix-transport` defines a byte-stream abstraction. TCP, Tor (`epix-tor`), I2P (`epix-i2p`) and Reticulum mesh (`epix-reticulum`) each provide streams that the same protocol runs over.

The chain layer (`epix-chain`) sits beside these. It resolves `.epix` names and xID identities from Epix Chain and verifies every answer before the node acts on it.

!!! note "One protocol, several routes"
    Tor and I2P change how peer traffic is routed. They do not guarantee anonymity, and the default Tor mode still lets non-onion peer connections go directly. See [Privacy and routing](../start/privacy.md) for what each mode covers.

## Programs and entry points

| Program | Crate | Role |
| --- | --- | --- |
| `epix-server` | `epix-server` | Standalone node. Chooses desktop, system-browser or headless startup and provides the command line actions (`siteCreate`, `siteSign`, `peerPing` and others). See [Run a node](../start/running.md). |
| `epix-browser` | `epix-browser` | Desktop launcher. Boots the embedded node, writes a managed Firefox profile and starts Firefox. |
| `epix-nmh` | `epix-nmh` | Native-messaging host that the browser extension talks to for node status, name resolution and browser settings. |
| `evx-worker` | `evx-worker` | Sandboxed worker for EVX programs. One binary with four modes (`run`, `compile`, `file`, `file-read`), started only by the trusted supervisor. |
| Mobile library | `epix-ffi` | The node as a library with Kotlin and Swift bindings. The apps call `EpixNode.start(config)` and point their web view at `ui_url()`. |

`epix-server`, `epix-browser` and `epix-ffi` all call into `epix-node`. There is one boot path.

## Crate map

The workspace has 57 crates. Each line below states what the crate owns today.

### Node core

| Crate | What it does |
| --- | --- |
| [`epix-core`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-core) | Shared domain types (addresses, `PeerAddr`, default trackers, port helpers) and the UI-agnostic `Emitter` trait. No platform, UI, async-runtime or networking dependency. |
| [`epix-node`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-node) | The embeddable node: resolve a `.epix` name, clone and verify the xite, serve the UI and the peer network. Used by the server binary, the FFI layer and the desktop shell. |
| [`epix-runtime`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-runtime) | The persistent runtime: supervised background loops (announce, re-sync, propagation, connection management, DHT, seeding, Tor, I2P, mesh, LAN discovery) and the glue that plugs EDX into every transport's accept loop. |
| [`epix-server`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-server) | The runnable node binary. Adds desktop concerns: platform data folder, single-instance lock, file logging, the bundled GeoIP asset, `epix://` argument handling and the command line actions. |
| [`epix-plugin`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-plugin) | The extension system: a trait-based, compile-time-checked plugin registry. The first seam lets a plugin add EpixFrame WebSocket commands. |
| [`epix-plugins`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-plugins) | The standard plugins: Sidebar, Beacon (tracker gossip), Channel (with automatic channel setup) and RLN admission. |
| [`epix-worker`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-worker) | Peer-outcome reputation types. The parallel download worker it once held was retired when content sync moved to EDX. |

### Content and storage

| Crate | What it does |
| --- | --- |
| [`epix-content`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-content) | `content.json` canonicalization, signing and verification, including signer delegation, user-content certificates and size rules. Also line diffs, the signed merge-file class (`epix-orset-1`) and the anonymous pool record class (`epix-pool-1`). |
| [`epix-xite`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-xite) | Xite lifecycle: storage, `content.json` load and verify, file accounting, peer announcing, and big-file piece maps. |
| [`epix-db`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-db) | SQLite storage: a pooled database, per-xite schemas applied from `dbschema.json`, population of tables from JSON files, and the global content database type. |
| [`epix-blob`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-blob) | The EDX verified blob core: BLAKE3 and bao outboard trees, verified range encode and decode, the slab store with a `redb` index, chunk-group bitfields, small-file bundles and manifest fields. |
| [`epix-selfenc`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-selfenc) | Clean-room convergent self-encryption for EDX shards: salted-convergent and random-key modes over BLAKE3 key derivation and XChaCha20-Poly1305. |
| [`epix-feed`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-feed) | Deterministic feed organization for social data: sealed segments, checkpoints, an index by target, OR-set reaction counts, rollups and sticky moderation. |
| [`epix-search`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-search) | In-xite search: per-segment XOR8 skip filters, a sharded inverted index and a frozen tokenizer. |
| [`epix-fs`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-fs) | Small platform filesystem primitives with explicit durability semantics. |
| [`epix-mirror`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-mirror) | Verified package snapshots carried by signed xites for standard package managers. See [Package mirrors](../build/package-mirrors.md). |

### Networking and transports

| Crate | What it does |
| --- | --- |
| [`epix-edx`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-edx) | The EDX wire protocol: framing, the multiplexed connection, Noise encryption for clearnet links, the message set, the fetch scheduler and the upload choker. See [Peer protocol](protocol.md). |
| [`epix-protocol`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-protocol) | Plumbing every transport shares: the inbound TCP accept loop, the live connection registry behind the Stats page, and the node's dial-back self-advertisement. |
| [`epix-transport`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-transport) | The `Transport` trait and `PeerStream` type, with the clearnet TCP implementation. |
| [`epix-peer`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-peer) | The per-xite peer registry: discovered peers with connection state, reputation, byte counters and the counts the UI reports. |
| [`epix-discovery`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-discovery) | Finding peers for a xite: the Epix tracker announce carried over EDX, and BitTorrent tracker announces. |
| [`epix-dht`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-dht) | A private Kademlia DHT whose core query is "which peers host this xite". |
| [`epix-dht-net`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-dht-net) | Binds the DHT to the wire: its RPCs travel as EDX `Kad` payloads, so the DHT works over every transport. |
| [`epix-propagation`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-propagation) | Store-and-forward hints about xite updates, so a peer that was offline at publish time can catch up. |
| [`epix-tor`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-tor) | In-process Tor through Arti: dialing `.onion` peers, hosting an onion service, and a local SOCKS listener for the browser shells. |
| [`epix-i2p`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-i2p) | I2P transport over the SAMv3 bridge, with an embedded pure-Rust router or an external one. |
| [`epix-reticulum`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-reticulum) | Reticulum mesh transport: adapts Reticulum links to the byte stream the wire protocol needs. |
| [`epix-bt`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-bt) | The BitTorrent bridge: the node fetches magnet-referenced media and streams it to a xite over a local Range endpoint. Compiled into desktop and Android builds only. |
| [`iptproxy-sys`](https://github.com/EpixZone/EpixNet/tree/main/crates/iptproxy-sys) | Minimal FFI to the Snowflake wrapper, so Tor can reach bridges in-process on censored networks. |

### Identity and chain

| Crate | What it does |
| --- | --- |
| [`epix-crypt`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-crypt) | Cryptography: `epix1` addresses (Keccak-256 and bech32), recoverable secp256k1 signatures, key derivation and ECIES message encryption. |
| [`epix-user`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-user) | The local user: a master seed, per-xite keys and the list of linked xID identities, stored in `users.json`. |
| [`epix-chain`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-chain) | The Epix Chain layer: chain-verified `.epix` name resolution with a Merkle proof and validator finality, the CometBFT light client, and the chain random beacon helper. See [xID light client](xid-light-client.md). |

### Channels and messaging

| Crate | What it does |
| --- | --- |
| [`epix-envelope`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-envelope) | Generic sealed-envelope messaging over the anonymous pool: the crypto `Engine` trait, the trial-decrypt indexer and the count-hiding multi-slot record. |
| [`epix-channel`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-channel) | The channel app's private index (`channels.db`): decrypted threads and messages, full-text search, ratchet sessions and the detection-tag set. |
| [`epix-pairwise-engine`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-pairwise-engine) | The pairwise channel crypto engine: X25519 X3DH, Double Ratchet with header encryption, detection-tag chains and Elligator2 first-contact tags. |
| [`epix-group-engine`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-group-engine) | Sender-Keys group messaging. A foundation: the key-management core exists, the signature and membership layers do not yet. |
| [`epix-rln`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-rln) | Anonymous rate limiting for pool records through Rate-Limiting Nullifiers. |

The cryptography of these crates is summarized in [Channel cryptography](channels-crypto.md).

### UI and browser

| Crate | What it does |
| --- | --- |
| [`epix-ui`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-ui) | The local UI server: the wrapper, xite files, the EpixFrame WebSocket command API, and the built-in Config, Stats, Plugins and Backup pages. Also holds the shared application state. |
| [`epix-browser`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-browser) | The desktop browser launcher: runs the node, a browser proxy and a managed Firefox profile so that `dashboard.epix` loads like a normal page. |
| [`epix-browser-net`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-browser-net) | Per-install TLS origins for the embedded browsers: a local certificate authority and the TLS-terminating proxy. |
| [`epix-nmh`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-nmh) | The native-messaging host: length-prefixed JSON over standard input and output, bridging the extension to name resolution and browser settings. |

### EVX

EVX runs sandboxed WebAssembly programs that a xite declares in its signed `content.json`. See [EVX programs](../build/evx.md) for the developer view.

| Crate | What it does |
| --- | --- |
| [`epix-evx`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-evx) | The node's EVX service, management commands and durable scheduler, registered as the `Evx` plugin. |
| [`evx-api`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-api) | Shared types: grants, limits, broker requests, supervisor and worker frames, invocation results. No I/O. |
| [`evx-declaration`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-declaration) | Strict parser and manifest binder for the signed `evx` section of a root `content.json`. |
| [`evx-activation`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-activation) | Signed activation: envelope verification, immutable capture of the program's files, and admission. |
| [`evx-host`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-host) | Binds an authenticated activation to contained execution. The only path by which xite content reaches a worker. |
| [`evx-runtime`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-runtime) | Module validation, engine configuration, compilation and execution on Wasmtime. |
| [`evx-supervisor`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-supervisor) | The trusted supervisor: capability broker, workspace lease, confined child processes and resource observations. |
| [`evx-worker`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-worker) | The sandboxed worker binary. It confines itself before it reads any untrusted bytes. |
| [`evx-state`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-state) | Host-owned SQLite state: grants, reservations, an effect outbox and checkpoints. |
| [`evx-workspace`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-workspace) | Private workspace operations: handle-relative, link-refusing, quota-bounded reads and staged writes. |
| [`evx-windows`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-windows) | Windows isolation (LPAC AppContainer and job objects) and the bounded compiler and worker transport. |
| [`evx-windows-native`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-windows-native) | Win32 isolation primitives with no EVX policy. Empty on other targets. |
| [`evx-android`](https://github.com/EpixZone/EpixNet/tree/main/crates/evx-android) | A WebAssembly runtime adapter for an isolated Android service. It is never loaded into the node process. |

The EVX service is compiled into the desktop and server builds. The mobile library and the native-messaging host do not link Wasmtime.

### Mobile and FFI

| Crate | What it does |
| --- | --- |
| [`epix-ffi`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-ffi) | UniFFI bindings that expose the node to Kotlin (Android) and Swift (iOS). The node owns its own multi-threaded runtime, so the shell makes ordinary blocking calls. |

### Tooling

| Crate | What it does |
| --- | --- |
| [`epix-build`](https://github.com/EpixZone/EpixNet/tree/main/crates/epix-build) | Shared build-script helpers that stamp the binaries with a version and the short git commit. |
| [`xid-spike`](https://github.com/EpixZone/EpixNet/tree/main/crates/xid-spike) | A small command line program from the first phase of the project that resolves a `.epix` name against the live chain with proof checks. |

Outside `crates/`, the repository also holds `ui/` (the wrapper page and its media), `shells/` (Android and iOS projects, browser theme, the wallet pin), `packaging/` (installers and release notes), `fuzz/` (fuzz targets) and `vendor/` (patched third-party crates, each with its own patch note).

## Build features

Cargo features decide what a build contains. Several of them are compiled in but stay inert until a setting turns them on.

| Feature | Effect | Default builds that include it |
| --- | --- | --- |
| `tor` | In-process Tor: onion dialing, onion service, SOCKS listener. | Server, desktop browser, mobile library |
| `bridges` | Snowflake bridges for Tor on censored networks. | Server and desktop browser. Mobile builds opt in from their build scripts. |
| `i2p-embedded` | I2P with the embedded router. | Server, desktop browser, mobile library |
| `mesh` | Reticulum mesh transport. Stays disabled at runtime until you enable it in Config. | Server, desktop browser, mobile library |
| `inbound-seeding` | The inbound file server and UPnP port mapping. | Server and desktop browser. Off in the mobile library. |
| `local-discovery` | LAN discovery over UDP broadcast. Stays off at runtime until `local_discovery` is set. | Server, desktop browser, mobile library |
| `bittorrent` | The BitTorrent bridge and BitTorrent tracker announces. | Server and desktop browser. The Android build opts in. The iOS build never enables it. |
| `evx` | The EVX service. | Server and desktop browser |
| `desktop` | UI password, multi-user support and the benchmark page. | Server |

## Runtime flows

### Boot

Boot is implemented in `epix-node` and reports its progress through six stages: preparing data, loading settings, restoring xites, rebuilding databases, starting services, and prepared.

1. **Take ownership of the data folder.** The node acquires a lease on the data root (the `lock.pid` lock). A restore staged by the Backup and Restore page is applied now, before anything reads the folder.
2. **Load settings.** Supported keys from a legacy `epixnet.conf` are moved into `private/config.json` (see [Python interoperability](python-interop.md)).
3. **Install the xID trust anchor.** The finality pin and its anti-rollback checkpoint are restored before any name cache is read or any chain endpoint is contacted. See [xID light client](xid-light-client.md).
4. **Arm the network policy.** The node parses the Tor and offline settings strictly and arms the matching egress gate. A configuration file that exists but cannot be parsed stops startup instead of silently allowing direct connections.
5. **Choose the launch target from local state.** Boot never contacts the chain. A name with a copy on disk is served at once and verified later. A name with nothing on disk is handed to the on-demand resolver.
6. **Restore xites and databases, then start services.** The UI listener is bound and the caller starts serving requests.

The background runtime (`epix-runtime`) then starts its loops. With default settings:

| Loop | Default interval | Purpose |
| --- | --- | --- |
| Announce | 20 minutes | Re-announce every xite to trackers and fold the results into each peer registry. |
| Re-sync | 5 minutes | Check each xite for a newer `content.json` among its peers and fetch what changed. |
| Propagation | 30 seconds | Poll peers for update hints so a fresh post appears in seconds. |
| Connections | 60 seconds | Maintain the pool of peer connections. |
| DHT | 20 minutes | Announce served xites to the DHT and look up more peers. |
| Charts | 5 minutes | Record local statistics. This is the only loop that runs in offline mode. |
| Wakeup watcher | 30 seconds | Detect a wall-clock jump of more than 3 minutes (the machine slept) and force a fresh announce and connection sweep. |

The same start routine binds the file server, brings up Tor, I2P and the mesh when they are enabled, and starts the xID light client. Network bootstrap and missing-xite downloads never block local startup.

### Visiting a xite

1. **The request arrives at the UI server.** In EpixNet Browser, Firefox routes every `.epix` host to a local proxy that terminates TLS with a certificate from a per-install certificate authority, so `https://talk.epix/` is a real secure origin. With a system browser the URL is `http://127.0.0.1:42222/<address>/`.
2. **The wrapper is served.** `GET /<address>/` returns the wrapper page, which loads the xite in a sandboxed frame and opens the EpixFrame WebSocket at `/EpixNet-Internal/Websocket`. See [Anatomy of a xite](../build/anatomy.md) and [The wrapper sandbox](../build/sandbox.md).
3. **If the xite is not on disk, it is cloned.** A `.epix` name is first resolved on chain, which waits until xID trust is established. Then discovery and download run concurrently: every tracker announce and a DHT lookup stream peers into a channel, the root `content.json` is raced against the first peers to respond, and the file download starts as soon as the manifest verifies.
4. **First paint.** The clone is complete for the visitor once the core files are verified and committed. User content (posts, comments, profiles) streams in afterwards on its own task.
5. **While waiting, the page says so.** A document request for a xite that is not ready returns an uncached waiting page with HTTP 503 and `Retry-After`. Retries are automatic. An empty discovery round means no reachable peer was found yet, not that nobody shares the xite.

### Verifying and storing an update

An update reaches the node in one of three ways: a peer pushes it with an EDX `Update` request, the re-sync loop finds a newer manifest, or a propagation hint triggers an early re-sync.

1. The signed `content.json` is checked by `epix-content`: the address and inner path must match, the signature must recover to an authorized signer, user content must carry a certificate from a signer the parent manifest accepts, and the size and file rules of the parent manifest must hold.
2. A manifest that is not newer than the stored one is acknowledged and ignored.
3. Changed files are fetched as EDX objects. Every byte range is verified against the BLAKE3 root in the signed manifest while it streams, so a corrupt peer is detected within one 16 KiB chunk group. See [EDX content distribution](edx.md).
4. Files are written into the xite folder and the xite database is updated from the changed JSON files according to `dbschema.json`.
5. Open pages are notified through EpixFrame events, a propagation hint is recorded for peers that poll, and the update is re-broadcast to a few more peers.

A valid signature shows who published an update. It does not make the content safe or lawful.

### Publishing

1. **Sign.** `siteSign` (from a page, the sidebar or the command line) hashes the files, assigns small files to bundles, writes the EDX fields and signs the manifest with the owner key. For user content the node signs with the identity the xite uses.
2. **Push.** `sitePublish` sends an `Update` to connectable peers of the xite in batches of 20. A publish started by a person keeps walking the reputation-sorted candidate list until one batch lands somewhere, up to 100 dial attempts. The request carries the signed manifest, optional line diffs so receivers can patch data files in place, small objects inline, and the publisher's dial-back addresses.
3. **Receivers verify and pull.** Each receiver verifies the manifest, pulls what it lacks over the same connection, then answers. The publisher therefore does not need an open port.
4. **Hints for the absent.** The publisher records a propagation hint. Peers that connect later learn about the update when they next poll.

Delivery to peers is not a guarantee of availability. A xite stays reachable only while some reachable peer keeps a copy. See [Publishing](../build/publishing.md).

## The shells

### Desktop: EpixNet Browser

`epix-browser` is a launcher around a real Firefox, not an embedded web view, so extensions work. It:

1. boots the embedded node, the same engine the server binary runs;
2. serves a browser proxy for `.epix` hosts that terminates TLS with a per-host certificate from a local certificate authority that the managed profile trusts;
3. writes a managed Firefox profile (proxy configuration, trust, preferences) and launches Firefox at the xite;
4. installs the Epix Wallet extension, pinned to a specific wallet build by `shells/wallet-ext.rev` and a checksum, so a given EpixNet commit always embeds the same wallet.

The packaged app bundles Firefox ESR, the launcher and the native-messaging host. Local proxies start at ports `42422` (xite HTTP proxy) and `42522` (I2P HTTP proxy) and take the first free loopback port from there. See [Browser and wallet](../start/browser-wallet.md).

### Android

The Android app is Kotlin with GeckoView. `MainActivity` loads the core library, boots the node on a coroutine and points GeckoView at the node's local URL. The Epix Wallet is installed as a built-in WebExtension, and the host app answers the wallet's native messages itself. The app applies proxy preferences to GeckoView live, so the "route clearnet through Tor" switch takes effect without a relaunch.

Phones do not accept inbound clearnet connections (the `inbound-seeding` feature is off in the mobile library). On Android 10 and later, optional Bluetooth and Wi-Fi Aware radios can carry the Reticulum mesh between nearby devices.

### iOS

The iOS app is Swift with WKWebView. WKWebView cannot run WebExtensions, so the wallet runs as a web app that the node serves at `/EpixWallet/`, with the host app bridging its storage and native commands. On iOS 17 and later, proxy configurations route `.epix` hosts to the in-process TLS proxy, and the app validates those connections against a per-install certificate authority inside its own browser views. The iOS build contains no BitTorrent code.

Mobile store releases are in preparation. The source and build guides are in the repository. See [Install on Android](../start/install-android.md) and [Install on iOS](../start/install-ios.md).

## Where to go next

- [Peer protocol](protocol.md): framing, the handshake and every request.
- [EDX content distribution](edx.md): objects, manifests, verified slices and the store.
- [xID light client](xid-light-client.md): how names are verified against Epix Chain.
- [Channel cryptography](channels-crypto.md): the sealed-envelope protocol.
- [Data directory layout](data-directory.md): what the node keeps on disk.
- [Contributing](../contributing/index.md): building, testing and submitting changes.
