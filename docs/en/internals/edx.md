---
description: How EDX distributes xite content. Content-addressed objects, the manifest fields, the verified slice format, small-file bundles, the object store, the fetch scheduler and upload choker, encrypted shards, and the feed and search formats.
---

# EDX content distribution

EDX (Epix Data eXchange) is the part of EpixNet that moves file content between nodes. This page explains what an EDX object is, which fields EDX adds to a signed `content.json`, how byte ranges are verified while they stream, how the node stores, fetches and serves objects, and how encrypted shards, feeds and search build on the same primitives. It is written for contributors and for xite developers who want to know what happens below the [file APIs](../build/files.md).

The wire messages that carry these objects are documented in [Peer protocol](protocol.md). The byte formats summarized here are specified in the node repository: [`docs/edx-slice-format.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/edx-slice-format.md), [`docs/edx-manifest.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/edx-manifest.md) and [`docs/edx-feed-search.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/edx-feed-search.md). Those formats are frozen: changing a constant would give every object on the network a different identity.

## The idea in brief

- **Ownership and mutability stay with `content.json`.** A xite is still defined by a manifest signed with the owner key. EDX does not change the signing model.
- **File bodies are content-addressed.** Every file is identified by the BLAKE3 hash of its bytes, recorded in the signed manifest.
- **Ranges verify while they stream.** A peer can send any byte range of an object together with the hashes needed to check it against the root in the manifest. Corruption is localized to one 16 KiB group, and a page or a video can be used before the whole file has arrived.
- **Fetching is a swarm.** Missing pieces are pulled from many peers at once, rarest first, with duplicates only when a peer stalls.
- **Seeding is rewarded with service, not payment.** A node that serves more is served sooner when peers compete. There is no token, no fee and no chain dependency in the transfer layer.

EDX runs on every transport the node supports: clearnet TCP, Tor, I2P and the Reticulum mesh.

## Objects

An EDX object is identified by the **32-byte BLAKE3 hash of its content bytes**, written as hex in manifests in the `b3` field. This is the plain BLAKE3 hash, so the value in the manifest, the root of the verification tree and an ordinary BLAKE3 checksum of the file are the same.

There are three kinds of content-addressed object:

| Kind | What it holds | Verified by |
| --- | --- | --- |
| File blob | The raw bytes of one file | The `b3` root in the signed manifest |
| Bundle | The bytes of many small files, concatenated | The bundle's BLAKE3 root, declared in the signed manifest |
| Encrypted shard | One encrypted chunk of a self-encrypted file | Its address, which is the BLAKE3 hash of the ciphertext |

Signed manifests themselves (the root `content.json` and each user's `content.json`) are not content-addressed. They are the mutable entry points and are verified by signature.

Because a file's identity is a pure function of its bytes, the same file in two xites is the same object. A node that already holds it does not fetch it again.

## Tree geometry

Verification uses BLAKE3's native binary hash tree, through the `bao-tree` crate.

| Parameter | Value |
| --- | --- |
| Native chunk | 1024 bytes |
| Chunk group | 16 KiB (16 native chunks) |
| Verification granularity | One chunk group |
| Outboard overhead | About 0.4% of the data for large files. Zero for files of 16 KiB or less. |

Hashes below chunk-group level are never stored or sent. The interior hashes of the tree are kept in an **outboard**, a separate file next to the data that holds only hash pairs in pre-order, 64 bytes per node. The data file stays raw file bytes and can be served directly. Outboards are recomputable from the data alone. They are cached locally and never transferred, because a verified slice carries the hashes it needs inline.

## Manifest fields

EDX adds plain JSON fields to the signed `content.json`. The signature covers them like any other field. A manifest declares its generation with `"edx": 1`.

```json title="content.json (excerpt)"
{
  "edx": 1,
  "files": {
    "index.html": {
      "size": 5120,
      "sha512": "...",
      "b3": "...",
      "bundle": "...",
      "off": 0
    },
    "movie.mp4": {
      "size": 734003200,
      "sha512": "...",
      "b3": "..."
    }
  },
  "bundles": {
    "<bundle b3 hex>": { "size": 262144, "seq": 0 }
  },
  "files_merkle_root": "<hex>"
}
```

### Per-file fields

These appear inside `files` and `files_optional` entries.

| Field | Meaning |
| --- | --- |
| `b3` | Hex BLAKE3 root of this file's own bytes. |
| `bundle` | Hex BLAKE3 root of the bundle that holds the bytes. Small files only. |
| `off` | Byte offset of this file inside the bundle. |
| `size` | The file size. Also the object size for `b3`. |
| `sha512` | The legacy hash, kept for the migration window. EDX does not use it to fetch or verify. |

A bundled file's `b3` is the hash of its own bytes, never of the bundle. Deduplication and whole-file verification therefore do not depend on how files are packed. Fetching a bundled file means fetching the byte range `off` to `off + size` of the bundle object.

!!! warning "Files without `b3` cannot be fetched from peers"
    A manifest signed before EDX declares its files with `sha512` only. Such a manifest still verifies, and its files are served locally if they are on disk, but there is no object for a peer to request. Sign the xite again with a current node to add the EDX fields. See [Python interoperability](python-interop.md).

### `bundles`

Every bundle referenced by a file entry must be declared in `bundles`, with its `size`. A fetcher rejects an entry that references an undeclared bundle. The optional `seq` records the order in which bundles were created, so that signing again recovers the append order.

### `files_merkle_root`

A 32-byte commitment to the file set. It is computed over every entry of `files` and `files_optional` that carries a `b3`:

1. Sort the entries by path, in byte order.
2. Leaf hash: `BLAKE3(0x00 || le32(len(path)) || path || b3 || le64(size))`.
3. Parent hash: `BLAKE3(0x01 || left || right)` over adjacent pairs. An unpaired trailing node is promoted unchanged to the next level.
4. The root of an empty set is 32 zero bytes.

### `content_root`

`edx1:<blake3 hex of canonical content.json>:<files_merkle_root hex>:<rev>`. It mirrors an optional on-chain content-root anchor for the xite's name. A xite with no anchor is fully functional. An anchor only adds protection against being served a stale manifest.

### What is not an EDX object

- **Signed merge files** carry a signature per record and have no canonical byte string, because every node's merged file is a local union. They carry no `b3` and keep travelling with the `Update` request and periodic reconciliation. See [Files](../build/files.md).
- **User data files** are not bundled, because they change often. They still carry `b3` when the signing path covers them. User files under 4 KiB are verified as whole blobs and ride inline when an update is pushed.

## Small-file bundles

A xite often has hundreds of tiny files. Making each one a swarm object would cost a round trip per file. Files smaller than 128 KiB are instead packed into bundles of roughly 256 KiB.

The important property is that bundle membership is **stable**. It is recorded in the manifest and decided at signing time, never derived from sorting paths:

- An existing bundle keeps its member list and order as long as its members exist.
- New files are appended to the last bundle, and a new bundle opens when that one is full. Earlier bundles are untouched.
- Editing or deleting a file re-creates only that file's bundle.
- A full repack happens only when enough bundles have decayed below half the target size.

Without this, inserting one stylesheet would shift every later bundle and force visitors to download the whole xite again. Given the same previous assignment and the same file contents, the result is byte-deterministic.

## Verified slices { #verified-slices }

A verified slice is the wire encoding of a response to a range request. For a set of byte ranges, it interleaves in pre-order:

1. **Parent nodes**: 64 bytes each (left hash, right hash) for every interior node on the path to the requested ranges, each sent once.
2. **Chunk-group data**: the raw bytes of every group that overlaps the requested ranges, at most 16,384 bytes per group. The last group of a file may be shorter.

There is no size header. The size comes from the signed manifest and the ranges from the request. Ranges are rounded outward to chunk-group boundaries and truncated to the object size. Several ranges are encoded in one slice, and shared parents are sent once.

The receiver verifies incrementally. Each parent pair must hash to its expected parent, starting from the root in the manifest, and each group must hash to its leaf. The first mismatch aborts the decode. Bytes are released to the caller only after their group has verified, so unverified data never reaches a page or the disk as a finished file.

Special cases:

- An empty range set is an empty slice.
- A whole-object slice of an object of 16 KiB or less is just the raw bytes, with no parent nodes.
- Small whole objects fetched in a batch (`GetMany`) are verified by hashing the whole blob.

The repository pins golden vectors for this format in `crates/epix-blob/tests/golden_vectors.json`: object roots, outboard lengths and hashes, and slice lengths and hashes for boundary cases. Continuous integration fails if any output byte drifts.

## The object store

Objects live in the `edx-store` folder of the [data directory](data-directory.md):

```text
edx-store/
  index.redb          object records, slab metadata, schema version
  sparse/<hex>        partially or fully held large objects (sparse files)
  sparse/<hex>.obao   their outboards, filled as slices arrive
  slabs/<n>.slab      pack files: complete small objects, appended
```

- **Large objects** are sparse files that fill in as slices arrive, in any order. This is what allows a video to play from the middle.
- **Small complete objects and shards** are appended to slab pack files.
- **Completed files of a xite** live in the xite's own folder under `data/<address>/`. The index records where, relative to the data folder, so moving the data folder does not orphan them.
- **The index** is transactional. Object bytes are synced before they are indexed. After a crash, an object is re-scanned against its outboard and anything that does not verify is fetched again instead of served.
- **Quota.** Cached content fetched from others is evicted least recently used beyond a quota, 8 GiB by default. Content you own is exempt. A declared object size is capped at 64 GiB, because the size comes from a publisher's manifest before any peer has proven the object exists.

For an encrypted shard the index records only the address, the size, a reference count and the last access time. It never records which xite a shard belongs to.

## Fetching

The fetch scheduler downloads an object's missing chunk groups from many peers at once.

| Policy | Behavior |
| --- | --- |
| Rarest first | Groups held by the fewest peers are scheduled first, so the swarm keeps every piece alive. |
| Sliding window | Several batches stay in flight per healthy peer, and each slot is refilled as soon as its batch completes. The depth is 2 on clearnet and 6 on overlay links. |
| Batch size | 64 groups (1 MiB) on clearnet, 32 groups (512 KiB) on an overlay link. |
| Stall-only failure | A batch fails, or is raced on another peer, only when no new bytes arrive for a stall window: 4 seconds on clearnet, 12 seconds on an overlay. A slow circuit is not treated as a dead one. |
| Bounded duplication | At most 2 concurrent fetches of the same groups, and duplicates go only to peers of an equal or lower latency class. |
| Durable progress | A failed batch keeps the groups that already verified. Only the remainder is rescheduled. |
| Peer failure limit | A peer is dropped from a fetch after 3 failures. A `Busy` answer is not a failure. |

### Load order

The scheduler fetches in tiers. An owner can declare the order in `content.json`:

- `order_policy.first_paint`: paths to fetch first, at the tightest deadline.
- `order_policy.feed_order`: `newest-first`, `oldest-first`, `pinned-first` or `custom`.
- `order_policy.prefetch`: extra paths to fetch after first paint.

A xite that declares nothing is ordered by file type: markup, styles, scripts, fonts and images first, large media, documents and archives last, everything else in between. The policy orders the node's own fetching only. It is never turned into a serving priority for a remote peer, so an owner cannot claim other people's bandwidth by declaring everything urgent.

### Distribution units

The `distribution` field sets, per path prefix, a `unit` (`package`, `file-refs` or `feed`) and a `retention` (`complete` or `partial`). The longest matching prefix wins. The default is a complete package: a reader converges on the publisher's whole xite, not only the parts they opened. Completion runs in the background after first paint and respects the xite's size limit, which the visitor controls. A path that cannot be completed, such as a large feed, is declared with partial retention.

### Streaming

When a page requests a byte range of a file (for example a `<video>` element seeking), the UI server maps the range to chunk groups, fetches them with a tight deadline, verifies them and answers with HTTP 206 from the sparse store. A served range also triggers read-ahead beyond the play position, so sequential playback finds its bytes already present. Media files that fit in the store quota are completed in the background by default. See [Files](../build/files.md) for the developer view.

## Serving and fairness { #fairness }

Serving is streaming end to end: a range is encoded directly into frames of at most 64 KiB, so a large range is never held in memory, and a cancel from the peer stops the encode between frames.

An upload governor decides who receives bulk data and how fast.

| Mechanism | Value | Purpose |
| --- | --- | --- |
| Free budget per peer | 6 GiB per 10 minutes | An uncontended peer is simply served. Reciprocity matters only beyond this. |
| First-paint exemption | Objects of 4 MiB or less | The files a page needs to render are exempt from choking, within the free budget. |
| Unchoke slots | 16, of which 4 are reserved for overlay peers | Limits how many bulk peers are served at once, without starving Tor-only swarms. |
| Optimistic unchoke | One slot rotates every 30 seconds | Gives newcomers a chance to start reciprocating. |
| Activity window | 60 seconds | Only peers that recently transferred compete for ranked slots. |
| Global upload cap | 8,000,000 bytes per second | Keeps seeding from saturating the uplink. A pacer smooths admitted bulk data to this rate. |
| Foreground yield | Automatic | Bulk serving yields while the user's own downloads are active. |

Ranking for the contended slots is by reciprocity: peers that served this node are served first. Control requests bypass the governor entirely. First-paint bytes bypass the reciprocity choke but not the global cap or the foreground yield. A refused peer receives a `Busy` response with the time to come back.

The governor is on by default. Setting the environment variable `EPIX_EDX_RECIPROCITY=0` disables it and the node serves everything ungoverned.

## Encrypted shards

A xite owner can mark files for self-encryption with the `shard` field of the root `content.json`. At signing time those files leave `files` and `files_optional` and are published under `files_shard` as encrypted, content-addressed pieces.

### How a file is encrypted

1. The file is split into chunks of 1 MiB. The last chunk may be shorter.
2. Each chunk is encrypted with XChaCha20-Poly1305 under its own single-use key.
3. Each ciphertext chunk is stored and addressed by `BLAKE3(ciphertext)`. That address is what peers request.

There are two modes:

| Mode | Key derivation | Properties |
| --- | --- | --- |
| Salted convergent | `BLAKE3::derive_key` with the context `epixnet-selfenc-v1`, over the owner's salt, the chunk's own plaintext hash, the hashes of its two predecessors and its index | Identical content from the same owner deduplicates. The salt changes the ciphertext address per owner. |
| Random key | A random key per file | No deduplication. The sound choice for guessable or low-entropy content. |

The ordered list of chunks (plaintext hash, ciphertext address, lengths) is the file's data map. It is part of the signed manifest, together with the owner's salt (`edx_salt`). The node currently writes and reads self-encrypted files in the salted convergent mode. The random-key mode is implemented in the `epix-selfenc` crate.

!!! warning "This is not access control"
    The data needed to decrypt a self-encrypted file is in the signed `content.json`. Anyone who has the xite's manifest can read the file. What the scheme provides is narrower: a node that holds only ciphertext shards by address, without the manifest, cannot read them or tell which xite they belong to. With the salted mode, such a node also cannot confirm a guess about the plaintext, because it does not know the salt. A party that has the xite address does.

### Volunteering disk

A node can donate disk space to hold shards it cannot read. Set **Donate disk to hold encrypted shards you cannot read** on the Config page (`volunteer_quota_bytes`, where `0` means off). A volunteering node advertises the `SHARDS` capability.

Which shards a volunteer pulls is decided by a local, deterministic rule. The node derives a cache identifier from its account, and is responsible for a shard when the distance between that identifier and the shard address falls under a threshold proportional to its quota. A quota of zero is responsible for nothing, and a larger quota always accepts a superset of a smaller one. A volunteer only stores an address it found inside a manifest whose signature it verified itself.

What exists today and what does not:

| Capability | Status |
| --- | --- |
| Encrypting, publishing and reading self-encrypted files | Implemented |
| Volunteer pull of responsible shards | Implemented |
| Bulk availability probe (`HasShards`) | Implemented |
| Pushing a shard to a volunteer | Not built. It needs an admission guard first, because a push lets a remote peer choose what lands on your disk. |
| Discovery of volunteers across the network and a measured network size | Deferred. The share calculation currently assumes a fixed total. |

## Feeds

`epix-feed` organizes large sets of signed records, such as the posts of a forum, without any privileged party. Everything it produces is a pure deterministic function of the signed record set, so any node rebuilds byte-identical output and no sealer, hub or attester is needed. Convergence only requires that someone hosts the records.

| Structure | Magic | Purpose |
| --- | --- | --- |
| Segment | `EDXSEG1` | The records with a clock at or below a boundary, in canonical order. Its BLAKE3 hash is its content address. |
| Spine | | Segment links, each bound to the previous one. Boundaries must strictly increase, and a divergent or non-increasing spine is rejected, which detects rollback. |
| Checkpoint | `EDXCKPT1`, history `EDXHIST1` | The pruned state: live winners, reaction counts, tombstones and a link to the previous history root. |
| Index | `EDXIDX1` | From a target to a sorted list of `(segment root, offset, length)`, so the view of one post costs work proportional to its own size. |
| Rollup | `EDXROLL1` | Per item: comment count, reaction counts and the newest clock. |

Records are ordered by `(clock, id, author, content address)`. Reactions are counted exactly as an OR-set per author, target and kind: liking again supersedes, unliking retracts. Tombstones are sticky, so a deleted record cannot be resurrected with a higher clock.

## Search

`epix-search` lets a node search a xite without holding all of it. One trust rule applies to both of its tracks: **an answer is only a pointer**. The client always fetches the record the pointer names and verifies it against its BLAKE3 root. An untrusted answerer can omit a result or waste a fetch. It cannot inject a fake match.

- **Tokenizer (frozen).** ASCII letters are lowercased, text is split on non-alphanumeric characters, tokens shorter than 2 or longer than 40 bytes are dropped, and the result is deduplicated and sorted. Non-ASCII characters act as separators in this version.
- **Term hash (frozen).** The first 8 bytes of `BLAKE3(term)`, read as a little-endian 64-bit integer.
- **Track 1: skip filters.** Each segment has an XOR8 filter of its terms, with no false negatives and a false positive rate of about 0.39%. A search walks the spine and skips segments whose filter rejects every query term. Today this works locally only: a node skips segments using filters it derived from records it already holds, because the mapping from a segment to its filter object is not yet published for remote peers.
- **Track 2: inverted index.** A published index of 256 shards (`EDXSHRD1`, with metadata `EDXMETA1`). A term lives in shard `term_hash % 256`. A query fetches the metadata and one shard. Sealing a new segment only appends to the shards it touches, so untouched shards keep their roots.

The completeness of a search has an honest bound. That no match is forged is guaranteed by fetch-and-verify. That no true match is omitted is guaranteed only relative to the root the xite owner signed. A malicious index builder could leave entries out, which is the same trust in the owner that `content.json` already requires. Ranked, fuzzy and cross-xite search are left to optional indexer services. See [Feeds and search](../build/feeds-search.md) for the application side.

## Tuning with environment variables

These variables are read at startup. They are meant for operators and tests. Most nodes never need them.

| Variable | Default | Effect |
| --- | --- | --- |
| `EPIX_EDX_STORE_QUOTA_BYTES` | 8 GiB | Byte quota for cached objects fetched from others. |
| `EPIX_EDX_RECIPROCITY` | on | Set to `0` to disable the upload governor. |
| `EPIX_EDX_COMPLETE_MEDIA` | on | Set to `0` to fetch only the parts of media files that are viewed. |
| `EPIX_EDX_SHARD_UNIVERSE_BYTES` | 1 TiB | The assumed total of shard bytes on the network, used to turn a volunteer quota into a share. |

## Related pages

- [Peer protocol](protocol.md): the requests that carry objects, slices and bitfields.
- [Files](../build/files.md): optional files, big files, streaming and merge files from a xite developer's point of view.
- [content.json reference](../build/content-json.md): every manifest field.
- [Data directory layout](data-directory.md): where the store lives on disk.
- [Glossary](../reference/glossary.md): short definitions of the terms used here.
