---
description: The layout of the EpixNet data directory. What every file and folder holds, which ones are private, what the built-in backup covers, and which files you should never share or delete.
---

# Data directory layout

EpixNet keeps everything it needs in one folder: your identities and keys, your settings, the xites you have visited, caches and logs. This page lists what is in that folder, explains what each item is for, marks the items that must stay private, and tells you what to back up. It is written for node operators, for people moving or restoring a node, and for contributors.

The paths below are relative to the data folder, written `<data folder>`. Not every file exists on every node: many appear only when a feature is used, and some belong to the desktop browser or the mobile apps only.

## Where the folder is

| System | Default location |
| --- | --- |
| Windows | `%APPDATA%\EpixNet` |
| macOS | `~/Library/Application Support/EpixNet` |
| Linux | `~/.local/share/EpixNet`, or `$XDG_DATA_HOME/EpixNet` when that variable is set |

The node chooses the folder in this order:

1. The `EPIX_DATA_DIR` environment variable, when set.
2. The `data_dir` entry in `epixnet.conf` in the default location. The Config page writes this entry when you move the folder.
3. The default location.

`epixnet.conf` itself always stays in the default location, even when its `data_dir` entry points everything else somewhere else. See [Run a node](../start/running.md#data-folder) for moving the folder and running several nodes.

## Overview

```text
<data folder>/
  data/                     one folder per xite, named by address
  private/                  identities, keys, settings, private indexes
  edx-store/                content-addressed object store
  edx-node.key              this node's peer identity key
  tor/  i2p/  mesh/         state of the Tor, I2P and Reticulum transports
  backups/                  archives made by the Backup page
  restore-pending/          a restore waiting for the next start
  bt-cache/                 streamed BitTorrent media
  log/                      desktop browser log
  firefox-profile/          the managed browser profile (desktop)
  browser-ca/               the local certificate authority (desktop)
  debug.log                 the standalone node's log
  lock.pid                  the single-instance lock
  ui_port  ui_addr          the dashboard endpoint in use
  admin.sock                local admin socket (Unix)
  trackers.json             the tracker book
  resolve-cache.json        cached name resolutions
  xid_*.json  xid-*.json    xID trust state and caches
  geoip-city.mmdb           the map database for the dashboard
```

## `data/`: your xites

Each xite lives in `data/<address>/`. The folder is the xite: the same files the owner signed, laid out the same way.

| Path inside `data/<address>/` | What it is |
| --- | --- |
| `content.json` | The signed manifest. See the [content.json reference](../build/content-json.md). |
| The xite's files | HTML, scripts, styles, images and data, at the paths the manifest lists. |
| `dbschema.json` | The description of the xite's SQL database. The database is a cache built from the xite's JSON files and can be rebuilt at any time. See [Database](../build/database.md). |
| `data/users/<user>/` | One directory per user who posted, with that user's own signed `content.json` and data files. In xites that identify users by xID, the directory is named after the name, for example `alice.epix`. See [User content](../build/user-content.md). |
| `pool/w<week>/<xx>.json` | Shards of an anonymous envelope pool, for xites that declare one. See [Channel cryptography](channels-crypto.md). |
| `<file>.piecemap.msgpack` | The piece map of a big file. See [Files](../build/files.md). |

Everything under `data/` is public in the sense that peers who ask for these xites receive the signed files. Unsigned edits you make locally are not sent to anyone until you sign and publish.

If you own a xite, its folder in `data/` is your working copy: you edit files there, then sign and publish.

## `private/`: identities, keys and settings

!!! danger "Never share anything in `private/`"
    This folder holds the master seed and the private keys of your identities and of the xites you own. Anyone who copies it can act as you and publish as your xites. Do not upload it, do not commit it to a repository, and do not paste its contents into a xite, a chat or an AI assistant.

| File | What it holds |
| --- | --- |
| `users.json` | Your master seed, the keys derived for each xite, your linked xID identities with their keys, and the owner keys of xites you created. This is the file that recovers your identity. |
| `users_multi.json` | Additional users, on desktop builds with multi-user support. |
| `config.json` | Node settings. The Config page writes it. You can edit it by hand while the node is stopped. It must be valid JSON. |
| `xites.json` | The registry of xites this node serves, with their per-xite settings. |
| `sites.json` | The registry written by an older node. It is copied to `xites.json` once and then left in place. |
| `permissions.json` | Permissions you granted to xites. |
| `filters.json` | Your mutes and blocked xites. |
| `peers.json` | Known peers, saved between runs. |
| `pins.json` | Optional files you pinned, so they stay pinned across restarts. |
| `optional_limit` | The storage limit for optional files. The default is `10%`. |
| `chart.db` | Statistics behind the dashboard charts. |
| `channels.db` | The private channel index: decrypted messages, search index, ratchet sessions. It is never shared with peers. |
| `rln_usage.json`, `rln_roots.json`, `rln_poison.json` | State of anonymous rate limiting for pools that require it. |
| `evx/` | State of the EVX service: `state.sqlite` and the `workspaces/` of granted programs. |
| `addons/` | Browser extensions installed from xites. |
| `avatar-cache/` | Cached profile pictures. |
| `cache/merger-index-v1/` | Disposable database projections for merger xites. Safe to lose. They are rebuilt. |
| `snowflake.json` | Optional overrides for Tor bridge settings. |
| `nmh-auth-token` | A random secret for the browser extension's native host. A new one is written on every start. |

Plugin on and off switches are stored in `config.json`, in the `plugins_disabled` and `plugins_enabled` lists.

## The object store

| Path | What it holds |
| --- | --- |
| `edx-store/index.redb` | The index of content-addressed objects. |
| `edx-store/sparse/` | Partially or fully downloaded large objects and their verification trees. |
| `edx-store/slabs/` | Pack files of small complete objects and encrypted shards. |
| `edx-node.key` | This node's identity key on the peer network. It is created with owner-only permissions. Keeping it lets the node keep its standing with peers across restarts. |

The store is a cache of objects fetched from other peers, limited by a quota. Files that belong to a complete xite live in `data/<address>/`, and the index only records where. See [EDX content distribution](edx.md).

`edx-node.key` is private. It does not unlock your xites or identities, but anyone who has it can present your node's identity to peers.

## Transport state

| Path | What it holds | Notes |
| --- | --- | --- |
| `tor/state/`, `tor/cache/` | The embedded Tor client's state and directory cache. | Most of it is transient and specific to this machine. |
| `tor/state/keystore/hss/epix/ks_hs_id.ed25519_expanded_private` | The identity key of your onion service. Your `.onion` address is derived from it. | Private. Lose it and the node gets a new onion address. |
| `i2p/destination.key` | The key pair of your I2P destination. Your `.b32.i2p` address is derived from it. | Private. |
| `i2p/` (other files) | The embedded I2P router's own identity and state. | Per machine. Do not copy it to another computer. |
| `i2p/eepsite-hosts.json` | Host names learned by the desktop browser's I2P proxy. | |
| `mesh/identity` | The node's Reticulum identity. Written only when mesh is enabled. | Private. |

## xID trust and caches

| File | What it holds |
| --- | --- |
| `xid_pin.json` | An optional validator pin that you provide. Most nodes do not have one. |
| `xid_lc_pin.json` | The validator set the light client last verified. |
| `xid_lc_state.json` | The light client's last verified chain header. |
| `xid_finality_checkpoint.json` | The highest chain height the node has accepted. It prevents rollback. |
| `xid-identity-cache.json` | Proven name-to-identity resolutions. |
| `xid-profile-cache.json` | Proven display profiles. |
| `resolve-cache.json` | Name-to-address resolutions used when opening xites by name. |

None of these are secret. Do not edit them. See [xID verification and the light client](xid-light-client.md).

## Runtime and housekeeping files

| File | What it is |
| --- | --- |
| `lock.pid` | The operating-system lock that stops two nodes from using the same folder. It may remain after a normal exit. Do not delete it to get past a running process. Close that process instead. |
| `ui_port` | The dashboard port selected at the last start. Scripts and tunnels can read it. |
| `ui_addr` | The dashboard address and port in use. |
| `admin.sock` | A local socket that command line actions use to reach the running node. Unix only. Treat access to it as full control of the node. If the data folder cannot host a socket (for example on a network share), the socket is created in a per-user directory and `admin.sock.path` records where. |
| `debug.log`, `debug.log.old` | The standalone node's log. It is rotated at startup when it grows too large. |
| `log/epix-browser.log` | EpixNet Browser's log on Windows when it is started from a shortcut. Rotated above 2 MB. |
| `trackers.json` | The tracker book: trackers learned from peers, with health statistics. |
| `geoip-city.mmdb` | The location database for the dashboard's world map, unpacked on first run. |
| `bt-cache/` | Media streamed through the BitTorrent bridge, in builds that include it. |
| `backups/` | Archives created by the Backup page. |
| `restore-pending/` | A restore staged by the Backup page. It is applied at the next start, before anything reads the folder. |

## Browser files

These exist on desktop when you use EpixNet Browser.

| Path | What it holds |
| --- | --- |
| `firefox-profile/` | The managed Firefox profile, including the Epix Wallet extension's storage. |
| `browser-ca/` | The per-install certificate authority that makes `.epix` pages secure origins. Its private key is here. |
| `browser-settings.json` | Browser routing settings, such as whether general clearnet traffic goes through Tor. |

On iOS, the node also serves the wallet web app from `wallet-ui/`, staged from the app at launch.

`browser-ca/` and `firefox-profile/` are private. The certificate authority is only trusted by your own managed profile, but its key should still never leave your machine.

## What to back up

The **Backup** page of the node (`/Backup`) creates archives you can restore on the same or another machine. An archive is a ZIP file whose first entry is a `manifest.json` describing its contents. With a password, the data entries are AES-256 encrypted. You choose which components to include:

| Component | Files | Why it matters |
| --- | --- | --- |
| Keys and identity | `private/users.json`, `private/users_multi.json` | Recovers your identity and the keys of xites you own. This is the one you cannot recreate. |
| Node settings | `private/config.json` | Convenience. |
| Xites and xite data | `private/xites.json`, `private/permissions.json`, `private/filters.json` and every `data/<address>/` tree | So the node serves the same xites again without downloading them. |
| Onion and I2P address keys | The onion identity key and `i2p/destination.key` | Keeps your `.onion` and `.b32.i2p` addresses after a move. |

Restoring never changes a running node. The selection is staged in `restore-pending/` and applied at the next start.

Things the built-in backup does not include:

- **The browser profile.** The Epix Wallet extension keeps its storage in `firefox-profile/`. Back up your wallet with the wallet's own tools. See [Browser and wallet](../start/browser-wallet.md).
- **The private channel index** (`private/channels.db`). Your decrypted message history is local to the node.
- **Caches and logs.** The object store, name caches, tracker book and logs are rebuilt as the node runs.
- **Other Tor and I2P state.** Guards, circuits and router identities are specific to one machine and are deliberately left out.

If you prefer to copy files yourself, stop the node first and copy `private/` and `data/`. Treat any copy of `private/` exactly as you treat the original.

!!! tip "Recovering the key of a xite you own"
    Owner keys can be recovered from the master seed in `users.json` together with the `address_index` recorded in the xite's signed `content.json`, even on an installation whose `users.json` is older than the xite. Turn on **This is my xite** in the xite sidebar to attempt it. Xites created by early versions may lack `address_index`. For those you need a `users.json` backup that contains the key, or the key itself. See [Publishing](../build/publishing.md).

## Moving the folder

Use **Config > Storage** to move the data folder. The move is applied at the next start: the node copies `private/` and `data/` to the new location before it opens any database, and switches only after the copy has finished. The original stays in place as a backup, so the destination needs room for a full copy.

Browser profiles, wallet extension storage and browser certificates are not part of the move. They stay in the original folder.

Do not delete the source or merge partial folders by hand if a move fails. Fix the problem named in the startup error and start the node again.

## What is safe to remove

- **`cache/merger-index-v1/` under `private/`**: disposable. It is rebuilt.
- **`backups/`**: remove archives you no longer need, from the Backup page or by hand.
- **Log files**: safe to delete while the node is stopped.
- **A xite**: remove it from the dashboard, not by deleting its folder, so that the node also updates its registry.

Do not delete `lock.pid` to work around a running node, and do not delete files in `private/` unless you know exactly what they hold.

## Related pages

- [Run a node](../start/running.md): ports, environment settings and moving the folder.
- [Dashboard and sidebar](../start/dashboard.md): the Config and Backup pages.
- [Python interoperability](python-interop.md): what carries over from an older installation.
- [Node architecture](architecture.md): which component writes which file.
- [Glossary](../reference/glossary.md): short definitions of the terms used here.
