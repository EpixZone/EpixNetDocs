---
description: Reference for the privileged EpixNet commands. Who may call them (ADMIN xites, the wrapper, the local admin socket), what public gateways still answer, and every command for xite management, storage, keys, configuration, logs, network, statistics, feeds, content filters, identities, users, avatars and EVX management.
---

# Admin commands

Admin commands administer the node itself: list, add and delete xites (sites published on EpixNet), change per-xite and node-wide settings, read logs and statistics, manage identities and content filters, and stop the node. A second group, the wrapper-only commands, records the visitor's decisions in the wrapper's own dialogs, such as granting a permission or enabling an EVX program. This page is for developers of dashboard-style xites, for operators who script a node, and for anyone who wants to know exactly what a privileged xite can do. Read the [API overview](index.md) first for how commands travel and how answers and errors are shaped.

!!! danger "ADMIN is full control of the node"
    A xite that holds `ADMIN` can change the node's configuration, delete xites, save and use signing keys, read logs and shut the node down. Grant it only to a xite whose developer you trust completely. Almost no xite needs it.

## Who can run these commands

Three kinds of caller carry more authority than an ordinary page.

| Caller | How it is recognized | What it may run |
| --- | --- | --- |
| A xite granted `ADMIN` | The page's own commands, forwarded by the wrapper, while the xite holds the `ADMIN` permission. | Every command marked `ADMIN` on this page. Not the wrapper-only commands. |
| The wrapper (wrapper authority) | The wrapper's own commands, numbered from 1000000 up, on a WebSocket that the wrapper opened with the xite's secret `wrapper_key`. | Every command on this page, including the wrapper-only ones. |
| The local admin socket | A connection to the node's Unix socket `admin.sock` in the data folder. | Everything, with none of the gateway, NoNewSites, UiConfig or UiPluginManager restrictions described below. |

**ADMIN never confers wrapper authority.** An `ADMIN` xite cannot grant permissions, record EVX consent, or touch the avatar cache, and it cannot reach those commands through [`as`](#as) either. Wrapper authority is what proves that a real person answered a dialog in the wrapper, and a page can never produce it: it runs in an opaque origin, so it cannot read the `wrapper_key`, and the wrapper drops any page message that claims an id from 1000000 up. See [The wrapper sandbox](../build/sandbox.md#who-can-run-which-command).

### How a xite gets ADMIN

The shipped Dashboard (`dashboard.epix`) is granted `ADMIN` automatically on a normal node, but only at its own fixed address: if a name points to a different xite, that xite still has to ask. Public gateways grant it to nothing. Any other xite asks with [`wrapperPermissionAdd`](wrapper.md#wrapperpermissionadd):

```js
var info = await epixFrame.cmd("siteInfo");
if (info.settings.permissions.indexOf("ADMIN") < 0) {
  // The wrapper shows a prompt that warns the visitor to trust the developer.
  epixFrame.cmd("wrapperPermissionAdd", "ADMIN", function (result) {
    if (result === "ok") location.reload();
  });
}
```

Without the permission, an `ADMIN` command answers `{"error": "You don't have permission to run <command>"}`.

### The local admin socket

On Linux and macOS a running node listens on `admin.sock` in its data folder. The socket file is created with mode `0600`, so only someone with file access to the data folder can use it. If the data folder cannot hold a Unix socket (a network share, for example), the node listens in a per-user directory instead and writes the real path to `admin.sock.path`. Windows has no admin socket.

Each connection takes one JSON request per line and answers one JSON line:

```json
{"cmd": "siteList", "params": {}, "xite": "<address>"}
```

| Field | Meaning |
| --- | --- |
| `cmd` | The command name. An unregistered name is answered with `{"error": "unknown command: <name>"}` instead of the `null` a page gets. |
| `params` | The parameters. Default `{}`. |
| `xite` | Optional. Binds the session to a xite, for commands that act on the bound xite. |

The answer is `{"result": <value>}`, or `{"error": "<message>"}` when the command failed. A command that reports failure in its result still comes back as `{"result": {"error": "..."}}`.

The `epix-server` command line uses this socket. `siteCmd` sends any command bound to one xite and prints the result as JSON, and the `siteList`, `siteDelete`, `siteDownload` (which sends [`siteAdd`](#siteadd)) and `siteSignMessage` actions run through it when a node is running:

```sh
epix-server siteCmd <address> configList
epix-server siteCmd <address> dbReload
epix-server siteCmd <address> optionalLimitSet '"10%"'
```

`siteCmd` always takes an address, even for node-wide commands. Without a running node it fails with `node is not running (no admin socket)`. See [Command line actions](../start/running.md#command-line-actions).

!!! warning "The admin socket is an operator channel"
    Commands sent through the admin socket run with full access, including on a public gateway. Treat file access to the data folder as full control of the node.

### Public gateways

A node in restricted mode (`serverInfo().ui_restrict` is `true`) is a public gateway: any visitor can open its pages, so no visitor is trusted. On such a node every `ADMIN` command answers `{"error": "<command> is disabled on this gateway"}`, except this read-only allow-list, which the public Dashboard needs:

`announcerStats`, `channelJoinAllsite`, `chartDbQuery`, `chartGetPeerLocations`, `feedQuery`, `feedSearch`, `notificationCount`, `notificationQuery`, `optionalLimitStats`, `serverPortcheck`, `sidebarGetHtmlTag`, `sidebarGetPeers`, `siteList`.

The wrapper-only commands are refused there too, as are the global form of [`networkRetry`](#networkretry), `corsPermission` and the local profile commands. The admin socket is the sanctioned way to change a gateway.

### Other gates

- **NoNewSites.** When the operator enables the NoNewSites plugin, or sets the `no_new_sites` configuration key to `true`, `siteAdd`, `siteClone` and `mergerSiteAdd` answer `Adding new xites is disabled on this node`, and `siteDelete` and `mergerSiteDelete` answer `Deleting xites is disabled on this node`. The node also shows the message as an error notification. The admin socket is not affected.
- **UiConfig and UiPluginManager.** With the UiConfig plugin disabled, `configList` and `configSet` answer `The configuration page is disabled on this node`. With UiPluginManager disabled, `pluginList` and `pluginConfigSet` answer `The plugin manager is disabled on this node`. Only the admin socket or the configuration file can change these settings then.
- **Plugin commands.** A command that belongs to a disabled plugin answers `null`, as if it did not exist: the Sidebar commands (`sidebarGetHtmlTag`, `sidebarGetPeers`, `siteSetLimit`), the EVX commands (plugin `Evx`) and the Multiuser commands. `serverInfo().plugins` lists the enabled plugins.

## Conventions

- **The bound xite.** Most commands act on the xite the connection is bound to, which for a page is its own xite. A Dashboard that manages other xites wraps the command in [`as`](#as). Some commands also accept an `address` parameter, as noted in their tables.
- **Addresses, not names.** Parameters named `address` or `site_address` take an `epix1` address. A command that checks this answers `Xite commands take the epix1 address, not a name: <name>` for a `.epix` name.
- **Parameter forms.** Unless a table says otherwise, a command accepts its parameters as an object with the named keys, as a positional array in the listed order, or, for a single string parameter, as a bare string. The EVX commands accept only an object.
- **Errors.** A failure arrives as a result of the form `{"error": "..."}`. With the Promise form of `epixFrame.cmd` it rejects the Promise. Some commands report an expected outcome the same way, for example `{"error": "Xite already added"}`.
- **During startup.** Commands that save per-xite settings answer `Xites are still being restored. Try again after startup.` until the node has finished loading its xites.
- **Legacy names.** Command and parameter names keep the word `site` (`siteList`, `site_address`) for compatibility. They work on xites.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance, in a xite that holds `ADMIN`. EpixFrame has convenience methods for `feedQuery`, `feedSearch` and `muteList`; every other command on this page goes through `epixFrame.cmd`.

## Xites on the node

### siteList

Returns the [`siteInfo`](xite.md#siteinfo) object of every xite the node serves. A xite served under both its address and a `.epix` name appears once.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters. The Dashboard sends `{connecting_sites: true}`, which the node ignores.

**Returns:** an array of `siteInfo` objects.

```js
var xites = await epixFrame.cmd("siteList", {});
xites.forEach(function (x) {
  console.log(x.address, x.content && x.content.title, x.peers);
});
```

### siteAdd

Starts serving a xite and downloading it from peers.

**Permission:** `ADMIN`. Refused by NoNewSites, except on the admin socket.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | The xite's address (position 0). |

**Returns:** `"ok"` when the node now serves the xite, `{"error": "Xite already added"}` when the node already had it, or `{"error": "Invalid address"}` when it could not be added.

```js
var result = await epixFrame.cmd("siteAdd", { address: "<address>" });
```

Notes:

- Follow the download through `setSiteInfo` events on a connection that joined `siteChanged` for every xite ([`channelJoinAllsite`](#channeljoinallsite)).
- `epix-server siteDownload <address>` sends this command through the admin socket.

### siteDelete

Removes a xite from the node and deletes its files.

**Permission:** `ADMIN`. Refused by NoNewSites, except on the admin socket.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite to remove (position 0). Defaults to the bound xite. |

**Returns:** `"ok"` when the xite was removed.

```js
await epixFrame.cmd("siteDelete", { address: "<address>" });
```

Notes:

- The answer comes after the removal finished. Meanwhile the node pushes progress to connected dashboards, which show the row as deleting.
- Errors: `Unknown xite: <address>`, and `Xite removal completion failed: ...` when the removal task itself failed.
- Deleting a xite you own deletes your local copy, not the copies other nodes hold. Back up its private key first. See [Owner keys](../build/publishing.md#owner-keys).

### sitePause

Pauses a xite: the node stops checking it for updates and stops its downloads until it is resumed. The setting is saved.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite to pause (position 0). Defaults to the bound xite. |

**Returns:** `"ok"`. The node pushes an updated `setSiteInfo`, where `settings.serving` is now `false`.

```js
await epixFrame.cmd("sitePause", { address: "<address>" });
```

A paused xite refuses [`siteDownloadOptionalPrevious`](#sitedownloadoptionalprevious) and the address form of [`networkRetry`](#networkretry). Pausing also cancels a running one-shot optional download pass. Errors: `Unknown xite: <address>`, `Could not save xite settings: ...`.

### siteResume

Resumes a paused xite.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite to resume (position 0). Defaults to the bound xite. |

**Returns:** `"ok"`, with `settings.serving` back to `true`.

```js
await epixFrame.cmd("siteResume", { address: "<address>" });
```

### siteReload

Checks the bound xite's peers for a newer `content.json` and, if one is found, verifies it and downloads the changed files.

**Permission:** `ADMIN`

No parameters. An `inner_path` parameter is accepted and ignored.

**Returns:** `"ok"` once the check finished, whether or not a newer version was found. The node then pushes a fresh `setSiteInfo`.

```js
await epixFrame.cmd("as", ["<address>", "siteReload", {}]);
```

Errors include `no transport yet (still connecting)` when the node has no network connection yet. A paused xite is not checked. For the non-privileged way to ask for an update, see [`siteUpdate`](xite.md#siteupdate).

### siteFavourite

Marks a xite as a favourite in the Dashboard and the sidebar.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite (position 0). Defaults to the bound xite. |

**Returns:** `"ok"`. The mark appears as `settings.favorite` in `siteInfo`.

```js
await epixFrame.cmd("siteFavourite", { address: "<address>" });
```

### siteUnfavourite

Clears a xite's favourite mark. Parameters, answer and errors are the same as for [`siteFavourite`](#sitefavourite).

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite (position 0). Defaults to the bound xite. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("siteUnfavourite", { address: "<address>" });
```

### siteSetSettingsValue

Sets one whitelisted per-xite setting on the bound xite. The only accepted key is `modified_files_notification`, which records whether the wrapper's "modified files" panel is shown open (`true`) or collapsed (`false`) for this xite.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | Must be `modified_files_notification` (position 0). |
| `value` | boolean | no | The new value (position 1). Anything other than a boolean counts as `false`. |

**Returns:** `"ok"`, or `{"error": "Can't change this key"}` for any other key.

```js
await epixFrame.cmd("siteSetSettingsValue", ["modified_files_notification", true]);
```

The wrapper sends this command itself when the visitor opens or closes the panel.

## Storage and optional files

These commands set how much a xite may store and which of its optional files the node fetches. The concepts are explained in [Files and media](../build/files.md#optional-files) and the Dashboard side in [Files: optional files and storage](../start/dashboard.md#files-optional-files-and-storage). The non-privileged optional file commands are in [File commands](files.md#optional-files).

### siteSetLimit

Sets the bound xite's storage limit in megabytes. This command belongs to the Sidebar plugin.

**Permission:** `ADMIN`. Answers `null` while the Sidebar plugin is disabled.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `size_limit` | number or string | yes | The limit in MB (position 0, or the bare value). A numeric string such as `"50"` is accepted. |

**Returns:** `"ok"`.

```js
// What the Dashboard sends for a row that hit its limit:
await epixFrame.cmd("as", ["<address>", "siteSetLimit", 100]);
```

Errors: `size_limit must be a number`, and `Storage limit must be a whole number between 1 and <max> MB` for zero or a negative value. The wrapper also sends this command itself when the visitor accepts its "raise the limit" prompt.

### siteSetDownloadoptional

Allows or disallows on-demand fetching of the bound xite's optional files, the files a page asks for with [`fileNeed`](files.md#fileneed) or by opening them.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `value` | boolean | yes | `true` to allow on-demand fetching (position 0). A missing or non-boolean value counts as `false`. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("as", ["<address>", "siteSetDownloadoptional", [true]]);
```

Notes:

- Allowing on-demand fetching does not start a download of every optional file. That is [`siteSetAutodownloadoptional`](#sitesetautodownloadoptional).
- Turning it off also turns automatic download off and discards pending optional prompts for the xite.

### siteSetAutodownloadoptional

Turns automatic download of all the bound xite's optional files, including new ones, on or off.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `value` | boolean | yes | `true` to download every optional file (position 0). The legacy key `owned` is accepted too. A missing or non-boolean value counts as `false`. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("as", ["<address>", "siteSetAutodownloadoptional", [true]]);
```

Turning it on also allows on-demand fetching and starts a download pass. Turning it off stops the pass and clears its progress. Xites can ask for the same thing for their own optional files with [`optionalHelpAll`](files.md#optionalhelpall).

### siteSetAutodownloadBigfileLimit

Sets the largest big file, in megabytes, that automatic optional downloads fetch for the bound xite. Larger files are fetched only on demand.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number or string | yes | Whole megabytes (position 0, or the bare value). `0` means no limit. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("as", ["<address>", "siteSetAutodownloadBigfileLimit", { limit: 500 }]);
```

Errors: `Automatic file limit must be a whole number of MB`, or the same message with the allowed range for a negative value.

### siteDownloadOptionalPrevious

Starts one deliberate pass that downloads the xite's currently missing optional files. It grants no standing consent, so files published later are not fetched automatically. The sidebar's **Download previous files** button sends it.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite (position 0). Defaults to the bound xite. |

**Returns:** `{"status": "complete", "files": 0}` when nothing is missing, or `{"status": "started", "files": <count>}` when a pass started. The pass runs in the background and ends with a notification that says how many files arrived and how many failed.

```js
var pass = await epixFrame.cmd("siteDownloadOptionalPrevious", { address: "<address>" });
```

Errors: `Unknown xite: <address>`, `Resume this xite before downloading optional files`, `The network is not running; optional files cannot be downloaded` and `An optional download is already running for this xite`.

### optionalLimitStats

Returns the node-wide optional file storage usage.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters.

**Returns:** `{"limit": <string>, "used": <bytes>, "free": <bytes>}`. `limit` is the stored cap as text, for example `"10%"` or `"5"` (gigabytes). `used` is the total of optional bytes downloaded across every xite. `free` is the free disk space that a percentage cap is measured against.

```js
var stats = await epixFrame.cmd("optionalLimitStats", []);
console.log(stats.used + " bytes used, cap " + stats.limit);
```

### optionalLimitSet

Sets the node-wide cap on optional file storage. When downloaded optional files grow past it, the oldest unpinned ones are removed.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | string | yes | A percentage of free disk space such as `"10%"`, or a number of gigabytes such as `"5"` (position 0, or the bare string). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("optionalLimitSet", "10%");
```

The node stores the string without validating it and reads only its digits and decimal point, so `"500M"` would mean 500 GB. Convert other units yourself: the Dashboard turns `500M` into `"0.48828125"` before sending.

## Ownership and keys

A node that owns a xite shows the owner controls in the sidebar and can sign the xite. Signing needs the xite's private key. See [Owner keys](../build/publishing.md#owner-keys).

### siteSetOwned

Claims or relinquishes ownership of the bound xite. Ownership shows the owner sections of the sidebar and keeps local edits from being overwritten by downloads. It does not give the node the key.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `owned` | boolean | no | Position 0, or the bare value. Defaults to `true`. |

**Returns:** `"ok"`. `settings.own` in `siteInfo` reflects the change.

```js
await epixFrame.cmd("as", ["<address>", "siteSetOwned", [true]]);
```

### siteRecoverPrivatekey

Recovers the bound xite's private key from the node user's master seed, saves it and marks the xite owned. This works only for a xite created on this node identity, whose `content.json` records the `address_index` the key was derived from.

**Permission:** `ADMIN`

No parameters.

**Returns:** `"ok"`, or an error object: `{"error": "This xite already has a saved private key"}`, `{"error": "No address_index in content.json"}`, or `{"error": "Unable to deliver private key for this xite from current user's master_seed"}` when the derived key belongs to another address.

```js
var result = await epixFrame.cmd("as", ["<address>", "siteRecoverPrivatekey", []]);
```

### userSetSitePrivatekey

Saves a private key as the bound xite's signing key and marks the xite owned. An empty string forgets the saved key instead, without changing ownership.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `privatekey` | string | yes | The xite's private key, or `""` to forget the saved one. Position 0, or the bare string. Named form not accepted. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("as", ["<address>", "userSetSitePrivatekey", [key]]);
```

Notes:

- The key is checked before it is saved. Errors: `That is not a valid private key`, and `That private key belongs to <signer>, not to this xite (<address>)`.
- The key is stored in the node's private user data. Whoever can read it controls the xite.

### siteSignMessage

Signs an arbitrary message with the bound xite's own stored private key and returns only the signature. A xite owner uses it to answer an ownership challenge, such as a directory listing claim, without the key leaving the node.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `message` | string | yes | The text to sign (position 0, or the bare string). |

**Returns:** the signature as a base64 string. It verifies against the xite's address.

```sh
epix-server siteSignMessage <address> "I control this xite"
```

Errors: `siteSignMessage: message required`, and `No stored private key for this xite on this node`. With the node stopped, the command line action signs with the key stored in the data folder. When no key is available it asks for one on standard input, never as an argument.

## Databases

Both commands act on the xite's SQL database, which the node builds from its JSON files. See [Database](../build/database.md). Pages read it with [`dbQuery`](database.md#dbquery).

### dbRebuild

Forces a verified rebuild of a xite's database from its files. It walks and verifies the xite's content again instead of reusing a cached index, so it can bring back rows that an earlier rebuild withheld, for example while the chain was unreachable.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite (position 0). Defaults to the bound xite. |

**Returns:** `"ok"` when the new database is in place.

```js
await epixFrame.cmd("dbRebuild", { address: "<address>" });
```

Errors: `Unknown xite: <address>`, `Could not read database schema: ...`, `Invalid database schema: ...`, `Invalid database file path in schema`, `Database rebuild failed; check the node log for verification or storage errors`, and `Database rebuild produced no database; its schema or data could not be verified`.

`epix-server dbRebuild` is an offline action that fails while the node runs. To rebuild on a running node, use `epix-server siteCmd <address> dbRebuild`.

### dbReload

Reloads a xite's database schema. When the table layout (version, database file, tables and JSON table columns) is unchanged, the current rows are kept and only metadata such as feeds is replaced. When the layout changed, a new database is built first and replaces the old one only if the build succeeds.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite (position 0). Defaults to the bound xite. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("dbReload", { address: "<address>" });
```

Errors include `This xite has no verified database schema`, `Could not verify the database schema; the current database was kept`, `Could not build the changed database schema; the current database was kept`, and `The xite changed during schema reload. Try again.`. For a version 3 schema the merged database is refreshed as well.

## Permissions

How a page asks for a permission, and what each permission allows, is in [The wrapper sandbox](../build/sandbox.md#permissions).

### permissionAdd

Grants a permission to the bound xite. The wrapper sends it after the visitor clicked **Grant** in the prompt that [`wrapperPermissionAdd`](wrapper.md#wrapperpermissionadd) opened.

**Permission:** wrapper authority (or the admin socket). `ADMIN` is not enough. Refused on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `permission` | string | yes | One of `ADMIN`, `NOSANDBOX`, `CHANNELS`, `LOCAL_PROFILE`, `Merger:<type>` or `Channels:<app>`. Position 0, or the bare string. |

**Returns:** `"ok"`. The node pushes an updated `setSiteInfo`.

```sh
epix-server siteCmd <address> permissionAdd '"LOCAL_PROFILE"'
```

Notes:

- A page that sends `permissionAdd` does not reach the node: the wrapper routes it to the same prompt as `wrapperPermissionAdd`. A forwarded page id is refused with `permissionAdd requires the wrapper's permission prompt`.
- The suffix of `Merger:` and `Channels:` must start with a letter or digit, be at most 128 characters, and use only letters, digits, `_`, `.` and `-`. Anything else is refused with `Unknown or malformed permission: ...`.
- A `Merger:` grant rebuilds the merger databases before the answer, so the page can query merged data right away.
- `Cors:<address>` is not granted this way. It has its own command, [`corsPermission`](files.md#corspermission).

### permissionRemove

Revokes a permission from the bound xite.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `permission` | string | yes | The exact permission string, for example `Merger:EpixPost` (position 0, or the bare string). |

**Returns:** `"ok"`, also when the xite did not hold the permission. The node pushes an updated `setSiteInfo`.

```js
await epixFrame.cmd("as", ["<address>", "permissionRemove", ["Merger:EpixPost"]]);
```

Removing a `Merger:` permission empties and rebuilds the affected merger databases.

### permissionDetails

Returns the description of a permission that the wrapper shows in its grant prompt, as HTML.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `permission` | string | yes | The permission (position 0, or the bare string). |

**Returns:** an HTML string. `ADMIN` and `NOSANDBOX` carry a red warning to trust the developer. A `Channels:<app>` description names the app, HTML escaped. An unknown permission returns `""`.

```js
var html = await epixFrame.cmd("permissionDetails", "Merger:EpixPost");
// "Allow this xite to read and list other xites of a given type"
```

## Node configuration and plugins

These commands are what the Config and Plugins pages and the Dashboard's settings use. The settings themselves are described in [The Config page](../start/dashboard.md#the-config-page). The Config and Plugins pages, and the Backup & Restore wizard, are HTTP pages served by the node rather than commands, so they have no entries here.

### configList

Returns the editable node settings with their current and default values.

**Permission:** `ADMIN`. Declined while the UiConfig plugin is disabled.

No parameters.

**Returns:** an object keyed by setting name. Each value is `{"value": ..., "default": ..., "pending": <boolean>}`. `pending` is `true` for a setting that takes effect only after a restart and whose saved value differs from what this run started with. Buttons on the Config page (such as **Clear xID Cache**) are not listed.

```js
var config = await epixFrame.cmd("configList");
console.log(config.language.value, config.fileserver_port.default);
```

### configSet

Saves one node setting.

**Permission:** `ADMIN`. Declined while the UiConfig plugin is disabled.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | The setting name, as listed by `configList` (position 0). |
| `value` | any | no | The new value (position 1). `null` or a missing value removes the saved setting, so the default applies again. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("configSet", ["language", "en"]);
```

Notes:

- Settings that take effect only after a restart show `pending: true` in `configList` until the node restarts. Use [`serverShutdown`](#servershutdown) with `restart: true` to apply them.
- `ui_port` must be an integer from 1 to 65535: `ui_port must be an integer from 1 to 65535`.
- `data_dir` does not change the setting directly. It queues a move of the data folder for the next start, and the node shows a notification with the outcome. It fails on a node whose folder is fixed by `EPIX_DATA_DIR` or by the embedding app. See [Move the data directory](../start/dashboard.md#move-the-data-directory).
- Some settings apply at once, for example the chain endpoints and `tor_use_bridges`. Changing `language` shows a notification about the browser cache.

### pluginList

Lists the node's plugins and whether each is enabled.

**Permission:** `ADMIN`. Declined while the UiPluginManager plugin is disabled.

No parameters.

**Returns:** `{"plugins": [{"name": ..., "enabled": <boolean>, "default_enabled": <boolean>, "source": "builtin"}, ...]}`.

```js
var list = await epixFrame.cmd("pluginList");
var off = list.plugins.filter(function (p) { return !p.enabled; });
```

NoNewSites, UiPassword and Multiuser are disabled by default. The others are enabled by default.

### pluginConfigSet

Enables or disables a plugin. The change is saved and takes effect on the next command or page load, without a restart.

**Permission:** `ADMIN`. Declined while the UiPluginManager plugin is disabled.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `plugin` | string | yes | The plugin name, as `pluginList` reports it (position 0). `name` is accepted as the key too. |
| `enabled` | boolean | no | Position 1. Defaults to `true`. |

**Returns:** `"ok"`. The node pushes an updated `setServerInfo`.

```js
await epixFrame.cmd("pluginConfigSet", { plugin: "NoNewSites", enabled: true });
```

!!! warning
    Disabling UiConfig or UiPluginManager removes the matching page and declines its commands for every web caller, including this one. After that only the admin socket or the configuration file can turn it back on.

### userSetGlobalSettings

Saves the node user's interface settings, such as the theme, which every wrapper and the Dashboard read. The object is merged into the stored settings key by key. Pages read the settings with [`userGetGlobalSettings`](identity.md#usergetglobalsettings), which needs no permission.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `settings` | object | yes | The keys to store. Send it as `[settings]` or as the bare object. |

**Returns:** `"ok"`. The node pushes an updated `setServerInfo` so open wrappers apply the change.

```js
await epixFrame.cmd("userSetGlobalSettings", [{ theme: "dark" }]);
```

Errors: `User settings must be an object`, and `Could not save user settings: ...`.

## Server control

### serverShutdown

Stops the node, or restarts it. The node saves its peers and xite registry first and exits shortly after answering.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `restart` | boolean | no | `true` to start again after stopping (position 0). Defaults to `false`. |

**Returns:** `"ok"`, then the connection closes. The node shows a "Shutting down..." or "Restarting..." notification.

```js
await epixFrame.cmd("serverShutdown", { restart: true });
```

A restart needs a launcher that can start the node again: the desktop app, or a service manager for a supervised server. Without one, a restart request only stops the node.

### serverUpdate

Kept for compatibility. This node does not update itself in place.

**Permission:** `ADMIN`

No parameters.

**Returns:** always `{"error": "This node updates through its installer or package, not in place; install the new version and restart"}`, and the same text as an information notification.

```js
epixFrame.cmd("serverUpdate", {}, function (res) { console.log(res.error); });
```

Install updates as described in [Install EpixNet](../start/install.md).

### serverShowdirectory

Opens a folder in the operating system's file manager on the machine that runs the node: the data folder, or a xite's folder.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | no | `"backup"` (the default) opens the data folder. Any other value opens a xite's folder (position 0, or the bare string). The sidebar sends `"xite"`. |
| `address` | string | no | The xite whose folder to open (position 1). Defaults to the bound xite. |

**Returns:** `"ok"` when the file manager started.

```js
await epixFrame.cmd("serverShowdirectory", ["xite", "<address>"]);
```

Errors: `Directory does not exist: ...`, `Unknown xite: <address>`, `Could not launch the file manager: ...`. The node uses `open` on macOS, `explorer` on Windows and `xdg-open` elsewhere, so this only makes sense on a desktop.

### serverGetWrapperNonce

Issues a fresh single-use wrapper nonce. The wrapper needs one to reload the page's iframe, because a page request through the wrapper must carry a nonce the node issued.

**Permission:** `ADMIN`

No parameters.

**Returns:** `{"wrapper_nonce": "<random hex string>"}`. The nonce is consumed by the page request that uses it.

```js
var n = await epixFrame.cmd("serverGetWrapperNonce", []);
```

Pages do not need this command: [`wrapperReload`](wrapper.md#wrapperreload) reloads the page.

## Logs

The node keeps its most recent 300 log lines in memory for these commands. The full log is in `debug.log` in the data folder; see [Data directory layout](../internals/data-directory.md).

### serverErrors

Returns the recent error lines, which the Dashboard uses for its warning indicator.

**Permission:** `ADMIN`

No parameters.

**Returns:** an array of `[date_added, level, message]` rows, where `date_added` is Unix time in seconds and `level` is `ERROR` or `CRITICAL`.

```js
var errors = await epixFrame.cmd("serverErrors", {});
```

A connection that joined `serverChanged` also receives the updated list as a `setServerErrors` event whenever an error is logged. See [Events pushed to the page](xite.md#the-setservererrors-event).

### consoleLogRead

Returns the recent log lines as formatted text, for the sidebar console.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filter` | string | no | A level: `INFO`, `WARNING` or `ERROR` (position 0). `ERROR` includes `CRITICAL`. Empty or missing returns every level. |

**Returns:** `{"lines": [...], "pos_start": 0, "pos_end": <number>, "num_found": <count>}`. Each line has the form `[HH:MM:SS] LEVEL Node <message>`, with the time of day in UTC. `pos_start` and `pos_end` are display metadata kept for the console panel.

```sh
epix-server siteCmd <address> consoleLogRead '{"filter": "ERROR"}'
```

### consoleLogStream

Opens a live log stream. New lines arrive as `logLineAdd` events instead of being polled.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filter` | string | no | A level, as for [`consoleLogRead`](#consolelogread). |

**Returns:** `{"stream_id": <number>}`.

```js
var stream = await epixFrame.cmd("consoleLogStream", { filter: "" });
epixFrame.on("request", function (cmd, message) {
  if (cmd === "logLineAdd" && message.params.stream_id === stream.stream_id) {
    message.params.lines.forEach(appendLine);
  }
});
```

Notes:

- Each `logLineAdd` event carries `{"stream_id": <number>, "lines": ["<formatted line>"]}`.
- The events go to every open connection, not only to the one that opened the stream, so match them by `stream_id`.
- A stream stays open until it is removed. Close it with [`consoleLogStreamRemove`](#consolelogstreamremove) when your panel closes.

### consoleLogStreamRemove

Closes a live log stream.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `stream_id` | number | yes | The id from `consoleLogStream` (position 0). |

**Returns:** `"ok"`, also for an id that is not open.

```js
await epixFrame.cmd("consoleLogStreamRemove", { stream_id: stream.stream_id });
```

## Network and peers

How the node finds and reaches peers, and what Tor and I2P change, is in [Privacy and routing](../start/privacy.md). There are no separate Tor or I2P commands: their settings are changed with [`configSet`](#configset), and their state is part of `serverInfo`.

### serverPortcheck

Returns whether the node's file server port is reachable from outside, as last measured by the node's own port checker. It does not start a new check.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters.

**Returns:** `true` or `false`.

```js
var open = await epixFrame.cmd("serverPortcheck", []);
```

### announcerStats

Returns the announce status of every tracker the node uses, for the Dashboard's network health view.

**Permission:** `ADMIN`. Answered on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `planned` | boolean | no | `true` also lists trackers that are waiting for Tor or I2P, or were deferred this pass (position 0). Default `false`. |

**Returns:** an object keyed by tracker, such as `tcp://<ip>:<port>`, `onion://...`, `i2p://...`, or a BitTorrent tracker's announce URL. Each value has these fields:

| Field | Meaning |
| --- | --- |
| `status` | `announcing`, `announced`, `error`, and with `planned`, also `gated` (its overlay network is down) or `deferred`. |
| `num_request`, `num_success`, `num_added` | Requests sent, successful announces, and peers learned. |
| `num_error` | Consecutive failures. A success resets it. |
| `time_request`, `time_success`, `time_first_request` | Unix times in seconds. |
| `latency` | Seconds taken by the last successful announce. |
| `last_error`, `time_last_error` | The last failure and when it happened. |
| `deferred_reason` | Why a deferred tracker was skipped. |

```js
var trackers = await epixFrame.cmd("announcerStats", { planned: true });
var working = Object.keys(trackers).filter(function (k) {
  return trackers[k].status === "announced";
});
```

A non-privileged page gets announce status for its own xite with [`announcerInfo`](xite.md#announcerinfo).

### peerAdd

Adds a peer to a xite's known peers by hand. The node saves the peer list at once.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `peer` | string | no | An endpoint: `ip:port`, `<host>.onion:port`, `<b32>.i2p` with an optional port, or `rns:<32 hex digits>`. Object form only. When present, `ip` and `port` are ignored. |
| `ip` | string | no | An IP address (position 0). Required when `peer` is absent. |
| `port` | number or string | no | The port (position 1). Required with `ip`. |
| `site_address` | string | no | The xite (position 2). Defaults to the bound xite. |

**Returns:** `"updated"`.

```js
await epixFrame.cmd("peerAdd", { peer: "203.0.113.5:26552", site_address: "<address>" });
```

Errors: `Peer endpoint is not connectable`, `Unknown xite: <address>`, `This endpoint belongs to this node`, `port must be between 1 and 65535`. Adding a peer does not enable an interface or change routing: a `.onion` peer still needs Tor.

### networkRetry

Retries work that is waiting on the network now, instead of waiting for its backoff timer. With an address it wakes that xite's waiting download. Without one it tells the whole node that the network is back: trackers, xite updates, unfinished downloads and the xID light client all retry.

**Permission:** none for the bound xite's own address. `ADMIN` for another xite's address. Wrapper authority or `ADMIN` for the global form, which is refused on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite whose download to retry. Object form only: any other form is treated as the global retry. |

**Returns:** `"ok"`.

```js
// A page retrying its own download from a "try again" button:
var info = await epixFrame.cmd("siteInfo");
await epixFrame.cmd("networkRetry", { address: info.address });
```

Errors: `Forbidden` for another xite without `ADMIN`, `address must be a string`, `Xite is not registered`, `Xite download is paused`, and `Global network retry requires wrapper or ADMIN authority`. A xite that is already complete, or that this node owns, answers `"ok"` without doing anything.

## Statistics and the sidebar

The Dashboard's Stats page and world map, and the xite sidebar's panel and globe, read these commands. See [Stats](../start/dashboard.md#stats) and [The xite sidebar](../start/dashboard.md#the-xite-sidebar).

### chartDbQuery

Runs a read-only query against the node's network statistics database.

**Permission:** `ADMIN`. Answered on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | yes | A SQL statement that starts with `SELECT` (position 0, or the bare string). |
| `params` | object | no | Values bound by name (position 1). A list value expands `IN :key` into a list of placeholders. |

**Returns:** an array of row objects, or `{"error": "..."}`. A query that does not start with `SELECT` answers `{"error": "Only SELECT query supported"}`.

```js
var types = await epixFrame.cmd("chartDbQuery", "SELECT * FROM type");
var ids = types.filter(function (t) { return t.name === "peer"; }).map(function (t) { return t.type_id; });
var rows = await epixFrame.cmd("chartDbQuery", [
  "SELECT date_added, value FROM data WHERE type_id IN :type_ids AND site_id IS NULL ORDER BY date_added",
  { type_ids: ids }
]);
```

The database has three tables:

| Table | Columns |
| --- | --- |
| `type` | `type_id`, `name`: the metric names, such as `peer`, `peer_onion`, `connection`, `connection_onion`, `connection_in`, `connection_ping_avg`, `connection_ping_min`, `size`, `size_optional`, `optional_used`, `optional_limit`, `content`, `file_bytes_recv`, `file_bytes_sent`, `request_num_sent`, `request_num_recv`, and per xite `site_size`, `site_size_optional`, `site_optional_downloaded`, `site_peer`, `site_bytes_recv`, `site_bytes_sent`. |
| `site` | `site_id`, `address`. |
| `data` | `data_id`, `type_id`, `site_id` (`NULL` for node-wide values), `value`, `date_added` (Unix seconds). |

Transfer counters such as `file_bytes_recv` are stored as the change since the previous sample. The node keeps per-xite data for about one month and node-wide data for about six months.

### chartGetPeerLocations

Returns estimated locations of every peer with a public IP address that the node knows, across all xites, for the Dashboard's world map.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters.

**Returns:** an array of `{"lat", "lon", "city", "country", "ping"}` objects, where `ping` is the best round trip in milliseconds or `null`. The array is empty when the node has no location database loaded.

```js
var dots = await epixFrame.cmd("chartGetPeerLocations", []);
```

Locations come from a database bundled with the node and are computed locally. Tor, I2P and mesh peers have no location.

### sidebarGetHtmlTag

Returns the rendered HTML of the sidebar panel for the bound xite: peers, transfer totals, files and sizes, storage limit, identity and the owner controls. The wrapper's sidebar inserts it. This command belongs to the Sidebar plugin.

**Permission:** `ADMIN`. Answered on public gateways. Answers `null` while the Sidebar plugin is disabled.

No parameters.

**Returns:** an HTML string.

```js
var html = await epixFrame.cmd("sidebarGetHtmlTag", {});
```

The markup is internal to the sidebar and may change between releases. Build your own views on `siteInfo` and the other commands instead of parsing it.

### sidebarGetPeers

Returns the bound xite's peer locations for the sidebar globe. This command belongs to the Sidebar plugin.

**Permission:** `ADMIN`. Answered on public gateways. Answers `null` while the Sidebar plugin is disabled.

No parameters.

**Returns:** a flat array of numbers, `[lat, lon, height, lat, lon, height, ...]`, the format the globe library expects. A xite without located peers gets an empty array.

```js
var globe = await epixFrame.cmd("sidebarGetPeers", []);
```

## Feeds and notifications across xites

These commands read and manage what every xite on the node contributes to the Dashboard's feed and notification bell. The commands a xite uses for its own feeds and notifications (`feedFollow`, `notificationSubscribe`, `notificationDismissSelf` and others) need no permission and are in [Merger, feed and search commands](merger.md). How feeds are declared is explained in [Feeds, notifications and search](../build/feeds-search.md).

### channelJoinAllsite

Like [`channelJoin`](xite.md#channeljoin), but the connection receives the events of the joined channels for every xite on the node, not only for the bound xite. The Dashboard uses it so its xite list stays current.

**Permission:** `ADMIN`. Answered on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `channels` | array of strings | no | The channels to join, for example `["siteChanged"]`. |
| `channel` | string | no | A single channel. |

A bare string or array is accepted in place of the object.

**Returns:** `"ok"`.

```js
await epixFrame.cmd("channelJoinAllsite", { channel: "siteChanged" });
```

The scope lasts for the life of the connection. A xite that holds `ADMIN` gets the all-xite scope from a plain `channelJoin` as well, so its subscription survives the wrapper's automatic rejoin after a reconnect.

### feedQuery

Runs the feed queries of every xite the user follows and returns the rows merged, newest first, together with rows from local sources that never leave the node (such as decrypted mail).

**Permission:** `ADMIN`. Answered on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | no | Rows per feed query (position 0). Default `10`. It is not a cap on the merged result. |
| `day_limit` | number or null | no | Only rows from the last this many days (position 1). Default `3`. An explicit `null` (or `0`) turns the day filter off. |

**Returns:** `{"rows": [...], "num": <row count>, "sites": <number of followed xites>}`. Each row has the columns of its feed query (see [The shape of a feed row](../build/feeds-search.md#the-shape-of-a-feed-row)) plus `site` (the xite's address) and `feed_name`. `date_added` is in seconds: values in milliseconds are converted, and rows dated more than two minutes in the future are dropped.

```js
var feed = await epixFrame.feedQuery({ limit: 20, day_limit: 7 });
feed.rows.forEach(function (row) { render(row.site, row.title, row.body, row.date_added); });
```

Notes:

- Follows are recorded with [`feedFollow`](merger.md#feedfollow).
- Each feed query runs with a 10 second timeout, so one slow xite does not hold up the rest. A query containing `;`, a comment, or a statement keyword such as `INSERT`, `DROP` or `PRAGMA` is skipped.
- Right after the node starts, the answer waits (up to 45 seconds) until the xite databases are rebuilt, so the first feed is not empty.

### feedSearch

Searches the feeds that every served xite declares in its `dbschema.json`.

**Permission:** `ADMIN`. Answered on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `search` | string | no | The search text (position 0, or the bare string). It may end with filters: `site:<address or title>` limits the search to one xite, and `type:<text>` keeps only feeds whose query text contains that text. Spaces in the search text match any characters. |
| `limit` | number | no | Rows per feed (position 1). Default `30`. |
| `day_limit` | number or null | no | Only rows from the last this many days (position 2). Default `30`. `null` turns the filter off. |

**Returns:** `{"rows": [...], "num": <row count>, "sites": <number of xites searched>}`, with the same row shape as [`feedQuery`](#feedquery). The text is matched against each row's `title` and `body`.

```js
var hits = await epixFrame.feedSearch("rust release site:<address>");
```

### notificationQuery

Runs the notification queries that xites registered with [`notificationSubscribe`](merger.md#notificationsubscribe) and returns the counts, for the Dashboard's bell.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters.

**Returns:** `{"results": [...], "num": <entries>, "sites": <xites>, "muted": <boolean>}`. When notifications are muted globally, `results` is empty and `muted` is `true`. Each entry has:

| Field | Meaning |
| --- | --- |
| `site`, `title` | The xite's address and title. |
| `name` | The subscription name. |
| `count` | Unread items, after subtracting the `notification_seen` baseline the xite stored with `userSetSettings`. |
| `last_seen` | When the user last dismissed this notification, in milliseconds, or `0`. |
| `icon` | The icon the xite declares for this name in `notification_icons` in `content.json`, when present. |
| `error` | The query error, when the query failed. |

```js
var n = await epixFrame.cmd("notificationQuery", {});
n.results.filter(function (e) { return e.count > 0; }).forEach(showBadge);
```

Muted xites are skipped, and so are xites without a database. Local, never-shared sources such as decrypted mail add their own entries.

### notificationCount

Returns the total of unread notifications, honoring mutes, dismissals and seen baselines. The wrapper polls it for the badge on its navigation icon and the tab title.

**Permission:** `ADMIN`. Answered on public gateways.

No parameters.

**Returns:** `{"count": <number>}`.

```js
var total = (await epixFrame.cmd("notificationCount", [])).count;
```

### notificationMute

Mutes or unmutes notifications for every xite or for one xite.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `muted` | boolean | no | Position 0. Defaults to `true`. |
| `site_address` | string | no | The xite to mute (position 1). Without it the global mute changes. |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("notificationMute", { muted: true, site_address: "<address>" });
```

### notificationMuteStatus

Returns the current mute settings.

**Permission:** `ADMIN`

No parameters.

**Returns:** `{"global_muted": <boolean>, "site_mutes": {"<address>": <boolean>, ...}}`.

```js
var mutes = await epixFrame.cmd("notificationMuteStatus", {});
```

### notificationDismiss

Marks one notification of any xite as seen, by recording the current time. Queries that use the `{last_seen}` placeholder then count only newer items.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `site_address` | string | yes | The xite (position 0). |
| `name` | string | yes | The subscription name (position 1). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("notificationDismiss", ["<address>", "replies"]);
```

Errors: `notificationDismiss: site_address required`, `notificationDismiss: name required`. A xite clears its own notifications without `ADMIN` using [`notificationDismissSelf`](merger.md#notificationdismissself).

## Content filters

The node keeps two lists that apply to every xite: muted authors, whose content is left out of every xite database, and blocked xites, which the node refuses to show. Both apply only while the ContentFilter plugin is enabled, and both stay stored when it is disabled. Authors are muted and unmuted with [`muteAdd`](identity.md#muteadd) and [`muteRemove`](identity.md#muteremove), which are documented with the identity commands.

### muteList

Returns the node-wide list of muted authors.

**Permission:** `ADMIN`

No parameters.

**Returns:** an object keyed by auth address: `{"<auth_address>": {"cert_user_id": ..., "reason": ..., "date_added": <Unix seconds>}, ...}`.

```js
var muted = await epixFrame.muteList();
```

### siteblockAdd

Adds a xite address to the node's blocklist. Opening a blocked xite shows a block page with the reason instead of the xite.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `site_address` | string | yes | The xite's address (position 0). A `.epix` name is refused. |
| `reason` | string | no | Shown on the block page (position 1). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("siteblockAdd", ["<address>", "Spam"]);
```

The blocklist can also hold the SHA-256 hash (hex) of an address, which blocks that address without naming it. Errors: `siteblockAdd: site_address required`, `Could not save blocked xites: ...`.

### siteblockRemove

Removes a xite address from the blocklist.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `site_address` | string | yes | The address (position 0). A `.epix` name is refused. |

**Returns:** `"ok"`, also when the address was not blocked.

```js
await epixFrame.cmd("siteblockRemove", { site_address: "<address>" });
```

### siteblockList

Returns the blocklist.

**Permission:** `ADMIN`

No parameters.

**Returns:** an object keyed by address (or address hash): `{"<address>": {"reason": ..., "date_added": <Unix seconds>}, ...}`.

```js
var blocked = await epixFrame.cmd("siteblockList", {});
```

### siteblockGet

Returns the blocklist entry stored under one key.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `site_address` | string | yes | The address (position 0). |

**Returns:** `{"reason": ..., "date_added": ...}`, or `false` when there is no entry under that exact key. A block stored as a hash is not found by the plain address.

```js
var entry = await epixFrame.cmd("siteblockGet", { site_address: "<address>" });
if (entry) console.log("Blocked: " + entry.reason);
```

### siteblockIgnoreAddSite

Removes a xite from the blocklist so that it can be opened and added after all. It has the same effect as [`siteblockRemove`](#siteblockremove), except that it does not check for a `.epix` name.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `site_address` | string | yes | The address (position 0). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("siteblockIgnoreAddSite", { site_address: "<address>" });
```

## Identities

These commands manage the xID identities the node user has linked, node-wide. The concepts are in [xID](../start/xid.md). Selecting an identity for one xite and linking a new one are commands a page can use without `ADMIN`; they are documented with the identity commands.

### identitySetDefault

Sets the node-wide default identity, which every xite without its own choice acts as.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | no | A linked identity's auth address (position 0, or the bare string). `""` or a missing value clears the default. |

**Returns:** `"ok"`, or `"Not changed"` when it already was the default.

```js
await epixFrame.cmd("identitySetDefault", { auth_address: "<auth address>" });
```

Errors: `unknown identity <auth_address>` for an address that is not linked, `Could not save user settings: ...`.

### identityRemove

Forgets a linked identity. Its key stays stored on the node and content it already published stays valid. Xites that used it fall back to the default identity, and if it was the default, the default is cleared.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | yes | The identity's auth address (position 0, or the bare string). |

**Returns:** `"ok"`, or `"Not changed"` when no such identity was linked.

```js
await epixFrame.cmd("identityRemove", { auth_address: "<auth address>" });
```

Removing an identity from the node does not change the name records on Epix Chain. See [Revoke an identity](../start/xid.md#revoke-an-identity).

### certSet

Legacy command, kept for older xites and the sidebar's disconnect button. It changes which identity the bound xite acts as.

**Permission:** `ADMIN`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `domain` | string | no | `""` (or missing) makes the bound xite browse without an identity. Any other value makes it use the default identity again (position 0). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("as", ["<address>", "certSet", [""]]);
```

### certList

Legacy command that returns the linked identities in the old certificate row shape, with the one the bound xite acts as marked.

**Permission:** `ADMIN`

No parameters.

**Returns:** an array of `{"auth_address", "auth_type": "xid", "auth_user_name", "domain": "xid.epix", "selected"}` objects. `auth_user_name` is the xID name.

```js
var rows = await epixFrame.cmd("certList", {});
```

New code should use [`identityList`](identity.md#identitylist), which needs no permission.

### xidClearCache

Clears every xID resolution cache: the saved name-to-address cache, the display names of served xites, and the chain layer's in-memory caches. The next visit to any `.epix` name resolves it on the chain again. The xite databases are rebuilt afterwards. This is the **Clear xID Cache** button on the Config page.

**Permission:** `ADMIN`

No parameters.

**Returns:** `"ok"`.

```js
await epixFrame.cmd("xidClearCache", {});
```

Served xites stay registered under their addresses. Expect a burst of chain lookups and database rebuilds afterwards.

## Users (Multiuser plugin)

With the Multiuser plugin, one node can hold several master seeds, each a separate user with its own keys, identities and settings. The plugin is disabled by default. Its commands exist in the desktop and server builds of `epix-server`, not in the mobile builds, and answer `null` while the plugin is disabled.

### userShowMasterSeed

Reveals the active user's master seed.

**Permission:** `ADMIN`. Multiuser plugin.

No parameters.

**Returns:** `{"master_seed": "<seed>"}`.

```js
var secret = await epixFrame.cmd("userShowMasterSeed", {});
```

!!! danger
    The master seed derives every key of that user, including keys of xites created on the node. Anyone who sees it controls them. Show it only on the user's explicit request and never send it anywhere.

### userList

Returns the master addresses of every user the node knows.

**Permission:** `ADMIN`. Multiuser plugin.

No parameters.

**Returns:** an array of master addresses, with the active user first.

```js
var users = await epixFrame.cmd("userList", {});
```

### userLogin

Adds a user from a master seed, or selects it if the node already knows it, and makes it the active user.

**Permission:** `ADMIN`. Multiuser plugin.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `master_seed` | string | yes | The master seed (position 0, or the bare string). |

**Returns:** `{"master_address": "<address>"}`.

```js
var user = await epixFrame.cmd("userLogin", { master_seed: seed });
```

An invalid seed is refused with an error.

### userSet

Switches the active user to a user the node already knows.

**Permission:** `ADMIN`. Multiuser plugin.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `master_address` | string | yes | One of the addresses from `userList` (position 0, or the bare string). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("userSet", { master_address: users[1] });
```

Error: `unknown user: <master_address>`.

### userLogout

Switches away from the active user to another user the node knows. When the node knows no other user, nothing changes.

**Permission:** `ADMIN`. Multiuser plugin.

No parameters.

**Returns:** `"ok"`.

```js
await epixFrame.cmd("userLogout", {});
```

## Acting for another xite

### as

Runs another command as if the connection were bound to a different xite. Commands that act on the bound xite, such as `siteSetLimit` or `siteSetOwned`, reach other xites this way. The Dashboard uses it to raise a row's storage limit.

**Permission:** none for the bound xite itself. `ADMIN` or wrapper authority to target another xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | The target xite (position 0). |
| `cmd` | string | yes | The command to run (position 1). |
| `params` | any | no | Its parameters (position 2). Default `[]`. |

**Returns:** whatever the inner command returns.

```js
await epixFrame.cmd("as", ["<address>", "siteSetLimit", 100]);
await epixFrame.cmd("as", { address: "<address>", cmd: "siteInfo", params: {} });
```

Notes:

- The inner command passes through every check again on the rebound session, so it still needs its own permission, and gateway and plugin rules still apply.
- An `ADMIN` caller gets an ordinary page-level session that remembers only the `ADMIN`. It never gains wrapper authority, so `permissionAdd`, the avatar cache commands and the EVX management commands stay out of reach.
- The local profile commands and the avatar cache commands are refused through `as`: `Local profiles cannot be accessed through as`, `Avatar cache cannot be accessed through as`.
- Other errors: `Missing address`, `Missing cmd`, and `No permission to run commands as <address>`.

## Avatar cache (wrapper only)

The wrapper keeps a small cache of avatar thumbnails on the node, filled by its own sandboxed image processor. These two commands are its storage. Pages use [`wrapperGetAvatarThumbnail`](wrapper.md#wrappergetavatarthumbnail) instead, and the wrapper answers a page's `avatarCacheGet` or `avatarCachePut` with `null` without forwarding it.

Both commands need the wrapper's own command on a wrapper socket bound to a xite. Every other caller, including the admin socket, an `ADMIN` xite and a public gateway visitor, gets `Avatar cache requires local wrapper authority`. Cache keys are hashed from the user, the image URL and the size, so the cache stores no readable URL history. Entries expire after 24 hours and the cache holds at most 128 of them.

### avatarCacheGet

Looks up a cached thumbnail.

**Permission:** wrapper authority only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | The avatar's public `http` or `https` URL, at most 2048 characters, without credentials. Hosts under `localhost`, `.local`, `.epix`, `.internal`, `.lan`, `.home`, `.arpa`, `.onion` and `.i2p` are refused. |
| `size` | number | yes | The thumbnail side in pixels, 1 to 128. |

**Returns:** `{"thumbnail": "data:image/png;base64,..."}`, or `{"thumbnail": null}` on a miss.

```js
// Inside the wrapper chrome, not a xite page:
wrapper.ws.cmd("avatarCacheGet", { url: source, size: 80 }, onResult);
```

Errors: `Missing avatar URL`, `Expected a public HTTP(S) avatar URL`, `Invalid avatar size`, `Avatar thumbnail cache unavailable`, and `Avatar cache profile changed; reopen this xite` when the node user changed since the connection first used the cache.

### avatarCachePut

Stores raw pixels produced by the wrapper's image processor as a PNG thumbnail and returns it.

**Permission:** wrapper authority only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | As for `avatarCacheGet`. |
| `size` | number | yes | As for `avatarCacheGet`. |
| `width` | number | yes | The square image's side in pixels, 1 to `size`. |
| `rgba` | string | yes | Base64 of exactly `width * width * 4` bytes of RGBA pixels. |

**Returns:** `{"thumbnail": "data:image/png;base64,..."}`.

```js
// Inside the wrapper chrome, not a xite page:
wrapper.ws.cmd("avatarCachePut", { url: source, size: 80, width: 80, rgba: pixelsBase64 }, onResult);
```

Errors: `Missing avatar pixels`, `Invalid avatar pixel count`, `Invalid avatar pixels`, `Invalid avatar width`, plus those of `avatarCacheGet`.

## EVX management (wrapper only)

EVX runs sandboxed WebAssembly programs that a xite declares; see [EVX programs](../build/evx.md). A page can ask for consent with [`evxRequest`](wrapper.md#evxrequest) and read state with [`evxInspect`](xite.md#evxinspect) and [`evxStatus`](xite.md#evxstatus). Everything that grants, narrows, ends or runs is reserved for the wrapper's consent dialog and the operator:

- **Only wrapper authority or the admin socket.** Any other caller gets `<command> requires the wrapper's EVX consent prompt`. Holding `ADMIN` does not help, and `as` does not either.
- **Never on a public gateway**, except from the admin socket: `<command> is disabled on this gateway`.
- **What the wrapper does with a page's attempt.** A page's `evxGrant` or `evxRunOnce` opens the same consent dialog as `evxRequest`. A page's `evxRecoverWorkspace` opens a fixed **Recover workspace** confirmation for its own xite. A page's `evxRevoke` or `evxSetLimits` is dropped with `{"error": "<command> is not available to a page"}`. The job commands (`evxJobPause`, `evxJobResume`, `evxRunJob`) are never sent by the wrapper, so in practice they are operator commands.
- **Parameters are a JSON object**, decoded strictly. `null` counts as `{}`. An array, a bare string or an unknown key is refused (`params must be a JSON object`, `invalid params: ...`).
- **Target xite.** `xite` defaults to the bound xite. A wrapper session may name only its bound xite (`this connection is bound to another xite`). The admin socket may name any xite and must name one when it is not bound.
- **Plugin.** All of them belong to the `Evx` plugin and answer `null` while it is disabled. On a node built without EVX, such as the mobile builds, they are absent. Errors from the service start with `EVX state:`, and a node whose EVX state could not be opened answers `EVX service unavailable on this node`.

From a server, run them through the admin socket:

```sh
epix-server siteCmd <address> evxStatus
epix-server siteCmd <address> evxJobPause '{"job": "<job id>"}'
```

### evxGrant

Records EVX consent for a xite (`mode: "enable"`), or mints a one-time token for running one program once (`mode: "once"`). The wrapper sends it after the visitor answered the consent dialog.

**Permission:** wrapper authority or the admin socket. Refused on public gateways.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | yes | The xite being granted. |
| `declaration_digest` | string | yes | The `declaration_digest` the dialog showed, from `evxInspect`. It must still be current. |
| `mode` | string | yes | `"enable"` for a persistent grant, `"once"` for one run. |
| `program` | string | no | The program a `once` token covers. Required for `once`, refused for `enable`. |
| `limits` | object | no | `enable` only. Proposed limits, clamped to the node's ceiling. Defaults to what the declaration requests. |
| `label` | string | no | `enable` only. A label stored with the grant. |
| `shown` | object | no | Required for `enable`, refused for `once`. What the dialog showed: `{"programs": [...], "jobs": [...], "allow_run_once": <boolean>, "allow_background": <boolean>}`, taken from `requested.programs`, `requested.jobs` and the two `effective` flags of `evxInspect`. |

**Returns:** for `enable`, `{"granted": true, "mode": "enable", "xite", "declaration_digest", "grant": {...}, "jobs": [<usable job ids>]}`. For `once`, `{"granted": true, "mode": "once", "xite", "program", "declaration_digest", "token", "expires_in"}`, where `token` is spent by [`evxRunOnce`](#evxrunonce).

```sh
epix-server siteCmd <address> evxGrant '{"xite": "<address>", "declaration_digest": "<digest>", "mode": "once", "program": "tally"}'
```

Errors include `declaration is <state>; only a verified, complete xite can be granted`, `declaration_digest does not match the current declaration; inspect again`, `shown is required for mode enable: what the consent dialog showed`, a refusal when `shown` differs from what the node would record, `no usable program to grant`, `program applies to mode once only`, `program required for mode once`, `program <id> does not allow run-once`, and `limits, label and shown apply to mode enable only`.

### evxRevoke

Disables a xite's EVX grant. Outstanding one-time tokens are discarded and a run in progress is told to stop. Nothing already written is undone, the run history is kept, and registered jobs stay registered but stop being due.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. The wrapper drops a page's attempt.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |

**Returns:** `{"revoked": true, "xite", "had_grant": <boolean>, "stopped_run": <boolean>}`.

```sh
epix-server siteCmd <address> evxRevoke
```

### evxSetLimits

Replaces the limits of a xite's existing grant, clamped to the node's ceiling. Usage is not reset, and a run in progress gets the new values at its next check. A revoked grant is not restored.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. The wrapper drops a page's attempt.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |
| `limits` | object | yes | Every field is required: `memory_bytes`, `fuel`, `host_calls`, `storage_bytes`, `wall_seconds`, `host_call_seconds`, `process_cpu_seconds`, `process_rss_bytes`. See [Limits](../build/evx.md#limits). |

**Returns:** `{"xite", "limits": {...}, "generations": {...}}`, with the limits as stored after clamping.

```sh
epix-server siteCmd <address> evxSetLimits '{"limits": {"memory_bytes": 1048576, "fuel": 100000, "host_calls": 16, "storage_bytes": 4096, "wall_seconds": 2.0, "host_call_seconds": 0.8, "process_cpu_seconds": 2.0, "process_rss_bytes": 134217728}}'
```

The values in the example are the node's built-in defaults. A value outside the supported range is refused with `requested limits refused: invalid limit: <name>`.

### evxRunOnce

Runs one program of a xite now, under its enabled grant or by spending a one-time token from `evxGrant`. A run-once touches no scheduled job.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. A page's attempt opens the consent dialog instead.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |
| `program` | string | yes | The program id. |
| `token` | string | no | A one-time token from `evxGrant` with `mode: "once"`. |

**Returns:** the run result. Its `status` is one of `ok`, `error`, `denied`, `timeout`, `resource_limit`, `effect_unknown` or `quarantined`, with the `value` the program returned and usage figures. See [Read status](../build/evx.md#read-status).

```sh
epix-server siteCmd <address> evxRunOnce '{"program": "tally"}'
```

### evxJobPause

Pauses one of a xite's registered scheduled jobs. It stops being due at once; an occurrence already reserved finishes. Only [`evxJobResume`](#evxjobresume) lifts the pause.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. Not sent by the wrapper.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |
| `job` | string | yes | The job id. |

**Returns:** the job's entry from `evxStatus`, now with its pause reason.

```sh
epix-server siteCmd <address> evxJobPause '{"job": "<job id>"}'
```

Error: `job <id> is not registered for <xite>`.

### evxJobResume

Lifts a job's pause, whoever set it, including the `reconcile_required` pause after a run whose effect is unknown. Before resuming, the node reconciles interrupted workspace writes for that job. If reconciliation fails, the job stays paused. The job resumes on the slot that is due now and never runs a slot it missed.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. Not sent by the wrapper.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |
| `job` | string | yes | The job id. |

**Returns:** the job's entry from `evxStatus`.

```sh
epix-server siteCmd <address> evxJobResume '{"job": "<job id>"}'
```

Check the workspace before resuming a job paused with `reconcile_required`. See [Scheduled jobs](../build/evx.md#scheduled-jobs).

### evxRunJob

Runs a job's current occurrence now. The manual run and the scheduled run of the same slot share one identity, so the slot never runs twice: if this occurrence already ran, the stored result comes back instead. The daily background budget is not spent.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. Not sent by the wrapper.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |
| `job` | string | yes | The job id. |

**Returns:** the run result with `"stored": false` and `job` added, or `{"stored": true, "occurrence", "job", "result"}` when the occurrence had already completed.

```sh
epix-server siteCmd <address> evxRunJob '{"job": "<job id>"}'
```

Errors: `occurrence <id> is already running`, `job <id> is not registered for <xite>; it needs an enabled grant that allows background runs`, and `declaration is <state>; only a verified, complete xite can run`. A paused or disabled job is refused rather than run.

### evxRecoverWorkspace

Reconciles interrupted manual workspace writes for a xite: pending files are checked against their previously authorized contents. It runs no program, changes no grant and resumes no job, and unknown contents stay blocked.

**Permission:** wrapper authority or the admin socket. Refused on public gateways. A page's attempt opens the wrapper's fixed **Recover workspace** confirmation for its own xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xite` | string | no | The xite. Defaults to the bound xite. |

**Returns:** `{"xite", "reconciled_paths": <count>}`. A page whose visitor chose **Cancel** in the confirmation gets `{"recovered": false}` from the wrapper.

```js
// From a page: asks the wrapper to show its confirmation.
epixFrame.cmd("evxRecoverWorkspace", {}, function (result) {
  if (result && result.reconciled_paths !== undefined) showStatus("Workspace checked");
});
```

Errors: `EVX plugin is disabled`, `workspace recovery task failed: ...`. On a public gateway the wrapper answers `{"error": "Workspace recovery is unavailable on a public gateway"}`.

## Related

- [API overview](index.md): how commands travel, permissions in brief, and the full command index.
- [The wrapper sandbox](../build/sandbox.md): origins, permissions, and who can run which command.
- [Dashboard, sidebar, and node settings](../start/dashboard.md): the screens these commands drive.
- [Run a node](../start/running.md): command line actions, `siteCmd` and the data folder.
- [Xite and server commands](xite.md): `siteInfo`, `serverInfo`, `channelJoin`, and the EVX status commands.
- [Merger, feed and search commands](merger.md): per-xite feeds and notifications.
- [Files and media](../build/files.md): optional files, big files and the storage cap.
- [EVX programs](../build/evx.md): declarations, consent, limits and scheduled jobs.
- [Wrapper commands](wrapper.md): `wrapperPermissionAdd`, `evxRequest` and the avatar thumbnail service.
