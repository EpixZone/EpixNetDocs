---
description: Reference for the EpixFrame commands that report on the node and the current xite, subscribe to events, update and clone xites, sign and publish content, and read EVX status. Includes the events the node pushes to pages.
---

# Xite and server commands

These node commands tell a page about the node and about itself, keep it informed as things change, and let it sign and publish content. This page documents each command and the events the node pushes, for xite developers. A xite is a site published on EpixNet; command names keep the older word "site" for compatibility. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first.

All of these commands are forwarded by the wrapper to the node. Unless an entry says otherwise, they act on the xite the page belongs to (the "bound xite"). The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance, and assume the `openWebsocket` event has fired.

## Node information

### ping

Checks that the connection to the node works.

**Permission:** none

No parameters.

**Returns:** the string `"Pong!"`.

```js
var answer = await epixFrame.cmd("ping");
console.log(answer); // "Pong!"
```

### serverInfo

Returns information about the node: version, platform, network reachability, enabled plugins, the visitor's interface settings and the Epix Chain endpoints the node is configured with.

**Permission:** none

No parameters.

**Returns:** an object. The fields a xite is most likely to use:

| Field | Type | Description |
| --- | --- | --- |
| `version` | string | The node version. |
| `rev` | string | The node's build revision. |
| `platform` | string | The operating system the node was built for, for example `linux`, `windows`, `macos`, `android` or `ios`. |
| `language` | string | The interface language configured on the node. Default `en`. |
| `user_settings` | object | The visitor's node-wide interface settings. Always contains `theme` (`"light"` or `"dark"`) and `use_system_theme` (boolean). |
| `plugins` | array of strings | The names of the plugins that are enabled. |
| `ui_restrict` | boolean | `true` on a public gateway, where permission grants, most `ADMIN` commands and writes to xites the gateway does not own are refused. |
| `offline` | boolean | `true` when the node is configured to stay offline. |
| `chain_rpc_url` | string | The Epix Chain REST endpoint the node currently uses. |
| `chain_rpc_urls` | array of strings | Every configured REST endpoint. |
| `chain_evm_rpc_url` | string | The first configured EVM JSON-RPC endpoint. |
| `chain_evm_rpc_urls` | array of strings | Every configured EVM JSON-RPC endpoint, so a page can try the next one after a failure. |
| `chain_block_explorer_url` | string | The configured block explorer. Default `https://scan.epix.zone`. |
| `tor_enabled`, `tor_status` | boolean, string | Tor state. Statuses include `Disabled`, `Bootstrapping`, `Failed`, `OK` and `Always`. |
| `network_status` | object | Per-network inbound reachability: `reachable` plus `clearnet`, `tor` and `i2p` objects, each with `enabled` and `reachable`. |
| `port_opened` | boolean | Whether the node's file server port is reachable from outside. |
| `ip_external` | string or `false` | The node's configured or detected external IP address, or `false` when it is not known. |
| `fileserver_port` | number | The node's file server port. |
| `connections` | number | The number of open peer connections. |
| `bittorrent`, `bt_swarm` | boolean | Whether this build includes BitTorrent support, and whether its swarm can run in the current Tor mode. Check these before offering a feature that depends on them. |
| `epix_browser` | boolean | Whether the node runs under EpixNet Browser. |
| `xid_trust` | object | The state of the node's xID verification, with fields such as `state` and `anchored`. See [xID light client](../internals/xid-light-client.md). |

The object also carries fields kept for the Dashboard and for compatibility with older xites, among them `dist_type`, `fileserver_ip`, `ui_ip`, `ui_port`, `debug`, `timecorrection`, `lib_verify_best`, `plugins_rev`, `tor_has_meek_bridges`, `tor_use_bridges`, `browser_tor_clearnet`, `launch`, `multiuser`, `multiuser_admin` and `master_address`.

```js
var server = await epixFrame.serverInfo();

if (server.ui_restrict) hideEditingControls();
document.documentElement.lang = server.language;

// EpixFrame helpers that read the chain fields (cached after the first call):
var evmRpc = await epixFrame.chainEvmRpcUrl();
```

Notes:

- Feature-detect with the dedicated fields (`bittorrent`, `plugins`, `ui_restrict`) and not with `platform` or `version`.
- The node pushes the same object as a [`setServerInfo`](#the-setserverinfo-event) event when it changes.
- Working with the chain endpoints is covered in [Epix Chain for xite developers](../web3/index.md).

### getTrackers

Returns the trackers this node announces xites to.

**Permission:** none

No parameters.

**Returns:** an array of tracker address strings.

```js
var trackers = await epixFrame.cmd("getTrackers");
console.log(trackers.length + " trackers configured");
```

## Xite information

### siteInfo

Returns what the node knows about the bound xite: its address, a summary of its `content.json`, local settings and permissions, download state, and the identity the visitor currently uses on it.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `file_status` | string | no | An inner path (position 0 in the array form). If that file is already present and every required file of the xite has been downloaded, the answer includes `"event": ["file_done", "<path>"]`. The wrapper's loading screen uses this; a xite rarely needs it. |

**Returns:** an object. An abbreviated example for a visitor who has selected the identity `alice.epix`:

```json
{
  "address": "<address>",
  "address_short": "epix1a",
  "address_hash": "<sha256 of the address, hex>",
  "display": "myxite.epix",
  "canonical_domain": "myxite.epix",
  "auth_address": "<identity address>",
  "cert_user_id": "alice@xid.epix",
  "xid_directory": "alice.epix",
  "identities": [
    {
      "xid": "alice.epix",
      "name": "alice",
      "tld": "epix",
      "auth_address": "<identity address>",
      "directory": "alice.epix",
      "cert_user_id": "alice@xid.epix",
      "selected": true,
      "default": true,
      "linked_at": 1763300000
    }
  ],
  "identity_scope": "inherit",
  "privatekey": false,
  "feed_follow_num": null,
  "content": {
    "address": "<address>",
    "title": "My xite",
    "description": "",
    "modified": 1763500000,
    "files": 12,
    "files_optional": 0,
    "includes": 1
  },
  "settings": {
    "serving": true,
    "own": false,
    "permissions": [],
    "added": 1763400000,
    "modified": 1763500000,
    "size": 482113,
    "size_optional": 0,
    "peers": 4
  },
  "peers": 5,
  "bad_files": 0,
  "tasks": 0,
  "started_task_num": 0,
  "workers": 0,
  "optional_left": 0,
  "size_limit": 1000,
  "next_size_limit": 10,
  "content_updated": 1763500000,
  "update_phase": null,
  "progress": null,
  "clone_status": null,
  "optional_progress": null
}
```

Identity fields:

| Field | Type | Description |
| --- | --- | --- |
| `auth_address` | string or `null` | The address of the identity the visitor uses on this xite. `null` when they browse anonymously. |
| `cert_user_id` | string or `null` | The identity in the form `<name>@xid.epix`. `null` when anonymous. The field name is kept from the era of provider certificates. |
| `xid_directory` | string or `null` | The identity's xID name, for example `alice.epix`. It is also the name of the visitor's directory under `data/users/`. |
| `identities` | array | Every xID identity linked on this node, each with `xid`, `name`, `tld`, `auth_address`, `directory`, `cert_user_id`, `selected`, `default` and `linked_at`. |
| `identity_scope` | string | `"inherit"` when the xite uses the node's default identity, `"xite"` when the visitor chose one for this xite, `"none"` when they chose to be anonymous here. |

Xite fields:

| Field | Type | Description |
| --- | --- | --- |
| `address` | string | The xite's address. |
| `address_short` | string | The first six characters of the address. |
| `address_hash` | string | The SHA-256 hash of the address, in hex. |
| `display` | string or `null` | The `.epix` name the xite was resolved from, if any. Display information only. |
| `canonical_domain` | string or `null` | The `.epix` name the node has verified for this address, if any. |
| `content` | object | The root `content.json`, with `files`, `files_optional` and `includes` replaced by their counts and the signature fields removed. An empty object until the xite's `content.json` has been downloaded and verified. If the xite ships a favicon file but declares none, `favicon` is filled in. |
| `settings` | object | The node's local settings for the xite. See the next table. |
| `privatekey` | boolean | Whether the node has the xite's private key saved. Never the key itself. |
| `feed_follow_num` | number or `null` | The number of newsfeed queries the visitor follows on this xite, or `null` if they never followed it. See [Feeds, notifications and search](../build/feeds-search.md). |

Download and update state:

| Field | Type | Description |
| --- | --- | --- |
| `peers` | number | The number of known peers, including this node when it serves the xite. At least `1`. |
| `bad_files` | number | How many files are still missing or failed to download. Use [`siteBadFiles`](#sitebadfiles) for their paths. |
| `tasks`, `started_task_num`, `workers` | number | Files still to download in the current batch, the size of that batch, and active download workers. |
| `optional_left` | number | Optional files the visitor opted into that are not downloaded yet. |
| `optional_progress` | object or `null` | Progress of a bulk optional file download: `total_files`, `done_files`, `failed_files`, `bytes_total`, `bytes_done`, `current`, `status` and `percent`. |
| `size_limit` | number | The xite's size limit in megabytes. Default `1000`. |
| `next_size_limit` | number | The next size limit tier, in megabytes, that would fit the xite. |
| `content_updated` | number or `false` | The newest `modified` time seen in any `content.json` of the xite. `false` in the event that reports a failed update. |
| `update_phase` | string or `null` | `"checking"`, `"updating"` or `"deleting"` while such a pass runs, otherwise `null`. |
| `progress` | object or `null` | `{ "done": n, "total": m }` for the current phase when it has something countable. |
| `clone_status` | object or `null` | The state of the initial download: `state` (`discovering`, `downloading`, `waiting`, `paused` or `complete`), `attempt`, `next_retry_at`, `reason` and `peers`. |

Fields of `settings`:

| Field | Type | Description |
| --- | --- | --- |
| `permissions` | array of strings | The permissions the visitor has granted this xite. |
| `own` | boolean | Whether the xite is marked as owned on this node. Owner controls key off this. |
| `serving` | boolean | `false` when the xite is paused. |
| `added`, `downloaded` | number | Unix times: when the xite was added, and when a file last finished downloading (`null` before the first sync). |
| `modified` | number | The same clock as `content_updated`. |
| `size`, `size_optional` | number | Total size in bytes of the required and of the optional files. |
| `optional_downloaded` | number | Bytes of optional files actually downloaded. |
| `bytes_sent`, `bytes_recv` | number | Bytes served to and downloaded from peers, across runs. |
| `peers` | number | The last known peer count. |
| `autodownloadoptional`, `download_optional` | boolean | Whether all new optional files are downloaded automatically, and whether optional files may be fetched on demand. See [Files](../build/files.md). |
| `favorite` | boolean | Whether the visitor marked the xite as a favourite. |
| `cache` | object | Internal bookkeeping, such as the retry counts of bad files. |

Optional keys such as `size_limit`, `optional_help` and `modified_files_notification` appear in `settings` only when they have been set. The xite's `wrapper_key` and `ajax_key` are never included.

```js
epixFrame.on("openWebsocket", async function () {
  var info = await epixFrame.siteInfo();

  document.querySelector("#title").textContent = info.content.title;
  document.querySelector("#peers").textContent = info.peers + " peers";

  if (info.cert_user_id) showSignedIn(info.xid_directory);
  else showSignInButton();

  if (info.settings.own) showOwnerTools();
});
```

Notes:

- If the connection is not bound to a xite, the command fails with `no xite bound to this connection`.
- While the xite is still downloading, the object is real but sparse: `content` can be `{}`, and progress counters are filled in from the download. Check that a field exists before reading into it.
- The node pushes the same object as a [`setSiteInfo`](#the-setsiteinfo-event) event whenever it changes. Keep your copy up to date from those events instead of polling.

### siteBadFiles

Lists the files of the bound xite that are still missing or failed to download or verify.

**Permission:** none

No parameters.

**Returns:** an array of inner paths. Empty when the xite is complete.

```js
var missing = await epixFrame.cmd("siteBadFiles");
if (missing.length) console.log("Still waiting for", missing);
```

### siteListModifiedFiles

Lists the files of the bound xite whose bytes on disk differ from what the signed root `content.json` declares, that is, local changes that have not been signed yet. The wrapper uses it to show its "modified files" panel to the owner.

**Permission:** none

No parameters.

**Returns:** `{"modified_files": ["<inner path>", ...]}`. The list is empty when nothing differs, and also when the xite has no verified `content.json` yet.

```js
var res = await epixFrame.cmd("siteListModifiedFiles");
if (res.modified_files.length) {
  showBanner(res.modified_files.length + " unsigned changes");
}
```

Files in directories that have their own included `content.json` are not reported. The first call on a large xite reads every declared file once; later calls only re-read files whose size or modification time changed.

### announcerInfo

Returns tracker announce statistics for the bound xite. The wrapper's loading screen uses it for its discovery status line.

**Permission:** none. The statistics are only filled in for a xite that holds `ADMIN`.

No parameters.

**Returns:** `{"address": "<address>", "stats": {...}}`. For a xite with `ADMIN`, `stats` maps each tracker to an object whose `status` is `announcing`, `announced` or `error`. For any other xite, `stats` is an empty object.

```js
var info = await epixFrame.cmd("announcerInfo");
var announced = Object.values(info.stats).filter(function (t) { return t.status === "announced"; });
```

The node-wide equivalent for the Dashboard is `announcerStats`, in [Admin commands](admin.md#announcerstats).

### resolveStatus

Reports how far the node has got with looking up a `.epix` name on demand. The wrapper polls it once a second to drive its loading screen while a name has no address yet. It needs no bound xite, and a xite page has little use for it.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `host` | string | yes | The name being resolved, for example `alice.epix` (position 0 in the array form). Case is ignored. |

**Returns:** an object.

| Field | Type | Description |
| --- | --- | --- |
| `host` | string | The name asked about, in lower case. |
| `state` | string | `idle` when no lookup is recorded for the name, otherwise the lookup's state, such as `resolving`, `establishing_trust`, `waiting_network`, `resolved` or `failed`. |
| `reason` | string or `null` | A short machine-readable reason for a wait or failure, for example `no_network`, `tor_required` or `offline_policy`. |
| `detail` | string or `null` | A longer description of the last error, if any. |
| `address` | string or `null` | The resolved xite address, once known. |
| `verified` | boolean | Whether the mapping from name to address has been verified. |
| `attempts` | number | How many lookups have been attempted. |
| `since` | number | Unix time at which the current state began. |
| `tor_status` | string | The node's Tor status, as in `serverInfo`. |
| `trust` | string | The state of the node's xID verification, in one word. |
| `sources_reachable`, `sources_total` | number or `null` | How many of the node's chain sources currently answer. |

```js
var status = await epixFrame.cmd("resolveStatus", { host: "alice.epix" });
if (status.state === "resolved") console.log("alice.epix is", status.address);
```

Fails with `Missing host` when no name is given. To resolve names from a xite, use the xID commands in [Identity and cryptography commands](identity.md) instead.

## Event subscription

### channelJoin

Subscribes the connection to one or more event channels. The node only pushes [xite, server and announcer events](#events-pushed-to-the-page) to connections that joined the matching channel.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `channels` | array of strings | no | The channels to join. |
| `channel` | string | no | A single channel to join. |

The command also accepts a bare string or a bare array of strings in place of the object.

| Channel | Events it delivers |
| --- | --- |
| `siteChanged` | `setSiteInfo` |
| `serverChanged` | `setServerInfo` and `setServerErrors` |
| `announcerChanged` | `setAnnouncerInfo` |

**Returns:** `"ok"`.

```js
// Also receive tracker announce progress:
await epixFrame.cmd("channelJoin", { channels: ["announcerChanged"] });
```

Notes:

- **You usually do not need to call it.** The page shares the wrapper's connection, and the wrapper joins `siteChanged` and `serverChanged` every time the connection opens. It joins `announcerChanged` as well when it opened with its loading screen showing.
- Joining is additive and lasts for the life of the connection. After a reconnect the joins are gone; join again from your `openWebsocket` handler.
- Events are delivered for the bound xite. A merger xite also receives the events of the xites merged into it. A xite that holds `ADMIN` receives the events of every xite on the node, which is how the Dashboard keeps its list current. The explicit all-xite subscription is `channelJoinAllsite`, in [Admin commands](admin.md#channeljoinallsite).

## Updating and cloning

### siteUpdate

Starts a background check for a newer version of a xite and downloads what changed, including user content. The command returns immediately; the outcome arrives as events.

**Permission:** none for the page's own xite. Any other xite needs `ADMIN` (or the admin socket).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The address of the xite to update (position 0 in the array form, or a bare string). Default: the bound xite. Must be an address; a `.epix` name is rejected. Another xite's address needs `ADMIN`. |
| `update_request_id` | string | no | A token of 1 to 128 bytes that is echoed in the event that ends this update, so the caller can tell its own request from background updates. Read from the object form only. |

**Returns:** the string `"Updated"`, as soon as the update has been started. It does not mean the update has finished or found anything.

Progress arrives as [`setSiteInfo`](#the-setsiteinfo-event) events for that xite:

| `event` | Meaning |
| --- | --- |
| `["checking", true]` | The node is asking peers whether a newer `content.json` exists. |
| `["updating", true]` | A peer has a newer version and the node is downloading it. Not sent when nothing is newer. |
| `["updated", true]` | The pass ended. `update_applied` is `true` if anything new was downloaded. `update_request_id` repeats your token. After a failed pass (no peer could be reached, for example) `content_updated` is `false`. |

```js
var requestId = "refresh-" + Date.now();

epixFrame.on("request", function (cmd, message) {
  var info = message.params;
  if (cmd !== "setSiteInfo" || info.update_request_id !== requestId) return;
  if (info.content_updated === false) showStatus("Could not reach any peer");
  else showStatus(info.update_applied ? "Updated" : "Already up to date");
});

epixFrame.cmd("siteUpdate", { update_request_id: requestId });
```

Errors: `Unknown xite: <address>` when the node does not serve that address, or when it is another xite and the page lacks `ADMIN` (EpixNet v0.6.8 updates any served xite for any page), and `Xite commands take the epix1 address, not a name: <name>` when a name is passed.

### siteClone

Creates a new xite owned by this node from the files of a xite the node already serves, or upgrades an existing clone with the source's current code. This is how the Dashboard creates a new, empty xite and how hub-style xites create a personal copy.

**Permission:** none. Refused when the node operator has disabled adding xites.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | The address of the source xite (position 0 in the array form). |
| `root_inner_path` | string | no | A directory inside the source to use as the root of the new xite, for example `template-new` (position 1). Default: the whole xite. |
| `target_address` | string | no | The address of an existing xite to upgrade in place (position 2). When absent, a new xite is created. |

**Returns:** `{"address": "<address of the new or upgraded xite>"}`, or `null` when the node does not serve the source address.

What happens for a new xite:

1. The node derives a new address and private key from the visitor's seed and saves the key.
2. It copies the source files. Paths that contain `-default` are the template's clean starting state: they are copied with that suffix removed, and the source's live counterparts are not copied. A clone of a blog with `data-default/` next to `data/` therefore starts empty instead of with the author's posts. Files whose names end in `-old` or `-new` are skipped.
3. It writes a new `content.json` based on the source's (`content.json-default` in the chosen root if present, otherwise the root `content.json`). The title becomes `My <source title>`, or `My New Epix Xite` when the root directory name starts with `template-`. The source address is recorded as `cloned_from` and the root as `clone_root`. Fields tied to the source, such as `domain`, are removed. When the root is a `template-` directory without its own `content.json-default`, the root `content.json` it borrows is reset: `description`, `favicon`, the background colors, `viewport`, `ignore`, `optional` and `shard` start empty, and `order_policy`, `distribution` and `postmessage_nonce_security` are dropped. Structural fields such as `includes`, `user_contents` and `merged_type` are kept. (EpixNet v0.6.8 keeps the source's values, so a xite created from the Dashboard inherits the Dashboard's.)
4. It signs the new xite, starts serving it, and tells the wrapper to navigate to `/<new address>/`.

With `target_address`, the node keeps the target's `content.json` and the data the target already has in place of the template's defaults, copies the source's other files over it, signs, and shows a "Xite source code upgraded!" notification instead of navigating. The node must have the target's private key saved.

```js
// Create a new, empty xite from a template directory (as the Dashboard does):
epixFrame.cmd("siteClone", [info.address, "template-new"]);

// Upgrade an existing clone to the source's current code:
epixFrame.cmd("wrapperConfirm", ["Upgrade this xite? Changes you made to its code files will be lost.", "Upgrade"], function () {
  epixFrame.cmd("siteClone", {
    address: clone.content.cloned_from,
    root_inner_path: clone.content.clone_root || "",
    target_address: clone.address
  });
});
```

Errors and limits:

- `Site still in sync`: the source has files that are not downloaded yet.
- `Target xite private key not known`: an upgrade was requested for a xite this node cannot sign.
- `Adding new xites is disabled on this node`: the operator locked the node's set of xites.
- The page that asked is navigated away after a successful new clone, so do not rely on code that runs after the answer.
- The node does not check the source's `cloneable` flag. That `content.json` field only controls whether the Dashboard offers its Clone action.

Making a xite a good clone source, and publishing, naming and backing up the key of the new xite, are covered in [Publishing](../build/publishing.md).

## Signing and publishing

Changes to a xite reach other nodes only after the `content.json` that lists the changed files has been signed and published. See [Publishing](../build/publishing.md) for the workflow and [User-generated content](../build/user-content.md) for how visitors write to a xite they do not own.

Which key signs depends on which `content.json` governs the path:

| Governing file | Signed with |
| --- | --- |
| The root `content.json` | The xite's private key: the one passed in `privatekey`, or the key the node has saved for the xite. |
| Any other `content.json` (a visitor's `data/users/<name>/content.json`, for example) | The visitor's selected xID identity, unless a key is passed. |

On a public gateway both commands are refused with `This node is a read-only gateway; changes are disabled here` unless the gateway itself owns the xite.

### siteSign

Rebuilds and signs the `content.json` that governs a path: the node refreshes the list of files that `content.json` covers, with their sizes and hashes, and signs the result. Nothing is sent to peers.

**Permission:** none. Signing needs a key: the xite's private key for the root `content.json`, or a selected xID identity for user content.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `privatekey` | string | no | The private key to sign with (position 0). The literal string `"stored"` means "the key the node has saved for this xite". When omitted for the root `content.json`, the saved key is used if there is one. |
| `inner_path` | string | no | Any path inside the part of the xite to sign (position 1). The node finds the `content.json` that governs it. Default `content.json`. A `merged-<type>/<address>/...` or `cors-<address>/...` path signs in that other xite, given the matching permission. |
| `full` | boolean | no | `true` re-hashes every file instead of trusting the node's cache of unchanged files (position 2). Default `false`. |
| `keep_missing` | boolean | no | `true` keeps declared optional files whose file is gone from disk (position 3). By default such entries are removed. |

**Returns:** `"ok"`. The node also pushes a fresh [`setSiteInfo`](#the-setsiteinfo-event).

```js
// Sign the visitor's own content after writing to it:
var info = await epixFrame.siteInfo();
var path = "data/users/" + info.xid_directory + "/content.json";
await epixFrame.siteSign(null, path);

// As the owner, sign the root content.json with the key saved on this node:
await epixFrame.siteSign("stored", "content.json");
```

Errors include `siteSign: privatekey required` (root `content.json`, no key passed and none saved) and `Xite sign failed: Private key not found in users.json` (`"stored"` was passed but no key is saved).

!!! danger "Do not handle private keys in page code"
    Avoid asking a visitor to paste a xite private key into your page. An owner's key is saved on their node when they create or clone a xite, and `"stored"` (or omitting the key) uses it without exposing it to JavaScript. The wrapper's sidebar offers the same signing controls without involving the page at all.

### sitePublish

Signs the `content.json` that governs a path (unless told not to) and pushes it to peers. This is the usual last step of saving: write the file, then publish.

**Permission:** none. Signing needs a key, as for [`siteSign`](#sitesign).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `privatekey` | string | no | The private key to sign with (position 0), or `"stored"`. Same meaning as in `siteSign`. |
| `inner_path` | string | no | Any path inside the part of the xite to publish (position 1). Default `content.json`. `merged-` and `cors-` paths route to the other xite, as in `siteSign`. |
| `sign` | boolean | no | `false` skips signing and publishes the `content.json` as it is on disk. Default `true`. Read from the object form only. |

**Returns:** `"ok"` once the publish attempt has finished. The answer is `"ok"` whether or not a peer accepted the update.

While it works, the node drives wrapper notifications for the calling page only:

- A progress toast opens with "Signing changes..." and continues with the publish. A signing failure closes it as failed.
- When at least one peer accepted the update: a "Changes published." notification.
- When no peer could be reached: "Content publish failed: no peers reachable right now. It will spread on the next sync." The change stays signed on this node and spreads when peers synchronize.

```js
// The write-then-publish pattern the official xites use:
function writePublish(innerPath, base64Data, done) {
  epixFrame.cmd("fileWrite", [innerPath, base64Data], function (res) {
    if (res !== "ok") {
      epixFrame.cmd("wrapperNotification", ["error", "File write error: " + (res.error || res)]);
      return done(false);
    }
    epixFrame.cmd("sitePublish", { inner_path: innerPath }, function (res) {
      done(res === "ok" ? true : res);
    });
  });
}
```

Notes:

- When signing the root `content.json` with neither a passed key nor a saved one, `sitePublish` does not fail: it assumes the file is already signed and publishes it as it is. Use `siteSign` first if you need the error.
- A signing error is returned as `{"error": "..."}` in the usual way.
- `"ok"` means the node did its part, not that the content is available elsewhere. Availability depends on reachable peers.
- The helper `epixFrame.sitePublish(privatekey, innerPath, opts)` merges `opts` into the parameters, so `epixFrame.sitePublish(null, path, { sign: false })` publishes without signing.

## EVX status

EVX runs sandboxed WebAssembly programs that a xite declares in its `content.json`; see [EVX programs](../build/evx.md). These two commands only read state. Asking the visitor for consent is done with [`evxRequest`](wrapper.md#evxrequest), and everything that grants or runs is reserved for the wrapper ([Admin commands](admin.md)).

Both commands take their parameters as an object or not at all. An array or a bare string is refused with `params must be a JSON object`, and an unknown key is refused as well. When the node's `Evx` plugin is disabled, both answer `null`.

### evxInspect

Returns what the xite's EVX declaration asks for and what the node would allow, without compiling or running anything. This is the information the wrapper shows in its consent dialog.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite to inspect. A page may only name its own xite, which is also the default. |

**Returns:** an object.

| Field | Description |
| --- | --- |
| `xite`, `publisher` | The xite's address. |
| `integrity` | How the declaration's integrity was established. |
| `declaration_digest` | The digest that identifies this exact declaration. Consent is bound to it. |
| `declaration` | The parsed declaration: `programs` and `jobs` by id, each marked `usable` or not with `reasons`, plus an `unsupported` list. Usable programs carry their pinned `files` and `effective_limits`. |
| `requested` | What the declaration asks for: `capabilities`, `limits`, `allow_run_once`, and the ids of the usable `programs` and `jobs`. |
| `effective` | What this node would allow: `capabilities`, `limits` after the node's own ceiling, `runtime_profiles`, `allow_run_once` and `allow_background`. |
| `unsupported` | Entries of the declaration this node cannot honor, each with `path` and `reason`. |
| `grant` | The current grant (see `evxStatus`), or `null` when there is none. |
| `host` | Whether this node can execute at all: `execution`, a `reason` when it cannot, the limit `ceiling` and the `background` budget. |

```js
epixFrame.cmd("evxInspect", {}, function (evx) {
  if (!evx || evx.error) return hideEvxFeatures();
  var enabled = evx.grant && evx.grant.enabled && !evx.grant.expired;
  if (!enabled) showEnableButton();   // its click handler sends evxRequest
});
```

Errors include `content.json declares no evx section`, `this connection is bound to another xite` and `EVX service unavailable on this node`. On a public gateway a visitor gets a reduced answer: `grant` is only `{"enabled": true|false}` or `null`.

### evxStatus

Returns the xite's EVX grant, recent runs, scheduled jobs and the reasons it cannot run right now. Unlike `evxInspect` it works for a xite without a declaration and is cheap enough to poll.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite to report on. A page may only name its own xite, which is also the default. |

**Returns:** an object.

| Field | Description |
| --- | --- |
| `xite` | The xite's address. |
| `grant` | `null`, or the stored grant: `enabled`, `expired`, `capabilities`, `limits`, `runtime_profiles`, `allow_run_once`, `allow_background`, `created_unix`, `expires_unix`, `label`, `generation` and `limits_generation`. |
| `generations` | The grant's generation counters, or `null`. |
| `runs`, `run_count` | The most recent run records and the total number of runs recorded. |
| `running` | Whether a program of this xite is running now. |
| `reasons` | Why the xite cannot run, as a list of codes: `no_grant`, `revoked`, `expired`, `run_once_not_allowed`, `background_not_allowed`, `unsupported_host`, `plugin_disabled`. Empty when nothing stands in the way. |
| `asked_unix` | When the xite last asked for consent, or `null`. |
| `host` | As in `evxInspect`. |
| `jobs` | The registered scheduled jobs. Each has `job`, `program`, `schedule`, `enabled`, `paused_reason`, `next_due_unix`, `last_slot`, `last_occurrence`, `failures`, `runs_today`, `daily_limit`, `declaration_digest`, `current_slot` and `waiting_reason`. |
| `scheduler` | `enabled`, `busy_workers`, `next_wake_unix` and `host`. |

```js
epixFrame.cmd("evxStatus", {}, function (status) {
  if (!status || status.error) return;
  if (status.reasons.indexOf("no_grant") !== -1) showEnableButton();
  else if (status.reasons.length) showEvxBlocked(status.reasons);
  else showEvxReady(status.runs);
});
```

On a public gateway a visitor gets a reduced answer: `grant` is only `{"enabled": true|false}` or `null`, each job is reduced to `job` and `enabled`, `scheduler` to `enabled`, `reasons` to `no_grant`, `unsupported_host` and `plugin_disabled`, and `generations`, `runs`, `run_count` and `asked_unix` are left out.

## Events pushed to the page

The node pushes these messages over the connection the page shares with the wrapper. EpixFrame delivers them to `onRequest(cmd, message)` and as the `request` event; the payload is `message.params`.

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd !== "setSiteInfo") return;
  var info = message.params;
  if (info.address !== siteInfo.address) return;   // an event for another xite

  siteInfo = info;
  var event = info.event || [];
  if (event[0] === "file_done" && event[1].endsWith(".json")) reloadData();
  if (event[0] === "cert_changed") updateSignedInUser(info.cert_user_id);
});
```

Rules that apply to all of them:

- **Channels.** An event is delivered only to connections that joined its channel. The wrapper joins `siteChanged` and `serverChanged` for you; see [`channelJoin`](#channeljoin).
- **Scope.** Xite events are delivered for the bound xite, for xites merged into a merger xite, and for every xite when the bound xite holds `ADMIN`. Compare `params.address` with your own address before acting.
- **No echo.** An event caused by a command from this connection is not sent back to it. After your own `fileWrite`, other open tabs receive `file_done`, but your page does not: it already knows what it wrote.
- **Not for the page.** Node notifications, progress toasts, confirmation and prompt dialogs and redirects are handled by the wrapper and never reach `onRequest`.

### The setSiteInfo event

Sent on the `siteChanged` channel whenever something about a xite changes. `params` is the object [`siteInfo`](#siteinfo) returns, usually with an `event` array that says why it was sent.

| `event` | Meaning |
| --- | --- |
| `["file_done", "<inner path>"]` | A file was downloaded and verified, or written by another connection. For a JSON data file, the event is sent after the database has been updated, so it is safe to query again. |
| `["file_deleted", true]` | A file was deleted by another connection. |
| `["cert_changed", "<cert_user_id>"]` | The visitor's identity for this xite changed. The second element is `null` when they are now anonymous. The identity fields of `params` are already updated. |
| `["checking", true]`, `["updating", true]` | An update pass started or found something newer. See [`siteUpdate`](#siteupdate). |
| `["updated", true]` | An update pass ended. `update_applied` says whether anything new arrived. Sent for the node's periodic background checks as well as for `siteUpdate`. |
| `["deleting", true]` | The xite is being removed from the node. |
| `["site_done", "<address>"]` | A xite added with `mergerSiteAdd` finished being added. See [Merger, feed and search commands](merger.md). |
| `["peers_added", <count>]`, `["file_added", ...]`, `["file_failed", "<inner path>"]`, `["clone_status", "<state>"]` | Progress of a xite's initial download. They drive the wrapper's loading screen. |
| (no `event`) | A plain refresh, for example after signing, publishing or a permission change. |

Events sent during a xite's initial download carry a reduced object: `address`, `clone_status`, `peers`, `tasks`, `started_task_num`, `bad_files`, `size_limit`, `settings`, `content`, the identity fields and `event`. Check that a field exists before reading into it.

### The setServerInfo event

Sent on the `serverChanged` channel when node state changes, for example the enabled plugins, the connection count or the Tor status. `params` is the object [`serverInfo`](#serverinfo) returns.

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd === "setServerInfo") applyTheme(message.params.user_settings);
});
```

### The setAnnouncerInfo event

Sent on the `announcerChanged` channel as tracker announces for a xite progress. `params` is `{"address": "<address>", "stats": {...}}`, where `stats` maps each tracker to an object with a `status` of `announcing`, `announced` or `error`. Most xites ignore it.

### The setServerErrors event

Sent on the `serverChanged` channel each time the node logs an error. `params` is the node's list of recent error log lines, each a `[time, level, message]` array, which is what the `ADMIN` command `serverErrors` returns. It exists for the Dashboard's health indicator. Because the wrapper joins `serverChanged` for every xite, your `onRequest` can receive it too; ignore it.

Messages that come from the wrapper itself, such as `wrapperOpenedWebsocket` and `wrapperPopState`, are listed in [Wrapper commands](wrapper.md#messages-from-the-wrapper).

## Related pages

- [API overview](index.md): message shapes, errors, permissions and the command index.
- [Xite anatomy](../build/anatomy.md): the page lifecycle and where these commands fit.
- [Publishing](../build/publishing.md): the owner's workflow, key backup and the command line equivalents.
- [File commands](files.md) and [Database commands](database.md): what a page usually calls between `siteInfo` and `sitePublish`.
- [Admin commands](admin.md): `siteList`, `siteAdd`, `siteDelete` and the other xite management commands that need `ADMIN`.
