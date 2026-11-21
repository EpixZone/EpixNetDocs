---
description: The EpixNet peer wire protocol (EDX) as implemented in the Rust node. Framing, encryption, the handshake, every request and response, limits, and how peers find each other through trackers, the DHT, peer exchange and LAN discovery.
---

# Peer protocol

This page is a reference for the protocol EpixNet nodes speak to each other. It covers how a connection is established and encrypted, how frames are multiplexed, the handshake, every request with its parameters and responses, the server limits, and the discovery mechanisms that find peers in the first place. It is written for contributors and for anyone who wants to audit or reimplement the protocol.

The protocol is called EDX (Epix Data eXchange). It is the only peer protocol the node speaks. The message set lives in [`crates/epix-edx/src/msg.rs`](https://github.com/EpixZone/EpixNet/blob/main/crates/epix-edx/src/msg.rs), and that file is the authority if this page and the code ever disagree.

!!! warning "Not compatible with the archived Python node"
    The archived Python implementation used a msgpack request and response protocol. The Rust node no longer speaks it: a connection whose first byte is not the EDX magic is closed at once. The two implementations share content formats, not a wire. See [Python interoperability](python-interop.md) and the [comparison table](#legacy-protocol) at the end of this page.

## Overview

- **One protocol over every transport.** The same frames travel over clearnet TCP, Tor onion services, I2P and the Reticulum mesh. A transport only has to provide an ordered byte stream.
- **Encoding.** Every frame is encoded with [postcard](https://docs.rs/postcard), a compact binary format. There is no JSON or msgpack on the peer wire.
- **Encryption.** Clearnet TCP links always run inside a Noise tunnel. Overlay links (Tor, I2P, Reticulum) are already encrypted by their transport and skip that layer.
- **Multiplexing.** Many requests share one connection. Each request picks a stream identifier and its response frames carry the same one.
- **Verification is the receiver's job.** Signed manifests are checked by signature, file bytes are checked against BLAKE3 roots from a signed manifest, and discovery answers are only hints. A peer can withhold data or waste a request. It cannot make the node accept forged content.

## Peer addresses

A peer address (`PeerAddr`) is one of four dialable kinds:

| Kind | Text form | Notes |
| --- | --- | --- |
| Clearnet | `203.0.113.9:26552` or `[2001:db8::1]:26552` | IPv4 or IPv6 socket address. |
| Tor | `<host>.onion:<port>` | The onion service maps the node's file server port one to one. |
| I2P | `<b32>.b32.i2p:<port>` | I2P streams are addressed by destination. The port is carried for round-tripping and is not dialed on. |
| Reticulum | `rns:<32 hex characters>` | A 16-byte Reticulum destination hash. No port. |

A fifth, internal kind (a session handle) refers to an already authenticated inbound connection. It exists only while that connection is alive, is never serialized, cannot be parsed from network input and is excluded from peer exchange and saved peers.

Trackers and peer exchange carry addresses in a compact packed form:

| Kind | Packed bytes |
| --- | --- |
| IPv4 | 4 address bytes and a little-endian port (6 bytes) |
| IPv6 | 16 address bytes and a little-endian port (18 bytes) |
| Onion | base32-decoded host and a little-endian port (37 bytes for a v3 address) |
| I2P | the 32-byte destination hash and a little-endian port (34 bytes) |
| Reticulum | the 16-byte destination hash |

Addresses that cannot be dialed are rejected before they reach a peer registry: an empty onion or I2P host, an onion port of 0, an all-zero Reticulum hash, and clearnet port 1 (a placeholder that old swarms still echo).

## Establishing a connection

### The accept loop

The node listens for clearnet peers on its file server port (`26552` by default, see [Ports](../start/running.md#ports)). Because that port is announced to public trackers, scanners and unrelated BitTorrent clients connect to it constantly. The accept loop is therefore deliberately strict:

- At most 400 inbound connections are held at once. Beyond that, new connections are dropped.
- A connection that sends nothing within 60 seconds is closed.
- The first byte must be `E`, the first byte of the magic. Anything else is closed immediately, without a reply.

Overlay listeners (the onion service, the I2P destination, mesh links) hand their streams to the same serving code directly.

### Magic

Each side sends the 4-byte magic `EDX1` once, in the clear, before anything else. The dialer writes its magic and then reads the peer's. The acceptor reads first and then writes.

### Noise on clearnet

On a clearnet address the link then runs a Noise handshake. There is no negotiation and no fallback:

| Property | Value |
| --- | --- |
| Pattern | `Noise_XX_25519_ChaChaPoly_BLAKE2s` |
| Handshake messages | Three: `e`, then `e, ee, s, es`, then `s, se` |
| Record format | A 2-byte little-endian length followed by the Noise ciphertext |
| Plaintext per record | At most 60,000 bytes |
| Static key | Generated per process. It is not the node's identity. |

The Noise static key only keys the tunnel. Identity comes from the channel binding in the handshake below. Peer links do not use TLS: clearnet links use Noise, and overlay links rely on the encryption of their transport.

### Overlay links

On Tor, I2P and Reticulum links the two sides exchange the magic and start the multiplexed connection directly. The transport already encrypts the stream and authenticates the endpoint, so there is no Noise layer and no channel binding. Identity rests on the overlay endpoint plus the node key claimed in the handshake.

!!! note "What encryption does and does not hide"
    Noise protects the contents of a clearnet link from observers on the path. It does not hide your IP address from the peer you are connected to, and it does not hide the fact that you are running EpixNet. See [Privacy and routing](../start/privacy.md).

## Framing and multiplexing

Inside the tunnel (or directly on an overlay stream) every message is a frame:

```text
u32 little-endian length | postcard(Frame)
```

```rust
struct Frame {
    stream: u64,
    body: FrameBody,
}

enum FrameBody {
    Req(Req),                          // 0: a request
    Resp { last: bool, resp: Resp },   // 1: a response
    Data { last: bool, bytes: Vec<u8> }, // 2: a streaming payload chunk
    Cancel,                            // 3: abort an in-flight stream
    Ping,                              // 4
    Pong,                              // 5
}
```

- **Stream identifiers** are chosen by the requester and must be unique among its in-flight requests. The dialer uses odd identifiers and the acceptor even ones, so the two sides never collide.
- **Responses** arrive as one or more `Resp` or `Data` frames on the request's stream. The frame with `last = true` ends the stream.
- **`Cancel`** tells the server to stop encoding a response mid-stream. It is used when a download is abandoned, for example after a media seek.
- **`Ping` and `Pong`** are link liveness checks, not requests.
- **Size limits.** A payload chunk is at most 64 KiB. A whole encoded frame may not exceed 64 KiB plus 4096 bytes. Writers split larger payloads into continuation frames. Readers reject a larger length prefix before allocating anything.
- **Two send lanes.** Control frames and first-paint data use a priority lane that is always drained first. Bulk background data uses a second lane that yields to it. A small urgent request is therefore not stuck behind a large transfer on the same connection.

## Handshake

The first request on an accepted connection must be `Hello`. Nothing else is answered before it, and an accepted link that sends no `Hello` within 30 seconds is closed.

### Hello

| Field | Type | Meaning |
| --- | --- | --- |
| `net` | string | Network identifier. Must equal `epixnet-edx-1`. Connections to another network are refused. |
| `node_pk` | bytes | The node's compressed secp256k1 public key (33 bytes). The node identity lives in the same key space as xite and chain addresses. |
| `binding_sig` | bytes | On Noise links, a signature by `node_pk` over the channel binding (below). Empty on overlay links. |
| `caps` | u32 | Capability flags. |
| `listen` | list of addresses | Addresses the node can be dialed back on. An inbound connection arrives from an ephemeral port, so without this the receiver could never call back. |
| `version` | string | The node's release version. Reporting only. Nothing is gated on it. |

### HelloAck

| Field | Type | Meaning |
| --- | --- | --- |
| `net` | string | Must equal `epixnet-edx-1`. |
| `node_pk` | bytes | The responder's public key. |
| `binding_sig` | bytes | The responder's channel-binding signature. Empty on overlay links. |
| `caps` | u32 | The responder's capability flags. |
| `observed` | optional address | The dialer's address as the responder observed it. |
| `version` | string | The responder's release version. |

### Channel binding

On a Noise link, each side proves that it holds the private key for the `node_pk` it claims, and that the proof belongs to this session. The signed text is:

```text
epix-edx-binding-v2:<role>:<hex of the 32-byte Noise handshake hash>
```

`<role>` is `initiator` for the dialer's `Hello` and `responder` for the acceptor's `HelloAck`. Because the role is part of the signed text, a responder cannot echo the dialer's own key and signature back and be accepted as that identity. Without proof of possession, a peer could claim another node's identity and its serving reputation.

A `Hello` on the wrong network, with an unparsable key, or with a binding signature that does not verify gets an error response and the connection is closed.

### Capability flags

| Flag | Bit | Meaning |
| --- | --- | --- |
| `SHARDS` | 0 | The node volunteers disk for encrypted shards it cannot read. |
| `MESH` | 1 | Accepts `Update` pushes for xites it seeds. |
| `CONTROL` | 2 | Serves the control plane: `UpdatesSince`, `Pex`, `GetTrackers`, `Kad`, `Announce`. A content-only node answers those with error 501. |
| `RETRY_AFTER` | 3 | Understands the typed `Busy` response. A server sends `Busy` only to peers that advertised this bit. Others receive `Err` with code 429. |
| `INLINE_MERGE` | 4 | Accepts signed merge-record envelopes in the `inline` field of `Update`. A sender leaves `inline` empty for a peer without this bit. |

### What a node advertises about itself

The `listen` addresses follow the transport class of the connection, so that a self-address is only claimed where it adds no linkage:

| Dialing | Advertised |
| --- | --- |
| An onion peer | The node's own onion address |
| An I2P peer | The node's own I2P destination |
| A mesh peer | The node's own Reticulum destination hash |
| A clearnet peer directly | Only the file server port. The peer sees the IP address anyway. The onion address is never sent, so a clearnet handshake cannot link an IP address to an onion. |
| A clearnet peer through Tor (Tor mode `always`) | The node's onion address. The peer sees a Tor exit as the source, so there is no real IP address to link. |

## Requests

Every request below is a variant of `Req`. The number is the variant index on the wire.

### Content requests

#### 1. GetSigned

Fetch a signed `content.json`, root or per user. This is the mutable entry point of a xite and it is verified by signature on the receiving side.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `xite` | string | The xite address. |
| `inner_path` | string | Path of the manifest inside the xite, for example `content.json`. |

**Response:** `Signed { bytes }`, split across several frames when the manifest is larger than one frame. The client concatenates until the last frame and refuses to assemble more than 8 MiB. `Err 404` if the node does not have it.

#### 2. ListSigned

List signed files that changed since a point in time. This is how forum and social xites discover per-user changes.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `xite` | string | The xite address. |
| `since` | u64 | Unix time in seconds. |

**Response:** `SignedList { entries }`, where each entry is `(inner_path, modified, size)`. Long lists are split across frames.

#### 3. GetRange

Fetch byte ranges of one object, verified. This request is the heart of file transfer, streaming and seeking.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `obj` | 32 bytes | The object's BLAKE3 root. |
| `size` | u64 | The object's size, from the signed manifest. |
| `ranges` | list of `(start, end)` | Byte ranges, end exclusive. At most 64 ranges and 64 MiB in total per request. |
| `deadline_ms` | u32 | A hint for how urgent the request is. `0` means patient background work. It only orders this peer's own streams. It never gives a peer priority over others. |

**Response:** `Data` frames that together carry one verified slice for exactly these ranges (see [EDX content distribution](edx.md#verified-slices)). The slice is encoded straight into frames, so a large range is never held in memory on either side. Errors: `Err 413` when the caps are exceeded, `Err 404` for an unknown object, `Busy` or `Err 429` when the peer is choked or the serve queue is full.

#### 4. GetMany

Fetch many small whole objects in one round trip. Used for the cold sync of a xite with many tiny files.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `objs` | list of 32-byte ids | At most 256 objects. |

**Response:** `Many { items }` frames, each item an `(id, bytes)` pair. Only objects the server holds complete and that are at most 64 KiB are returned. The client verifies each by hashing the whole blob. `Err 413` for more than 256 ids. `Busy` if nothing can be served right now, so that an empty batch is never mistaken for "we hold none of these".

#### 5. GetBitfield

Ask which chunk groups of an object the peer holds.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `obj` | 32 bytes | The object's BLAKE3 root. |

**Response:** `Bitfield { size, runs }`. `runs` is a run-length encoding of held 16 KiB chunk groups, starting with a run of present groups. `Err 404` if the object is unknown.

#### 6. HasXite

Ask for a summary of what the peer holds of a xite. It replaces one bitfield exchange per user file on a busy forum.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `xite` | string | The xite address. |

**Response:** `XiteSummary { signed_files, newest_modified, held_bytes }`, or `Err 404`.

#### 7. HaveRanges

A notification that chunk groups of an object became available on the sender. It has no response.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `obj` | 32 bytes | The object's BLAKE3 root. |
| `runs` | list of u64 | Run-length encoding, present first. |

#### 8. Update

Push a newly signed manifest to a peer. This is how publishing propagates.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `xite` | string | The xite address. |
| `inner_path` | string | Path of the signed manifest. |
| `signed` | bytes | The signed `content.json` body. |
| `inline` | list of `(id, bytes)` | Optional small objects that ride along, so that a forum post arrives in one push. |
| `modified` | f64 | The manifest version, so that a receiver can short-circuit a stale push. |
| `diffs` | list of `(inner_path, bytes)` | Optional encoded line diffs, so that data files can be patched in place instead of fetched again. |
| `sender_peers` | list of strings | The publisher's dialable addresses. |

**Response:** `Ok` when the update is accepted, whether it was newly applied or already known. `Err 400` when verification fails. `Busy` when the receiver cannot take it right now, for example because the same version is already being applied.

The receiver verifies the manifest exactly as it would a pulled one. If it needs more data, it requests it back over the same connection, which works even when the publisher is behind NAT. An update for a xite the receiver has not already added does not install that xite. Each connection applies at most eight updates at once, in a lane separate from other requests, because applying an update may itself issue requests on the same link.

#### 14. HasShards

Ask which of a list of encrypted shards the peer holds complete.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `addrs` | list of 32-byte ids | Shard addresses. |

**Response:** `ShardMask { bits }`, one bit per requested address in request order, least significant bit first within each byte.

### Control requests

These are served by nodes that advertise the `CONTROL` capability.

#### 9. UpdatesSince

Ask for store-and-forward hints about updates recorded after a cursor.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `after` | u64 | The last sequence number the caller saw. |

**Response:** `Updates { updates, head }`. Each update is `(xite, modified)`. `head` is the new cursor. A reply carries at most 512 hints. The cursor is a sequence number, not a clock, so the exchange is idempotent. A hint is not proof: the receiver runs a normal sync, which verifies signatures.

#### 10. Pex

Peer exchange for one xite.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `xite` | string | The xite address. |
| `need` | u32 | How many peers the caller would like. |
| `peers` | list of addresses | Peers the caller already knows, so the answer can leave them out. |

**Response:** `Peers { peers }`: connectable peers the caller lacked.

#### 11. GetTrackers

Ask for the peer's working tracker set. No parameters.

**Response:** `Trackers { trackers }`: a list of tracker strings, truncated to fit one frame.

#### 12. Kad

One Kademlia RPC, encoded by `epix-dht-net`. EDX treats the payload as opaque bytes.

**Response:** `Payload { bytes }`. See [DHT](#dht).

#### 13. Announce

One tracker announce, encoded by `epix-discovery`. EDX treats the payload as opaque bytes.

**Response:** `Payload { bytes }`. See [Trackers](#trackers).

## Responses and errors

| Index | Response | Sent for |
| --- | --- | --- |
| 0 | `HelloAck` | `Hello` |
| 1 | `Signed { bytes }` | `GetSigned` |
| 2 | `SignedList { entries }` | `ListSigned` |
| 3 | `Bitfield { size, runs }` | `GetBitfield` |
| 4 | `XiteSummary { .. }` | `HasXite` |
| 5 | `Many { items }` | `GetMany` |
| 6 | `Ok` | `Update` |
| 7 | `Err { code, msg }` | Any request |
| 8 | `Updates { updates, head }` | `UpdatesSince` |
| 9 | `Peers { peers }` | `Pex` |
| 10 | `Trackers { trackers }` | `GetTrackers` |
| 11 | `Payload { bytes }` | `Kad`, `Announce` |
| 12 | `ShardMask { bits }` | `HasShards` |
| 13 | `Busy { retry_after_ms }` | Any request that is refused for now |

Error codes follow HTTP conventions:

| Code | Name | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Malformed request, failed verification, or a second `Hello`. |
| 404 | `NOT_FOUND` | The xite, manifest or object is not held. |
| 413 | `LIMIT` | A per-request cap was exceeded. |
| 429 | `BUSY` | Refused for now. Sent to peers without the `RETRY_AFTER` capability. |
| 500 | `INTERNAL` | A server-side failure. |
| 501 | `UNSUPPORTED` | A control request on a node that does not serve the control plane. |

`Busy` carries a retry hint in milliseconds. A refusal is not a failure: the client does not count a strike against the peer, but it cools the peer down for the hinted time (bounded to between 1 and 120 seconds) and asks other peers in the meantime. A peer that answers `Busy` eight times in a row with no delivery in between is dropped for that fetch.

## Server limits

These are hard backstops enforced per request or per connection.

| Limit | Value |
| --- | --- |
| Concurrent inbound connections | 400 |
| Time to first byte on an accepted connection | 60 seconds |
| Time to `Hello` after the link is up | 30 seconds |
| Idle time before an accepted connection is dropped | 300 seconds |
| Ranges per `GetRange` | 64 |
| Bytes per `GetRange` | 64 MiB |
| Objects per `GetMany` | 256 |
| Size of one `GetMany` object | 64 KiB |
| Concurrent serves per connection (excluding updates) | 8 |
| Concurrent `Update` applications per connection | 8 |
| Range-encode threads in the whole process | 32 running. At most 96 serves are admitted at once, running plus queued. |
| Assembled `GetSigned` body | 8 MiB |

A request that waits more than 15 seconds for a place in the global serve queue is refused with a retry hint instead of waiting without bound.

## Upload fairness

Serving is governed by a choker that decides who receives bulk data when more peers compete than there are slots. It is generous by default: every peer has a large free budget, small objects that a page needs for first paint are exempt from choking, and control requests bypass it entirely. Details are in [EDX content distribution](edx.md#fairness).

## Discovery

Before two nodes can speak EDX, one has to learn the other's address. The node combines several independent sources and treats every answer as a hint that still has to be dialed and verified.

### Trackers { #trackers }

A tracker records which peers announced for a xite and hands that list to others announcing the same xite. The node's announce set mixes two kinds:

- **Epix trackers.** Ordinary nodes that answer the EDX `Announce` request. They can record onion and I2P peers, which public clearnet trackers cannot. They are written with an explicit transport: `tcp://host:port`, `onion://<host>.onion:port` or `i2p://<b32>.b32.i2p:port`. The legacy spellings `epix://host:port` and a bare `host:port` still parse.
- **BitTorrent trackers.** Public trackers used as free rendezvous points: `udp://host:port/announce` and `http(s)://host/announce`. The xite is announced under the infohash `sha1(address)`. These are only used in builds with the `bittorrent` feature.

The built-in list contains entries of each kind. You can replace it with the `trackers` setting on the Config page. Leaving that field empty restores the defaults.

An Epix announce request carries:

| Field | Meaning |
| --- | --- |
| `hashes` | The xite tracker hashes to query. A tracker hash is `sha256(address)`. |
| `onions`, `i2p` | The announcer's own onion and I2P addresses, without the suffix. |
| `port` | The announcer's file server port, or 0 when it does not accept inbound connections. |
| `need_types` | Address types wanted back: `ipv4`, `ipv6`, `onion`, `i2p`. |
| `need_num` | Peers wanted per xite. |
| `add` | Address types the tracker should record the announcer under. |
| `onion_sign_this`, `onion_signs` | The onion ownership challenge, below. |

The reply carries one set of packed address buckets (`ipv4`, `ipv6`, `onion`, `i2p`) per requested hash, an optional challenge, or an error string.

**Onion ownership challenge.** A tracker does not take an onion address at face value. The first reply includes a nonce in `onion_sign_this`. The node announces again with `onion_signs`: the onion service's 32-byte ed25519 identity key and a signature over the nonce. Only then is the onion registered. The second call asks for no peers, and its failure does not cost the peers the first call returned.

**Serving announces.** Any node with the control plane answers announces unless the `tracker` setting is `disable`. Announced peers expire after one hour without a fresh announce. The table is capped at 20,000 xite hashes and 200 peers per hash, a reply returns at most 30 peers per hash, and one request is answered for at most 64 hashes. A node only announces itself for xites whose verified root manifest it serves, and a passive lookup does not register the caller.

**Cadence and back-off.** The node re-announces every 20 minutes. A tracker that has failed more than 5 times and was tried within the last `60 * min(30, failures)` seconds is skipped for that pass. A manual announce still tries everything.

**Tracker gossip.** The Beacon plugin keeps the tracker set alive without a shipped list. Every 5 minutes it asks up to 5 peers for their working trackers with `GetTrackers`, until 5 work. It remembers up to 200 entries in `trackers.json`, health-checks them against announce results and prunes the dead ones. A community can also publish a curated list on a xite and point the `trackers_xite` setting at it.

### Peer exchange

With `Pex`, a node asks a peer of a xite for more peers of the same xite, sending the ones it already knows. The answer contains connectable peers the caller lacks, plus the responder's own reachable overlay addresses. One reply hands out at most 100 peers, whatever the caller asks for. A peer that is known only because it dialed in, and whose listening port is therefore unknown, is not handed out as connectable. Session handles are never exchanged.

### DHT { #dht }

The node runs a private Kademlia DHT whose one job is the lookup "which peers host this xite". It is independent of trackers, works for rare xites and keeps working if every tracker is down. It is a separate key space from the BitTorrent mainline DHT.

| Property | Value |
| --- | --- |
| Identifier space | 256 bits. Node identifiers and lookup keys share it. |
| Lookup key for a xite | `sha256(address)`, the same value as the tracker hash |
| Distance | XOR, compared as a 256-bit big-endian number |
| Bucket size (`k`) | 8 contacts |
| Lookup parallelism (`alpha`) | 3 |
| Stored peers per key | At most 128, each expiring after 30 minutes |
| Node identifier | Generated per process run |

There are four RPCs, each carried as the payload of an EDX `Kad` request:

| RPC | Answer |
| --- | --- |
| `Ping` | `Pong` |
| `FindNode(target)` | The `k` closest contacts the node knows |
| `GetPeers(key)` | The peers stored for the key, plus closer contacts to continue the lookup |
| `Announce(key, peer)` | `Ack`. The peer is stored under the key. |

Every request includes the caller's contact, and every reply is stamped with the responder's node identifier. Announces are unauthenticated: any node can claim any address for any key. The per-key cap, the expiry and the fact that every discovered peer must still complete a handshake and serve verifiable content bound the damage. Addresses with oversized or malformed overlay hosts are dropped on the way in and on the way out.

Because DHT RPCs ride EDX, the DHT works over TCP, Tor, I2P and the mesh alike. In Tor mode `always`, the DHT waits for the onion service, dials every contact through Tor and claims only its onion address.

### Update propagation

`UpdatesSince` is the pull half of publishing. Every node keeps an in-memory log of the most recent update hints it has seen (10,000 by default), each with a sequence number. A node polls its peers every 30 seconds and immediately re-syncs any xite named in a new hint. A peer that was offline when an update was pushed catches up the next time it connects. The relay is untrusted: it can hint that an update exists, but the update itself is verified by signature.

### LAN discovery

LAN discovery finds peers on the local network without the internet, a tracker or the DHT. It is a separate small protocol over UDP, not part of EDX.

- **Off by default.** Set `local_discovery` to `true` on each device and restart. A participating node answers any device on the network with the hashes of every xite it serves, so it is an opt-in. The `AnnounceLocal` plugin switch pauses both broadcasts and replies while the node runs.
- **Transport.** UDP port 1544, sent to the broadcast address of each active IPv4 subnet. IPv6 has no broadcast and is not used. Loopback and point-to-point interfaces are excluded, and there is no fallback through the default route or a VPN.
- **Messages.** Each datagram is a postcard-encoded message with a command, parameters and a sender record (`service`, `peer_id`, `port`, `broadcast_port`, `rev`). Datagrams whose service is not `epixnet`, or whose `peer_id` is the node's own, are ignored.
- **Exchange.** A `DiscoverRequest` broadcast is answered with a `DiscoverResponse` carrying a change token. If the token differs from the last one seen, the requester sends a `XiteListRequest` and receives a `XiteListResponse` with the responder's xite hashes. The requester then adds the responder as a peer for every xite both serve.

Discovery only finds peers for xites both devices already have or have requested. It does not subscribe a device to everything another device owns. See [Privacy and routing](../start/privacy.md) for setup and limits.

### Reticulum mesh

Mesh peers are reached by Reticulum destination hash. Reticulum moves data as discrete encrypted packets over a link, so `epix-reticulum` adapts a link to the ordered byte stream EDX needs. The current destination uses acknowledged, ordered Reticulum Channel messages. An older destination with a raw packet stream remains for existing peers. Verified mesh announcements supply fallback peers for xites the user has already requested. They do not advertise a list of hosted xites. Mesh is not an anonymity layer: radio discovery is visible to nearby observers.

## Timeouts

| Timer | Clearnet | Overlay (Tor, I2P, mesh) |
| --- | --- | --- |
| Dial plus handshake plus a small request | 15 seconds | 45 seconds |
| One file transfer | 60 seconds | 180 seconds |

In Tor mode `always`, clearnet addresses are dialed through Tor exits and get the overlay budget. Bulk downloads are not cut by elapsed time alone: a batch fails only when no new bytes arrive for a stall window (4 seconds on clearnet, 12 seconds on an overlay), because a slow onion circuit is slow, not dead.

## Changing the protocol

postcard encodes enum variants by index and struct fields by position. The rules that follow are enforced by tests in the repository:

- Variants may only be **appended** to `Req`, `Resp` and `FrameBody`. They are never reordered, renamed in place or removed.
- Fields may only be **appended** to `Hello`, `HelloAck` and the tracker and DHT payload structures.
- A new response variant may only be sent to peers that advertised a capability bit for it, because an older node cannot decode an unknown variant.
- The same append-only rule applies to the LAN discovery messages.

## Diagnostics

- `epix-server peerPing <ip> <port>` opens an EDX link to a clearnet peer and prints five round-trip times. See [Command line actions](../start/running.md#command-line-actions).
- The **Stats** page of a running node lists live connections with direction, bytes, the last request and the xites touched.

## Comparison with the archived Python protocol { #legacy-protocol }

The archived Python node used a msgpack protocol with a `handshake` request and a set of named commands. None of it is spoken by the Rust node. The table maps each legacy command to the closest EDX mechanism, for readers coming from the old documentation.

| Legacy command | In the Rust node |
| --- | --- |
| `handshake` | `Hello` and `HelloAck`, after the magic and, on clearnet, the Noise handshake |
| `getFile`, `streamFile` | `GetRange` for verified ranges, `GetMany` for small whole objects, `GetSigned` for manifests |
| `ping` | The `Ping` and `Pong` frames |
| `pex` | `Pex` |
| `update` | `Update` |
| `listModified` | `ListSigned` |
| `getHashfield`, `setHashfield`, `findHashIds` | `GetBitfield`, `HaveRanges`, `HasXite` and `HasShards`. Availability is tracked per content-addressed object. |
| `getPieceFields`, `setPieceFields` (Bigfile plugin) | `GetBitfield` and `HaveRanges`. Every object is range-addressable, so big files need no separate mechanism. |
| `checkport` | No equivalent peer request. A seeding node asks a public port-check service whether its file server port is reachable, and also treats an inbound public peer that completes a handshake as confirmation. |

Some values did carry over unchanged: the tracker hash `sha256(address)`, the BitTorrent infohash `sha1(address)`, and the packed address encoding for IPv4, IPv6 and onion peers.

## Related pages

- [EDX content distribution](edx.md): what the objects and slices carried by this protocol are.
- [Node architecture](architecture.md): where the protocol sits in the node.
- [Privacy and routing](../start/privacy.md): what each transport reveals.
- [Glossary](../reference/glossary.md): short definitions of the terms used here.
