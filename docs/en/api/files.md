---
description: Reference for the EpixFrame file commands. Read, write, sign, delete and list files in a xite, download optional files on demand, upload big files, read other xites with a Cors grant, and manage optional file storage.
---

# File commands

File commands read and change the files of a xite (a site published on EpixNet) from its own page: fetch a file's contents, write a draft, replace a file and sign it in one step, list directories, download optional files on demand, and manage which optional files the node keeps. This page documents every file command for xite developers. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first. For the concepts behind optional files, big files and signed writes, see [Files and media](../build/files.md).

## How file commands behave

- **Paths are inner paths.** An inner path is relative to the xite's root folder, uses forward slashes and has no leading slash, for example `data/users/alice.epix/data.json`. A path with a `..` segment, or an absolute path, is refused.
- **Commands act on the page's own xite.** The exceptions are the two path prefixes described under [Paths into other xites](#paths-into-other-xites) and the optional `address` parameter of some optional file commands.
- **Content travels as base64.** `fileWrite` and `fileWriteSign` take the new file content base64 encoded. `fileGet` returns text by default and base64 on request.
- **A write is a local draft.** `fileWrite` and `fileDelete` change the files on this node only. Other nodes see the change after the `content.json` that covers the file is signed and published with [`siteSign`](xite.md#sitesign) or [`sitePublish`](xite.md#sitepublish).
- **User content needs an identity.** Writing or deleting under `data/users/` fails with `xID required: select or link an identity for this xite` until the visitor has an xID identity selected for the xite. See [Identity commands](identity.md#certxid) and [User-generated content](../build/user-content.md).
- **Gateways are read-only.** On a public gateway (a node in restricted mode), `fileWrite`, `fileWriteSign` and `fileDelete` answer `This node is a read-only gateway; changes are disabled here` unless the gateway itself owns the xite, and `corsPermission` is disabled.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance, and this helper for encoding text as base64:

```js
// UTF-8 text to base64, safe for non-ASCII characters
function toBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}
```

### Paths into other xites

Two prefixes make an inner path point into a different xite. The node checks the permission every time.

| Prefix | Points to | Requires |
| --- | --- | --- |
| `cors-<address>/<path>` | `<path>` in the xite `<address>` | The `Cors:<address>` permission, requested with [`corsPermission`](#corspermission). Without it: `This xite has no permission to access xite <address>`. |
| `merged-<type>/<address>/<path>` | `<path>` in a hub of a merger xite | The `Merger:<type>` permission, and a hub that the node serves and that declares that `merged_type`. See [Merger xites and hubs](../build/merger-hubs.md). |

These commands accept both prefixes: `fileGet`, `fileNeed`, `fileRules`, `fileWrite`, `fileWriteSign`, `fileDelete`, `dirList`, `fileList`, `optionalFileInfo`, `optionalFileDelete` (when called without `address`) and `fileTransferStats`. `fileQuery`, `bigfileUploadInit` and the pin commands do not.

## Reading files

### fileGet

Returns the contents of a file as text or as base64. It reads what is on disk: it does not start a download. Use [`fileNeed`](#fileneed) to fetch a missing optional file.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file to read (position 0). A bare string is also accepted as the whole parameter. |
| `required` | boolean | no | Whether to wait for a file that has not arrived yet (position 1). Defaults to `true` when the parameter is absent. An explicit `null` counts as `false`. |
| `format` | string | no | `"text"` (default) or `"base64"` (position 2). Use `"base64"` for binary files. Text is decoded as UTF-8 with invalid bytes replaced, which corrupts binary data. |
| `timeout` | number | no | Accepted for compatibility (position 3) and ignored. The wait is fixed, see below. |

**Returns:** the file contents as a string, or `null` when the file is not there.

```js
// Read a JSON file that may not exist yet.
var raw = await epixFrame.fileGet("data/users/alice.epix/data.json", { required: false });
var data = raw ? JSON.parse(raw) : { topics: [] };

// Read a binary file.
var logoBase64 = await epixFrame.fileGet("img/logo.png", { format: "base64" });
```

Notes:

- With `required` true and the file missing, the node waits up to 10 seconds for it to arrive (this covers a xite that is still downloading), then answers `null`. If the root `content.json` is on disk and does not list the file, the answer is `null` immediately.
- Pass `required: false` whenever a missing file is a normal case, such as a visitor who has not posted yet. This is what the official xites do.
- A path of the form `<archive>.zip/<file>` or `<archive>.tar.gz/<file>` reads a file from inside an archive stored in the xite, while the node's `FilePack` plugin is enabled.
- A missing `inner_path` is an error: `fileGet: missing inner_path`.

### fileNeed

Downloads a file that the xite declares but the node does not have yet, and answers when it is on disk and verified. It works for required and optional files.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file to download (position 0). |

**Returns:** `"ok"` once the file is present. If it was already present and matches its declared hash, the answer is immediate.

```js
try {
  await epixFrame.fileNeed("media/trailer.mp4");
  document.querySelector("video").src = "media/trailer.mp4";
} catch (result) {
  console.log("Not downloaded:", result.error);
}
```

Notes:

- The handler reads only `inner_path`. The `timeout` and `priority` options that `epixFrame.fileNeed(path, opts)` can send are ignored.
- **Optional files are opt-in.** When the visitor has turned off on-demand optional downloads for the xite and the file is not on disk, the command fails with `Optional file downloads are disabled for this xite`. The node also asks the visitor, in a wrapper dialog, whether to enable optional downloads. It asks once per xite per session. If the visitor accepts, the node enables the setting and fetches that file.
- Concurrent requests for the same file share one download.
- Other errors: `file not declared in content.json`, `<path> has no b3 and cannot be fetched` (the signed entry lacks the hash that EDX transfers need, so the owner must re-sign), and transfer errors when no reachable peer can supply the file.
- Media elements usually do not need this command: an `<img>`, `<audio>` or `<video>` that points at an optional file makes the node fetch it. See [Files and media](../build/files.md).

### fileRules

Returns the signing and size rules that apply to a path. The usual use is to read a visitor's storage quota and current usage before writing to their directory.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | no | The path to check (position 0, or a bare string). Default `content.json`. |

**Returns:** an object. Its shape depends on the path.

For a user manifest, `data/users/<directory>/content.json`, when the xite declares rules for user content:

| Field | Type | Meaning |
| --- | --- | --- |
| `signers` | array of strings | Addresses and names allowed to sign this manifest. The user's own directory name is always included, unless the user is banned. |
| `user_address` | string | The user directory name the rules were resolved for. |
| `cert_signers` | object | The `cert_signers` map from the xite's `user_contents` rules. |
| `includes_allowed` | boolean | Always `false`: a user manifest cannot include further manifests. |
| `current_size` | number | Bytes the user currently uses: the size of the stored `content.json` plus its declared files. `0` when the user has not written anything. |
| other rule keys | any | Whatever the matching `permissions` and `permission_rules` entries grant, for example `max_size`, `max_size_optional` and `files_allowed`. See [User-generated content](../build/user-content.md). |

For any other path:

| Field | Type | Meaning |
| --- | --- | --- |
| `signers` | array of strings | For a path under `data/users/`: the visitor's selected identity address, or an empty array when browsing without an identity. Otherwise the `signers` list of the root `content.json`, or the xite address when there is none. |
| `signers_required` | number | The root `signers_required` value. Default `1`. |
| `user_contents` | object or null | The root `user_contents` rules, when present. |
| `cert_signers` | object | Empty. |
| `max_size` | number | `10485760`. |
| `files_allowed` | string | `".*"`. |

```js
var info = await epixFrame.siteInfo();
if (info.xid_directory) {
  var rules = await epixFrame.fileRules("data/users/" + info.xid_directory + "/content.json");
  if (rules.max_size) {
    console.log("Used " + rules.current_size + " of " + rules.max_size + " bytes");
  }
}
```

### fileQuery

Reads rows straight out of JSON files, without the database. It is useful for small lookups in a xite that has no `dbschema.json`. For anything larger, use [`dbQuery`](database.md#dbquery).

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `dir_inner_path` | string | yes | The JSON file to read (position 0). It may contain one `*`, which stands for exactly one directory name, as in `data/users/*/data.json`. |
| `query` | string | no | What to take from each file (position 1). Empty (default): the whole file. A dotted path such as `topic` or `settings.tags`: the value at that path. A dotted path ending in `field=<integer>`, such as `topic.topic_id=9`: the elements of the list whose `field` equals that integer. |

**Returns:** an array of rows.

- When the selected value is a list, each element becomes a row.
- When it is an object, it becomes one row.
- Each row that is an object gains an `inner_path` field: the directory name the `*` matched, or an empty string when the path has no wildcard.
- Files that cannot be read or are not valid JSON are skipped.

```js
// Every user's topics, each tagged with the user directory it came from.
var topics = await epixFrame.cmd("fileQuery", ["data/users/*/data.json", "topic"]);
// [{ topic_id: 7, title: "Hello", inner_path: "alice.epix" }, ...]

// Only the topic with topic_id 9.
var match = await epixFrame.cmd("fileQuery", ["data/users/*/data.json", "topic.topic_id=9"]);
```

Notes:

- The filter compares integers only. A non-numeric value after `=` is not applied as a filter.
- The command reads the page's own xite. The `cors-` and `merged-` prefixes are not supported.
- A missing `dir_inner_path` is an error: `Missing dir_inner_path`.

## Listing files

### dirList

Lists the entries of one directory.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | no | The directory to list (position 0, or a bare string). Default: the xite root. |
| `stats` | boolean | no | `true` returns an object per entry instead of a name. Read from the object form only. Default `false`. |

**Returns:** an array of entry names, directories first and then files, each group sorted by name. With `stats: true`, an array of `{"name": string, "is_dir": boolean, "size": number}` in the same order, where `size` is in bytes.

```js
var names = await epixFrame.dirList("data/img");
// ["thumbs", "banner.jpg", "logo.png"]

// The stats option is read from the object form (EpixFrame 1.1.0 sends it):
var entries = await epixFrame.dirList("data/img", { stats: true });
// [{ name: "thumbs", is_dir: true, size: 4096 }, { name: "banner.jpg", is_dir: false, size: 48211 }, ...]
```

Notes:

- `epixFrame.dirList(path, opts)` in EpixFrame 1.1.0 sends `{inner_path, ...opts}`. The 1.0.x helper sends an array, so its `opts` argument is not read; with 1.0.x, call `cmd("dirList", { inner_path: path, stats: true })`.
- The listing shows what is on disk on this node, including files that are not yet signed and excluding declared files that have not been downloaded.
- A directory that does not exist is an error: `dir not found`.

### fileList

Lists every file under a directory, including files in subdirectories.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | no | The directory to walk (position 0, or a bare string). Default: the xite root. |

**Returns:** a sorted array of file paths, relative to the directory you asked for (not to the xite root).

```js
var files = await epixFrame.fileList("data/img");
// ["banner.jpg", "logo.png", "thumbs/banner.jpg"]
var urls = files.map(function (name) { return "data/img/" + name; });
```

Notes:

- Like `dirList`, the result reflects the files on disk on this node.
- A directory that does not exist is an error: `dir not found`.

## Writing and deleting

### fileWrite

Writes a file into the xite. The change is a local draft until the `content.json` that covers the file is signed and published.

**Permission:** none. A path under `data/users/` needs a selected xID identity. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file to write (position 0). Missing directories are created. |
| `content_base64` | string | yes | The complete new file content, base64 encoded (position 1). |

**Returns:** `"ok"`.

```js
// The write-then-publish pattern for a visitor's own data file.
var info = await epixFrame.siteInfo();
var path = "data/users/" + info.xid_directory + "/data.json";

var raw = await epixFrame.fileGet(path, { required: false });
var data = raw ? JSON.parse(raw) : { topics: [] };
data.topics.push({ topic_id: Date.now(), title: "Hello", added: Math.floor(Date.now() / 1000) });

await epixFrame.fileWrite(path, toBase64(JSON.stringify(data, null, 1)));
await epixFrame.cmd("sitePublish", { inner_path: path });
```

Notes:

- **The database follows signed content.** The node builds the xite's database only from files that a signed manifest covers and whose bytes match the signed hash. A draft you have just written no longer matches, so do not expect [`dbQuery`](database.md#dbquery) to show the change until the covering `content.json` is signed. `sitePublish` signs by default, so query again when it answers.
- **Events skip the writer.** The `setSiteInfo` event with `["file_done", inner_path]` that announces a changed file goes to other pages open on the same xite. The connection whose command caused the change does not receive it.
- **Signed merge files are merged, not replaced.** If the path is a declared merge file (for example `posts.json` in the official xites), the node unions the records you write with the records already on disk, so a stale page cannot wipe newer records. The content must be valid JSON, otherwise the error is `merge file not JSON: ...`. See [Signed merge files](../build/files.md#signed-merge-files).
- **Previous versions.** Before overwriting a `.json` file the node keeps the previous version as `<name>.json-old` when no such copy exists yet. It uses the copy to send peers a compact change on the next publish. You may see these files in `dirList` and `fileList` results. Leave them alone.
- **No size check at write time.** Size and file name rules are enforced when the manifest is signed and when other nodes verify it. Read the limits first with [`fileRules`](#filerules).
- Errors include `fileWrite: inner_path required`, `fileWrite: content_base64 required`, `fileWrite: invalid base64`, the xID and gateway errors described at the top of this page, and `unknown xite`.

### fileWriteSign

Replaces an existing file and signs the `content.json` that covers it as one transaction. The caller passes the exact bytes it read, and the node rejects the write if the file changed in the meantime. A rejected signature or a stale edit leaves both the file and the manifest unchanged.

Use it for shared settings files where a separate `fileWrite` followed by `siteSign` could leave a half-applied edit, such as the moderation settings of a forum. It is not a general replacement for `fileWrite`.

**Permission:** none. Signing needs a key: the xite's saved private key, a key you pass, or the visitor's selected xID identity. The signer must be allowed by the rules of the governing manifest.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file to replace. |
| `content_base64` | string | yes | The complete new content, base64 encoded. |
| `expected_base64` | string | yes | The exact bytes you read before editing, base64 encoded. |
| `privatekey` | string | no | `"stored"` signs with the private key the node has saved for the target xite. Any other value is used as the private key itself. When omitted, the visitor's selected identity signs. |

Parameters are read from the object form only.

**Returns:** `"ok"` when the signed change is committed locally. Publishing is a separate step.

```js
// Adapted from Epix Talk's admin settings editor.
var path = "data/admin/admin-settings.json";
var raw = await epixFrame.fileGet(path, { required: false });
var settings = JSON.parse(raw);
settings.pinned_topic_uris.push("42_alice.epix");

var params = {
  inner_path: path,
  content_base64: toBase64(JSON.stringify(settings, null, "\t")),
  expected_base64: toBase64(raw)
};
// Owners sign with the saved xite key; delegated admins sign with their xID.
var info = await epixFrame.siteInfo();
if (info.privatekey) params.privatekey = "stored";

await epixFrame.cmd("fileWriteSign", params);
await epixFrame.cmd("sitePublish", { inner_path: "data/admin/content.json", sign: false });
```

Limits, all enforced by the node:

- The target must already exist and be listed under `files` in a `content.json` other than the root one. The command does not create files and does not edit files governed by the root `content.json`, optional files, merge files or a `content.json` itself. Errors: `signed writes require a normal child data file`, `signed writes require a child content.json`, `signed writes require an existing required hashed file`.
- If the bytes on disk differ from `expected_base64`: `File changed since it was read. Reload and retry the update.` Read the file again and reapply your change to the new version. Do not resend the old content.
- With `"stored"` and no saved key: `Xite sign failed: Private key not found in users.json`.
- With no key and no selected identity: `xID required: select or link an identity for this xite`.
- A signer the rules do not allow is rejected at verification, and nothing is written.

!!! note "Older nodes"
    A node that predates this command answers `null`, as it does for any unknown command. Treat `null` as "update EpixNet", and do not fall back to `fileWrite` followed by `siteSign`.

### fileDelete

Deletes a file from the xite on this node. Like a write, the deletion is a draft until the governing `content.json` is signed and published.

**Permission:** none. A path under `data/users/` needs a selected xID identity. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file to delete (position 0, or a bare string). |

**Returns:** `"ok"`.

```js
await epixFrame.fileDelete("data/users/alice.epix/avatar.jpg");
await epixFrame.cmd("sitePublish", { inner_path: "data/users/alice.epix/content.json" });
```

Notes:

- If the file is an optional file, the node also removes its entry from `files_optional` in the governing `content.json` on disk, which then needs signing.
- To free the space of an optional file you downloaded from someone else's xite, use [`optionalFileDelete`](#optionalfiledelete). It removes the local copy and leaves the declaration alone.
- Errors include `fileDelete: inner_path required`, `unknown xite`, and the xID and gateway errors described at the top of this page.

## Access to other xites

### corsPermission

Asks the visitor to let this xite read the files of another xite. After the grant, paths of the form `cors-<address>/<path>` work in the file commands, and the page can load that xite's files over HTTP with its `ajax_key` (see [The wrapper sandbox](../build/sandbox.md)).

**Permission:** none. The visitor must confirm in a wrapper dialog. Disabled on a public gateway.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string or array of strings | yes | The `epix1` address to read from, or a list of addresses. A bare string or a bare array is also accepted as the whole parameter. |

**Returns:** `"ok"` when every requested address is granted, including ones granted earlier.

```js
var other = "<address>";
try {
  await epixFrame.cmd("corsPermission", other);
  var manifest = JSON.parse(await epixFrame.fileGet("cors-" + other + "/content.json"));
  console.log(manifest.title);
} catch (result) {
  console.log("No access:", result.error);
}
```

Notes:

- The node shows one dialog per address that is not granted yet: "This xite requests permission to read files from xite `<address>`". Closing the dialog, declining it or letting it time out grants nothing and returns `corsPermission: access to <address> was not granted`.
- Use the `epix1` address. A `.epix` name is refused with `Xite commands take the epix1 address, not a name: <name>`.
- The grant is stored as the permission `Cors:<address>` and appears in `siteInfo().settings.permissions`.
- A grant gives access to files of a xite the node already serves. It does not add or download the other xite.
- Other errors: `corsPermission: address required`, `corsPermission: malformed address`, and on a gateway `corsPermission is disabled on this gateway`.

## Big file upload

### bigfileUploadInit

Starts an upload of a file over HTTP instead of base64 through `fileWrite`. The command returns a one-time upload URL. The page then sends the file's bytes to that URL with a `POST` request.

**Permission:** none, but the upload is for xite owners. It is accepted when the node owns the xite, or when the visitor's selected identity address is the xite address or is listed in the root `signers`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | Where to store the file (position 0). |
| `size` | number | yes | The file size in bytes (position 1). |

**Returns:**

| Field | Type | Meaning |
| --- | --- | --- |
| `url` | string | The upload URL: `/EpixNet-Internal/BigfileUpload?upload_nonce=<token>`. |
| `piece_size` | number | The piece size the node will hash with: `1048576`. |
| `inner_path` | string | The path as you passed it. |
| `file_relative_path` | string | The file name without its directory. |

```js
async function uploadFile(file) {
  var init = await epixFrame.cmd("bigfileUploadInit", ["media/" + file.name, file.size]);

  var response = await fetch(init.url, { method: "POST", body: file });
  var result = await response.json();
  if (!response.ok) throw new Error(result.error);
  // result: { merkle_root, piece_num, piece_size, inner_path }

  await epixFrame.cmd("sitePublish", { privatekey: "stored", inner_path: "content.json" });
  return result.inner_path;
}
```

What the `POST` does:

- The body is the raw file, or a `multipart/form-data` body with a single file part.
- The node hashes the bytes in pieces, writes the file, and adds an entry for it to `files_optional` in the root `content.json` on disk. A file of more than one piece also gets a `<name>.piecemap.msgpack` file. The root `content.json` then needs signing and publishing.
- A successful response is JSON: `{"merkle_root", "piece_num", "piece_size", "inner_path"}`. A failed one has status 400 (413 for a body that is too large) and `{"error": "..."}`.
- The body must be exactly the size declared to `bigfileUploadInit`. A larger body is refused with 413 (`Upload body exceeds the declared size of <n> bytes`), a shorter one with 400. EpixNet v0.6.8 refuses any body over 2 MB with 413.
- The token works once and only for the xite it was issued for. A refused body leaves it usable for a retry. Errors include `Unknown or expired upload nonce` and `Upload nonce belongs to another xite`.
- The endpoint answers 403 when the node operator has disabled the `Bigfile` plugin.

Errors from the command itself: `bigfileUploadInit: inner_path required`, `bigfileUploadInit: size required`, `Unknown xite` and `Forbidden, you can only modify your own files`.

See [Upload from the page](../build/files.md#upload-from-the-page) for the constraints and for when to publish large files from the xite folder instead.

## Optional files

Optional files are files a xite declares but a node downloads only when they are needed. The commands in this section inspect and manage the local copies. See [Optional files](../build/files.md#optional-files) for how to declare them and how downloads are decided.

Several of these commands take an optional `address` to act on another xite. That is allowed when the address is the page's own xite, when the page's xite holds `ADMIN`, or when the page's xite is a merger and the target is one of its hubs (it declares a `merged_type` the page holds `Merger:<type>` for). Anything else answers `Forbidden`.

### optionalFileList

Lists the optional files of a xite with their local state.

**Permission:** none for the page's own xite. With `address`: the rule above. `address: "all"` needs `ADMIN`.

All parameters are read from the object form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | Another xite to list, or `"all"` for every xite the node serves. Default: the page's own xite. |
| `filter` | string | no | Comma-separated filters. `downloaded` keeps only files present on this node. `bigfile` keeps only big files (entries with a piece map). Default `"downloaded"`. Any other value, such as `"all"`, lists every declared optional file. |
| `filter_inner_path` | string | no | A SQL `LIKE` pattern matched against the path, case-insensitive: `%` matches any run of characters and `_` one character. |
| `orderby` | string | no | Sort order as comma-separated `field` or `field DESC` clauses, for example `"is_pinned DESC, inner_path"`. Default `"time_downloaded DESC"`. |
| `limit` | number | no | Maximum number of rows. Default `0`, which means no limit. |

**Returns:** an array of objects.

| Field | Type | Meaning |
| --- | --- | --- |
| `inner_path` | string | Path of the file. |
| `size` | number | Declared size in bytes. |
| `sha512` | string | Declared hash. |
| `is_downloaded` | boolean | Whether the file is present on this node. |
| `is_pinned` | boolean | Whether the file is pinned. |
| `uploaded` | number | Bytes of this file sent to other peers. |
| `peer` | number | Peers known to have the file, counting this node when it has it. |
| `time_downloaded` | number | Unix time the download finished. `0` when unknown or not downloaded. |
| `pieces`, `pieces_downloaded`, `is_downloading` | number, number, boolean | Big files only: total pieces, pieces present, and whether a bulk download is fetching the file now. |
| `address` | string | Only with `address: "all"`: the xite the row belongs to. |

```js
// The ten largest optional files this node holds for the xite.
var files = await epixFrame.cmd("optionalFileList", {
  filter: "downloaded",
  orderby: "size DESC",
  limit: 10
});
```

Notes:

- `epixFrame.optionalFileList(filterInnerPath, opts)` in EpixFrame 1.1.0 sends these named options: the first argument becomes `filter_inner_path`, and `opts` adds `address`, `filter`, `orderby` and `limit`. The 1.0.x helper `optionalFileList(path)` sends an array, which this command does not read, so it always returns the default list; with 1.0.x, use `cmd` with an object.
- The list covers optional files declared by the root `content.json` and by user manifests.

### optionalFileInfo

Returns the record of one optional file.

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The optional file (position 0, or a bare string). |

**Returns:** `null` when the path is not a declared optional file. Otherwise an object with at least `inner_path`, `size`, `sha512`, `is_downloaded` and `is_pinned`, usually also `uploaded` and `time_downloaded` as in [`optionalFileList`](#optionalfilelist), and:

| Field | Type | Meaning |
| --- | --- | --- |
| `peer` | number | `1` when this node has the file, otherwise `0`. |
| `is_bigfile`, `piece_size`, `piece_num` | boolean, number, number | Present for a file larger than 1 MiB: the piece layout. |
| `piecemap` | string | Present when the entry declares a piece map: its inner path. |

```js
var info = await epixFrame.optionalFileInfo("data/users/alice.epix/photo.jpg");
if (info && !info.is_downloaded) {
  showDownloadButton(info.size);
}
```

### optionalFileDelete

Deletes the local copy of an optional file to free space. The file stays declared, so the node can download it again later.

**Permission:** none for the page's own xite. With `address`: the rule at the top of this section.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The optional file (position 0). |
| `address` | string | no | Another xite that holds the file (position 1). Without it, `cors-` and `merged-` prefixes in `inner_path` are honored. |

**Returns:** `"ok"`. A file that was already gone also returns `"ok"`.

```js
// Send an array. See the warning below.
await epixFrame.cmd("optionalFileDelete", ["data/users/alice.epix/photo.jpg"]);
```

!!! warning "Do not pass a bare string"
    When the whole parameter is a single string, the node reads that string as both `inner_path` and `address`, and the call fails with `Forbidden`. `epixFrame.optionalFileDelete(path)` sends a bare string, so call `cmd` with an array or an object instead.

Notes:

- The command also removes the file's pin.
- Errors: `file not declared`, `<path> is a required file, not optional`, `Forbidden`.

### optionalFilePin

Pins one or more optional files so that automatic cleanup of optional storage never removes them.

**Permission:** none for the page's own xite. With `address`: the rule at the top of this section.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string or array of strings | yes | The file or files to pin (position 0). |
| `address` | string | no | Another xite that holds the files (position 1). Default: the page's own xite. |

**Returns:** `"ok"`.

```js
await epixFrame.optionalFilePin("media/episode-1.mp4");

// Several files at once:
await epixFrame.cmd("optionalFilePin", [["media/episode-1.mp4", "media/episode-2.mp4"]]);
```

Notes:

- Pins are stored per xite and survive a restart.
- The `cors-` and `merged-` prefixes are not resolved here. To pin files of a hub, pass the hub in `address`.
- Send an array or an object. A bare string is also read as `address` and fails with `Forbidden`.
- A missing `inner_path` is an error: `inner_path required`.

### optionalFileUnpin

Removes the pin from one or more optional files. The files stay on disk until cleanup or a delete removes them.

**Permission:** none for the page's own xite. With `address`: the rule at the top of this section.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string or array of strings | yes | The file or files to unpin (position 0). |
| `address` | string | no | Another xite that holds the files (position 1). Default: the page's own xite. |

**Returns:** `"ok"`.

```js
await epixFrame.optionalFileUnpin("media/episode-1.mp4");
```

The notes for [`optionalFilePin`](#optionalfilepin) apply.

### fileTransferStats

Returns a live picture of how the node is fetching one file: transfer rates, bytes held, requests in flight and per-peer detail. A media player can poll it to explain a stall, for example to tell "no peers" from "one slow peer".

**Permission:** none. A `cors-` or `merged-` path needs the matching permission.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `inner_path` | string | yes | The file (position 0). |
| `offset` | number | no | The byte position the page is reading from, so the node can report how much it holds ahead of that point. Read from the object form only. Default: where the node last served the file. |

**Returns:** an object. `address`, `inner_path`, `peers` and `peers_known` are always present. The other fields appear once the node has something to report: a file it holds from an earlier run has `size` and `have` but no rates, and a file with no transfer record at all has only the four fields above.

| Field | Type | Meaning |
| --- | --- | --- |
| `address`, `inner_path` | string | The file the numbers describe. |
| `peers` | array | One object per peer taking part in the transfer, fastest first. Empty when no transfer is running. |
| `peers_known` | number | Connectable peers the node knows for the xite (the node counts at most 20). |
| `size` | number | Declared size in bytes. |
| `have` | number | Bytes of the file the node holds. |
| `have_ahead` | number | Contiguous bytes held from the read position onward. |
| `rate_in`, `rate_out` | number | Current download and upload rate in bytes per second. |
| `elapsed` | number | Seconds since the transfer started. |
| `requests`, `inflight`, `duplicates`, `batch_failures` | number | Request counters for the transfer. |
| `session` | object | `dialed` and `connected` peer counts and the session `age` in seconds. |
| `last_error` | object or null | `{"at": seconds ago, "error": text}` for the most recent failure. |

Each entry of `peers` has `peer` (a label), `transport` (`"clearnet"`, `"tor"`, `"i2p"` or `"unknown"`), `rate` (bytes per second), `bytes`, `requests`, `delivered`, `failed`, `inflight`, `inflight_bytes`, `last_ms` and `idle` (seconds since the peer last delivered).

The object carries further diagnostic fields, such as a coarse map of which parts of the file are present. Treat fields not listed here as subject to change.

```js
// Poll once a second while a video is buffering.
var timer = setInterval(async function () {
  var stats = await epixFrame.cmd("fileTransferStats", { inner_path: "media/film.mp4" });
  var active = stats.peers.filter(function (p) { return p.rate > 0; }).length;
  statusLine.textContent = active + " of " + stats.peers_known + " known peers sending, " +
    Math.round((stats.rate_in || 0) / 1024) + " KiB/s";
}, 1000);
```

## Helping distribute optional files

A node can commit to keeping and serving all optional files under a directory of a xite, for example the directory of a user whose posts the visitor follows. This is how Epix Post keeps the images of followed users available.

Each command in this section exists under two spellings, with a lowercase and an uppercase first letter. They are the same command. The uppercase spellings exist because existing xites call them that way.

All of them accept an `address` under the rule described in [Optional files](#optional-files).

### optionalHelp

Starts helping to distribute the optional files under a directory. The node records the directory, begins downloading the optional files under it, and shows the visitor a notification: "You started to help distribute `<title>`. Directory: `<directory>`".

**Permission:** none for the page's own xite. With `address`: `ADMIN`, or a merger xite acting on one of its hubs.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | yes | The directory to help with (position 0). It is matched as a path prefix. |
| `title` | string | no | A label for the commitment, shown in the notification and returned by `optionalHelpList` (position 1). Default: empty. |
| `address` | string | no | The xite the directory belongs to (position 2). Default: the page's own xite. |

**Returns:** `{"num": number, "size": number}`: how many optional files are declared under the directory now, and their total size in bytes.

```js
// A merger xite keeps a followed user's files available in a hub.
var hub = "<address>";
var result = await epixFrame.optionalHelp("data/users/alice.epix", "alice's posts", hub);
console.log("Helping with " + result.num + " files, " + result.size + " bytes");
```

Notes:

- Send an array or an object. A bare string is read as `address`.
- Errors: `optionalHelp: directory required`, `Forbidden`, `Unknown xite`.

### OptionalHelp

Alias of [`optionalHelp`](#optionalhelp) with an uppercase first letter. Same permission, parameters and result.

**Permission:** as for `optionalHelp`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | yes | Position 0. |
| `title` | string | no | Position 1. |
| `address` | string | no | Position 2. |

**Returns:** `{"num": number, "size": number}`.

```js
epixFrame.cmd("OptionalHelp", ["data/users/alice.epix", "alice's posts", "<address>"]);
```

### optionalHelpRemove

Stops helping with a directory. Files already downloaded stay on disk until cleanup or a delete removes them.

**Permission:** as for [`optionalHelp`](#optionalhelp).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | yes | The directory, exactly as it was passed to `optionalHelp` (position 0). |
| `address` | string | no | The xite the directory belongs to (position 1). Default: the page's own xite. |

**Returns:** `"ok"`, or `{"error": "Not found"}` when the directory was not being helped.

```js
try {
  await epixFrame.optionalHelpRemove("data/users/alice.epix", "<address>");
} catch (result) {
  // result.error is "Not found" when there was nothing to remove.
}
```

Other errors: `optionalHelpRemove: directory required`, `Forbidden`.

### OptionalHelpRemove

Alias of [`optionalHelpRemove`](#optionalhelpremove) with an uppercase first letter.

**Permission:** as for `optionalHelp`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `directory` | string | yes | Position 0. |
| `address` | string | no | Position 1. |

**Returns:** `"ok"`, or `{"error": "Not found"}`.

```js
epixFrame.cmd("OptionalHelpRemove", ["data/users/alice.epix", "<address>"]);
```

### optionalHelpList

Returns the directories the node is helping with on a xite.

**Permission:** as for [`optionalHelp`](#optionalhelp).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | The xite to list (position 0, or a bare string). Default: the page's own xite. |

**Returns:** an object that maps each directory to the title it was added with, for example `{"data/users/alice.epix": "alice's posts"}`. Empty when nothing is helped.

```js
var helps = await epixFrame.cmd("optionalHelpList", ["<address>"]);
var helping = Object.prototype.hasOwnProperty.call(helps, "data/users/alice.epix");
```

Errors: `Forbidden`, `Unknown xite`.

### OptionalHelpList

Alias of [`optionalHelpList`](#optionalhelplist) with an uppercase first letter.

**Permission:** as for `optionalHelp`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | no | Position 0. |

**Returns:** an object that maps directories to titles.

```js
// As Epix Post calls it:
epixFrame.cmd("OptionalHelpList", ["<address>"], function (helps) {
  if (!helps || helps.error) return;
  console.log(Object.keys(helps));
});
```

### optionalHelpAll

Turns automatic download of every optional file of a xite on or off. Turning it on also enables on-demand optional downloads for the xite and starts fetching the optional files that are missing. This is the same setting the visitor controls in the xite sidebar.

**Permission:** as for [`optionalHelp`](#optionalhelp).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `value` | boolean | no | `true` to turn it on, `false` to turn it off (position 0). Default `false`. |
| `address` | string | no | The xite to change (position 1). Default: the page's own xite. |

**Returns:** the new value, `true` or `false`. The node also pushes a `setSiteInfo` event with the updated settings.

```js
var enabled = await epixFrame.cmd("optionalHelpAll", [true]);
```

!!! warning "Ask first"
    This command can start a large download without a dialog. Call it only in response to a clear action by the visitor, and say how much data is involved. [`optionalFileList`](#optionalfilelist) with `filter: "all"` gives you the sizes.

### OptionalHelpAll

Alias of [`optionalHelpAll`](#optionalhelpall) with an uppercase first letter.

**Permission:** as for `optionalHelp`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `value` | boolean | no | Position 0. |
| `address` | string | no | Position 1. |

**Returns:** the new value.

```js
epixFrame.cmd("OptionalHelpAll", [false]);
```

## Related pages

- [Files and media](../build/files.md): optional files, big files, EDX streaming, signed writes and merge files explained.
- [User-generated content](../build/user-content.md): user directories, rules and quotas.
- [Merger xites and hubs](../build/merger-hubs.md): the `merged-` path prefix in context.
- [Xite and server commands](xite.md): `siteSign`, `sitePublish` and the `setSiteInfo` event.
- [Database commands](database.md): query the data your files feed into.
- [Admin commands](admin.md): node-wide optional storage limits and per-xite download settings.
- [The wrapper sandbox](../build/sandbox.md): reading files over HTTP with `ajax_key`.
