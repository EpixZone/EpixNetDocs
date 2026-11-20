---
description: How the Rust EpixNet node relates to the archived Python implementation. What still carries over (keys, signatures, content formats, the data folder), what does not (the peer protocol, plugins), and how to move an old installation to the current node.
---

# Python interoperability and migration

EpixNet was first implemented in Python. That implementation is archived, and the node described in these docs is a rewrite in Rust. This page states exactly what the two have in common, where they no longer interoperate, and how to move an existing Python installation to the current node without losing your identity or your xites (peer-hosted websites on EpixNet). It is written for people who ran the Python node, for xite owners with older content, and for contributors who meet references to the Python code in the source.

The archived implementation is at [EpixZone/ArchivedEpixNet](https://github.com/EpixZone/ArchivedEpixNet). The current node is at [EpixZone/EpixNet](https://github.com/EpixZone/EpixNet).

## Summary

| Area | Status |
| --- | --- |
| Addresses, private keys, signatures | Compatible. The Rust cryptography reproduces the Python implementation bit for bit. |
| `content.json` signing and verification | Compatible. A manifest signed by either implementation verifies in the other. |
| File transfer between peers | **Not compatible.** The Rust node speaks only EDX. Python nodes and Rust nodes cannot exchange files. |
| Peer discovery | The tracker hash and packed address formats are unchanged, but Epix trackers are reached over EDX. A peer of the other implementation that turns up through a shared public tracker still cannot be connected to. |
| The data folder | Compatible layout. The Rust node reads a Python installation's identity and xite list. |
| Settings (`epixnet.conf`) | A few keys are imported once. The rest are ignored. |
| Plugins | Not compatible. Python plugins are not loaded. |
| The page API | The EpixFrame command names used by xites are kept, including the historical `site` prefix (for example `siteInfo`). See the [API overview](../api/index.md). |

!!! warning "The two networks do not mix"
    A Rust node drops any connection that does not start with the EDX magic, which includes every Python peer. A xite that is only seeded by Python nodes cannot be downloaded by a Rust node. Someone who holds the files has to bring them into a current node and publish from there.

## What changed on the wire

The Python node used a msgpack request and response protocol with commands such as `getFile`, `streamFile`, `pex`, `update` and `listModified`, and verified files by SHA-512 hashes. The Rust node replaced all of it with EDX: a different framing and encoding, mandatory encryption on clearnet links, an authenticated handshake, and content-addressed objects verified with BLAKE3 while they stream. The change was a deliberate clean break and not a negotiated upgrade.

[Peer protocol](protocol.md#legacy-protocol) has a table that maps each legacy command to its closest EDX mechanism.

### A historical note

The node repository contains [`docs/python-interop.md`](https://github.com/EpixZone/EpixNet/blob/main/docs/python-interop.md), a record of a live test from July 2026 in which a Rust node and Python EpixNet 0.2.7 exchanged pings, file downloads, peer exchange and signed updates in both directions. That test was run while the Rust node still carried the msgpack protocol. It remains useful as evidence that the content and signature formats are compatible:

- The Rust node verified and accepted a `content.json` signed by the Python node.
- The Python node verified and accepted a `content.json` signed by the Rust cryptography.

The wire-level parts of that document no longer describe the current node. The `peerGetFile` and `peerCmd` actions it drives are Python client actions that speak the retired msgpack protocol, so they cannot reach a current node. The Rust node's own `peerPing` action measures an EDX link.

## What carries over

### Keys, addresses and signatures

`epix-crypt` was written to match the Python `CryptEpix` module exactly:

| Item | Format |
| --- | --- |
| Address | Keccak-256 of the 64-byte uncompressed public key, last 20 bytes, bech32 with the prefix `epix` |
| Private key | WIF: base58check of `0x80` followed by the 32-byte key, with no compression flag |
| Signature | Recoverable ECDSA over secp256k1, serialized as one recovery byte followed by `r` and `s`, in base64 |
| Per-xite key | The same derivation from the master seed as the Python node |
| Message encryption | The same ECIES scheme, used today only to read legacy mail |

A private key or master seed from a Python installation therefore produces the same addresses and valid signatures in the Rust node.

### Signed manifests

`epix-content` serializes the signed part of a `content.json` exactly as the Python node did (keys sorted, the `sign` and `signs` fields removed) and applies the same verification rules: delegated signers, user-content certificates, path and size checks, and include rules.

What is new is the set of EDX fields that current nodes add when signing (`edx`, `b3`, `bundle`, `bundles`, `files_merkle_root`). They are ordinary fields inside the signed payload. A verifier that does not know them still verifies the signature, because unknown fields were always part of the signed data. The legacy `sha512` field is still written during the migration window.

!!! warning "Old manifests verify but their files cannot be fetched"
    A manifest that was signed before EDX lists its files with `sha512` only. A current node accepts the signature and serves the files locally if they are on disk, but peers have no object to request, so the files cannot be downloaded from the network. The fix is to sign again with a current node:

    - **A xite you own:** sign and publish it once. See [Publishing](../build/publishing.md).
    - **User content inside a xite:** each user's directory is signed by that user. Those files become available again when their author signs them with a current node.

    The node log reports this case as manifests that carry no `b3`.

### Other formats

- **`dbschema.json`** and the JSON-to-database mapping work as before. See [Database](../build/database.md).
- **Big-file piece maps** (`<file>.piecemap.msgpack`) keep their format.
- **`trackers.json`** uses the same file name and schema. Legacy `epix://` entries are rewritten to the transport-explicit form (`tcp://`, `onion://`, `i2p://`) when the file is loaded.
- **Backup archives** made by older nodes that list xites under the key `sites` still restore.

## Moving a Python installation to the Rust node

The Rust node uses the same data folder layout as the Python node: node files under `private/`, one folder per xite under `data/`. If you install the current node on a machine that ran the Python node, it finds that folder and takes it over.

### Before you start

1. **Stop the Python node.** Two nodes must never use one data folder at the same time.
2. **Copy the whole data folder somewhere safe.** Some of the steps below are one-way. See [Data directory layout](data-directory.md) for where the folder is.
3. **Install the current node** for your platform. See [Install EpixNet](../start/install.md).

### What happens on the first start

| Item | What the node does |
| --- | --- |
| Data folder location | Uses the default location, or the `data_dir` entry of `epixnet.conf` there if you had moved the folder. |
| `private/users.json` | Loads your master seed and keys. An older file is upgraded in place: your xID certificate becomes your first linked identity and the default one, and the per-xite certificate entries are dropped. This upgrade is one-way. |
| `private/sites.json` | Copied once to `private/xites.json`, which the Rust node uses from then on. The old file is left in place. |
| `epixnet.conf`: `tor`, `fileserver_port`, `language` | Moved into `private/config.json` if that file has no value of its own, and removed from `epixnet.conf` so the two never disagree. Change them on the Config page from then on. |
| `epixnet.conf`: `ui_ip`, `ui_port` | Honored for the dashboard address, so a headless server keeps its address. `EPIX_UI_ADDR` and a `ui_port` in `config.json` take precedence. |
| `epixnet.conf`: any other key | Ignored. The node prints a warning that names the ignored keys. Gateway-mode switches and resolver addresses are deliberately not imported from an old installation. |
| `trackers.json` | Loaded, with legacy entries rewritten. |
| Xite folders in `data/` | Served from disk at once. Content that verifies loads normally. |

If `EPIX_DATA_DIR` is set, the node does not read `epixnet.conf` at all. You are then in explicit control of the layout.

Settings that the Python node kept in `epixnet.conf` and that the Rust node does not import have to be set again on the Config page. A hand-edited `private/config.json` must be valid JSON. If it is not, startup stops with an error instead of silently running with default network settings.

### After the first start

1. **Check your identity.** Open the Config page and confirm that your linked xID appears under Identities. See [xID: names and identity](../start/xid.md).
2. **Sign and publish the xites you own**, so that their manifests gain the EDX fields and current nodes can download them.
3. **Expect old user content to be thin at first.** Posts whose authors have not yet signed with a current node are listed in the manifests but cannot be fetched from peers.
4. **Review your settings.** Tor mode, the file server port and the language were imported. Everything else starts from the defaults.
5. **Check the ports.** The dashboard uses `127.0.0.1:42222` by default. Automatic port selection skips ports `43110` through `43113`, the historical service range of older nodes, so that the two never collide. See [Ports](../start/running.md#ports).

### Going back

`sites.json` is left untouched, so the Python node's xite list is still there. The upgrade of `users.json` is one-way, however, and xites you sign with the current node gain fields and a newer version number. If you think you may want to return to the Python node, keep the copy of the data folder you made before the first start and restore that copy.

Because the two implementations do not share a network, running the Python node again does not give you access to xites published by current nodes.

### Running both side by side

You can run a Python node and a Rust node on one machine for comparison, as long as each has its own data folder. Start the Rust node with a separate folder:

```sh
EPIX_DATA_DIR=/path/to/separate/folder EPIX_HEADLESS=1 epix-server
```

Do not point both at the same folder. The Rust node would adopt the Python registry once and the two would then diverge.

## Plugins

The Python node was extended by plugins that patched its classes at runtime. The Rust node has an explicit, compiled plugin system instead (`epix-plugin`), and its standard plugins are built in. Python plugins cannot be loaded, and the Python `plugins.json` file is not read. Features that used to be Python plugins are part of the node now: the sidebar, tracker gossip, the peer database, optional and big files, LAN discovery, and name resolution through xID.

Plugins that can be switched on and off are listed on the **Plugins** page of the node. The switches are stored in `private/config.json`.

## For contributors: Python references in the source

Many comments in the Rust source refer to the Python code by name, because modules were ported one by one and checked against it. A few conventions help when you read them:

- "EpixNet" in an older comment often means the Python implementation, for example "matches EpixNet's `ContentManager`".
- Names such as `CryptEpix.py`, `ContentManager.py` or `FileServer` refer to files and classes in the archived repository.
- Comments that mention msgpack describe the retired protocol. Where they explain why something exists (for example a field that "was a msgpack handshake field with no EDX equivalent"), the behavior they describe is historical.
- Compatibility that still matters is tested. `epix-crypt` and `epix-content` carry test vectors and differential tests (`tests/vectors.json`, `tests/content_vectors.json`, `tests/differential.rs`) that pin the Python-compatible output.

When this page and a source comment disagree about what interoperates today, trust the code paths: the accept loop in [`crates/epix-protocol/src/server.rs`](https://github.com/EpixZone/EpixNet/blob/main/crates/epix-protocol/src/server.rs) drops anything that is not EDX.

## Related pages

- [Peer protocol](protocol.md): the current wire protocol and the legacy command map.
- [EDX content distribution](edx.md): the manifest fields a re-signed xite gains.
- [Data directory layout](data-directory.md): every file in the folder you are migrating.
- [Publishing](../build/publishing.md): signing and publishing a xite.
- [Run a node](../start/running.md): ports, settings and running several nodes.
