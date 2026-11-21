---
description: How visitors write to a xite. User directories, xID identity, permission rules, size limits, the write and publish sequence, and owner moderation.
---

# User content

This page explains how people other than the owner write to a xite: where their files live, how the node decides whether a write is allowed, and what your page has to do to save and publish it. It is for developers building anything interactive, such as comments, votes, profiles or listings.

A xite is a folder of files signed by its owner. User content extends that model: each visitor gets a directory of their own, signs its contents with their own key, and the owner publishes the rules every node uses to accept or reject those signatures. No server takes part in any of this.

## The model in brief

- The owner signs the root `content.json`. It delegates a subtree, by convention `data/users/`, to a child manifest.
- That child manifest, `data/users/content.json`, is also signed by the owner (or an account the owner names). It carries a `user_contents` block: who may write, how much, and which files.
- Each visitor writes into `data/users/<directory>/` and signs a `content.json` in that directory with their identity key.
- Every node that receives a user's `content.json` checks it against the owner's rules before storing or serving it.

```text
data/users/
  content.json            owner-signed, holds user_contents (the rules)
  alice.epix/
    content.json          signed by alice's identity key
    data.json             a hashed file, declared in "files"
    comments.json         a signed merge file, declared in "files_merged"
  bob.epix/
    content.json
    data.json
```

!!! note "What a signature proves"
    A valid signature shows that a file was written by the holder of a key that the owner's rules allow. It does not make the content accurate, safe or lawful. Treat everything you read from user directories as untrusted input and escape it before rendering.

## Identity: xID names and auth addresses

Posting requires an [xID](../start/xid.md), a name registered on Epix Chain. Browsing does not. The node keeps a list of the identities the person has linked. One of them is the node-wide default, and each xite can use the default, pick another identity, or use none.

For the selected identity the node holds:

| Term | Example | Meaning |
| --- | --- | --- |
| xID name | `alice.epix` | The on-chain name. It is also the user's directory name under `data/users/`. |
| Auth address | `epix1...` | The address of the identity key that signs this user's content. The chain links it to the name. |
| `cert_user_id` | `alice@xid.epix` | The identity label written into the user's `content.json`. |

### What the page sees in siteInfo

`siteInfo` reports the identity in effect for the current xite. All identity fields are `null` while the visitor browses anonymously.

| Field | Meaning |
| --- | --- |
| `auth_address` | Address that will sign this visitor's content, or `null`. |
| `cert_user_id` | `<name>@xid.epix`, or `null`. |
| `xid_directory` | Directory name to write under, for example `alice.epix`, or `null`. |
| `identities` | Every linked identity, each with `xid`, `name`, `tld`, `auth_address`, `directory`, `cert_user_id`, `selected`, `default` and `linked_at`. |
| `identity_scope` | `inherit` (node default applies), `xite` (an identity chosen for this xite) or `none` (explicitly anonymous here). |
| `privatekey` | `true` when this node holds the xite's own signing key. It is a flag, never the key. |

Build write paths from `xid_directory`. Do not derive a directory from `auth_address`: a name can be linked to more than one address, and the directory is named after the xID.

### Asking the visitor to pick an identity

Call `certXid` to open the node's identity picker. The picker lists the identities already held on this node, names the chain links to the person's addresses, and a link to register a new one. The command resolves with `"ok"` when the visitor made a choice, which includes picking **None** to browse without an identity, and with `"Not changed"` when the dialog was dismissed. Because `"ok"` does not prove an identity is now selected, read `siteInfo` again afterwards, as the example does. Details are in [`certXid`](../api/identity.md#certxid).

```js title="js/identity.js"
// Page is your EpixFrame instance (see ../libraries/epixframe.md).
async function requireIdentity() {
  let info = await Page.cmd("siteInfo");
  if (info.cert_user_id) return info;

  const result = await Page.cmd("certXid", []);
  if (result !== "ok") return null;          // dismissed, or sent to register

  info = await Page.cmd("siteInfo");
  return info.cert_user_id ? info : null;
}
```

When the identity changes, the node pushes a `setSiteInfo` event whose `event` field is `["cert_changed", <cert_user_id or null>]`. Re-read your state when you see it. The wrapper forwards these events to the page without any subscription call.

`identityList` and `identitySelect` give finer control if you want to build your own picker. They are described in [identity commands](../api/identity.md). The older `certSelect` command still opens the same picker for pages that were written before xID. `certAdd` is not supported: identities are linked xIDs, not certificates issued by a provider.

## Declare the rules

Two manifests are involved. The root `content.json` hands the subtree to a child manifest and keeps user files out of the root file list:

```json title="content.json (excerpt)"
{
  "ignore": "(data/users/.*/.*|data/users/.*\\.db)",
  "includes": {
    "data/users/content.json": {
      "signers": ["admin.epix"],
      "signers_required": 1
    }
  }
}
```

The child manifest carries the rules. This example is trimmed from Epix Talk:

```json title="data/users/content.json"
{
  "address": "<xite address>",
  "inner_path": "data/users/content.json",
  "files": {},
  "ignore": ".",
  "user_contents": {
    "cert_signers": {
      "xid.epix": ["chain"]
    },
    "permission_rules": {
      ".": {
        "files_allowed": "data.json",
        "max_size": 200000,
        "merge_files": {
          "topics.json": { "class": "epix-orset-1", "max_size": 3000000 },
          "comments.json": { "class": "epix-orset-1", "max_size": 3000000 }
        },
        "signers": ["admin.epix"]
      }
    },
    "permissions": {}
  }
}
```

The `"ignore": "."` line matches every path, so the owner's signature on this manifest lists no files of its own. The user directories below it are each covered by their own `content.json`.

Sign this manifest separately from the root. In the xite sidebar, choose `data/users/content.json` as the content file under content publishing. From the command line, pass the path as the third argument:

```sh
epix-server siteSign <address> "" data/users/content.json
epix-server sitePublish <address> data/users/content.json
```

The empty second argument means "no explicit private key": the identity selected for the xite signs, which works when that xID is named in the include's `signers`. Pass the xite's private key there instead to sign as the xite itself, which is always an allowed signer. See [publishing](publishing.md).

!!! tip "Keep the two-level layout"
    The node finds the rules for a user file by walking up from the file's directory to the nearest accepted `content.json` that declares `includes` or `user_contents`. Putting `user_contents` in its own `data/users/content.json`, included from the root, is the layout Epix Talk, Epix Sites and the Epix Post hub all use, and it lets you change rules without re-signing the whole xite.

### user_contents fields

| Field | Type | Purpose |
| --- | --- | --- |
| `cert_signers` | object | Accepted identity providers. `{"xid.epix": ["chain"]}` means the identity must be an xID that Epix Chain links to the signing address. This is the only form the node can issue identities for today. |
| `permission_rules` | object | Rules keyed by a regular expression. Every key that matches the user is merged into that user's rules. |
| `permissions` | object | Per-user rules keyed by the exact directory name or `cert_user_id`. They are the starting point that matching `permission_rules` are merged into, so they can raise a limit but not lower one. A value of `false` bans that user. |
| `archived` | object | `{"<directory>": <unix time>}`. Content in that directory signed at or before the time is revoked. |
| `archived_before` | number | A cutoff for every user directory at once. |

`permission_rules` keys are matched from the start of the string `<cert_auth_type>/<cert_user_id>`, for example `xid/alice@xid.epix`. The key `.` or `.*` therefore matches everyone, and `xid/.*` matches every xID user. When several keys match, values are merged: the larger number wins, the longer string wins, and lists are appended. A rule whose value is `null` contributes `max_size` and `max_size_optional` of `0`. Because the larger number wins, it leaves a user with no storage only when no other matching rule or `permissions` entry grants some.

### Rule keys

| Key | Meaning |
| --- | --- |
| `max_size` | Byte limit for the user's `content.json` plus every file listed in its `files`. |
| `max_size_optional` | Byte limit for the user's optional files (`files_optional`). |
| `files_allowed` | Regular expression every path in `files` must match in full. Paths are relative to the user directory. |
| `files_allowed_optional` | The same for `files_optional`. |
| `merge_files` | Allow-list of [merge files](files.md#signed-merge-files) the user may declare, each with a `class` and its own `max_size`. |
| `max_items` | `{"<key>": <n>}`. Caps the length of the named array in the user's `data.json`. |
| `signers` | Extra accounts that may sign any user directory this rule matches. Use it for moderators. Entries can be addresses or xID names. |

The node adds two things itself: the user's own directory name as a signer (unless the user is banned), and `includes_allowed: false`, so a user directory can never delegate further.

## How a user manifest is verified

A user's `content.json` looks like this once signed:

```json title="data/users/alice.epix/content.json"
{
  "address": "<xite address>",
  "inner_path": "data/users/alice.epix/content.json",
  "cert_auth_type": "xid",
  "cert_user_id": "alice@xid.epix",
  "cert_sign": "<signature>",
  "files": {
    "data.json": { "sha512": "<hash>", "b3": "<hash>", "size": 309 }
  },
  "files_merged": {
    "comments.json": { "class": "epix-orset-1" }
  },
  "modified": 1775249610,
  "signs": { "<auth address>": "<signature>" }
}
```

You never write the `cert_*`, `files`, `files_merged`, `modified` or `signs` fields yourself. The node fills them in when it signs.

Each node that receives the file checks, in order:

1. **The identity.** `cert_sign` is the identity key's signature over `<auth address>#xid/<name>`. The address it recovers to must be one the chain links to that name. If the link has been revoked, content stays valid only when its `modified` time is earlier than the revocation plus a 60 second grace period.
2. **Archiving.** The file is rejected if the owner archived that directory at or after its `modified` time.
3. **The signature.** `signs` must contain a valid signature from an allowed signer: an address linked to the directory's xID name, a signer named in the rules, or the xite's own address.
4. **The rules.** Sizes, allowed file names, merge file declarations, item counts and the ban on nested includes.

If the node cannot reach Epix Chain to resolve a name, it withholds its verdict on that user's content and retries later. The content is neither accepted nor rejected in the meantime, so a directory can be missing from a freshly started node for a while. See [how the node verifies xID](../internals/xid-light-client.md).

## Write and publish from the page

The sequence is always the same:

1. Make sure the visitor has an identity (`certXid`).
2. Write the file with `fileWrite`. The content is base64 encoded.
3. Call `sitePublish` with the path of the user's `content.json`. The node signs that manifest as the visitor's identity, commits it, and pushes it to peers.

```js title="js/save.js"
function toBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

async function saveProfile(profile) {
  const info = await requireIdentity();
  if (!info) return false;

  const dir = "data/users/" + info.xid_directory;
  const body = toBase64(JSON.stringify(profile, null, "\t"));

  try {
    await Page.cmd("fileWrite", [dir + "/data.json", body]);
    await Page.cmd("sitePublish", { inner_path: dir + "/content.json" });
    return true;
  } catch (res) {
    Page.cmd("wrapperNotification", ["error", "Could not save: " + res.error]);
    return false;
  }
}
```

A few details that matter:

- **`sitePublish` signs by default.** It is the usual one-step call. Pass `"sign": false` to push a manifest that is already signed. `siteSign` signs without publishing.
- **`inner_path` picks the manifest.** You can pass the user's `content.json` or any file inside the directory. The node resolves the manifest that governs it. With no `inner_path`, the root `content.json` is assumed, which is not what a visitor's page wants.
- **No private key is needed.** With no `privatekey` argument, a user manifest is signed by the identity selected for this xite.
- **`"ok"` means signed and committed locally.** Delivery to peers is best effort. The publishing page receives a notification saying either that the changes were published or that no peers were reachable and the content will spread on the next sync. Do not treat `"ok"` as proof that anyone else has the content yet.
- **Without an identity the write fails.** `fileWrite` under `data/users/` returns the error `xID required: select or link an identity for this xite`.

!!! info "Promise and callback styles"
    `Page.cmd(name, params)` returns a promise that rejects with `{error: "..."}` when the node reports an error. `Page.cmd(name, params, callback)` passes the raw result, including error objects, to the callback. The official xites mostly use the callback form. Both are covered in the [EpixFrame guide](../libraries/epixframe.md).

### Drafts and pending writes

`fileWrite` on its own produces a draft. The file is on disk, but the manifest that declares it has not been signed, so:

- other nodes never see it, and
- the xite database on your own node indexes accepted, signed data. Do not expect `dbQuery` to return a row from a draft. Re-query after `sitePublish` resolves.

The node pushes a `setSiteInfo` event with `event: ["file_done", "<inner_path>"]` when a file lands, but the connection that made the write does not receive the echo for its own change. Update your own view from the command result, and use `file_done` to refresh for changes made elsewhere.

If your interface shows an item before the publish has finished, mark it as pending and reconcile when the command resolves. A failed signature leaves the draft on disk. The owner sidebar lists files that differ from the signed manifest.

### Check the quota first

`fileRules` returns the merged rules for a user manifest together with `current_size`, measured the same way `max_size` is enforced:

```js
const dir = "data/users/" + info.xid_directory;
const rules = await Page.cmd("fileRules", dir + "/content.json");
const left = rules.max_size - rules.current_size;
```

## Choose a storage style

There are two ways to store what a visitor writes.

| Style | How it behaves | Use it for |
| --- | --- | --- |
| Plain JSON file (`data.json`) | The whole file is hashed and replaced on every publish. The last writer wins. | Small single-value state such as a profile or settings. |
| Signed merge file (`comments.json`) | Each record is signed on its own and nodes take the union. A stale or blank write cannot remove records. | Anything list-shaped: posts, comments, votes, reports. |

A page that keeps a growing list in `data.json` risks data loss: if it loads before the file has synced and then saves, it publishes a shorter list over the real one. The official xites moved their lists to merge files for that reason. The full pattern, including `recordSign`, edits and deletes, is in [signed merge files](files.md#signed-merge-files).

To query either style, map the files into the xite database. See [database](database.md). User rows join to the `json` table, whose `directory` column holds the user's directory name.

## Moderation

Moderation is a set of owner-signed rules and records. Every node applies them independently when it verifies content.

**Delegated signers.** Add accounts to `signers` in a `permission_rules` entry. Those accounts can sign any user directory the rule matches. In Epix Talk the catch-all rule names the forum's admin, so an admin can publish a moderation record into another user's directory.

**Moderation tombstones.** In a merge file, a record with `"deleted": true` and `"moderated": true` may be signed by any allowed signer of the directory, not only by the author. It can hide an item. It can never change an item's content. See [signed merge files](files.md#signed-merge-files).

**Bans.** Set `permissions["<directory>"]` to `false` and re-sign `data/users/content.json`. The banned user is no longer an allowed signer of their own directory, so nothing new they sign verifies.

```json title="data/users/content.json (excerpt)"
"user_contents": {
  "permissions": { "spammer.epix": false },
  "archived": { "spammer.epix": 1794000000 }
}
```

**Archiving.** `archived` revokes what a user has already published: a user manifest in that directory with a `modified` time at or before the cutoff stops verifying, and nodes that accept the new rules remove that directory's files. `archived_before` does the same for every directory.

**Settings your admins edit.** For data that several admins change, such as a pinned list or a moderator roster, put the file under its own owner-governed manifest and write it with [`fileWriteSign`](files.md#signed-file-writes), which rejects stale edits.

**Local mutes.** `muteAdd` hides an author on this node only, by leaving their files out of the local database. Unless the xite holds `ADMIN`, the node asks the visitor to confirm first. It changes nothing for anyone else.

!!! warning "Limits of moderation"
    These tools control what participating nodes accept and index from now on. They do not erase copies that already replicated, older versions, backups or exports, and they do not bind software that ignores the rules. Do not promise users that deletion is complete.

## Troubleshooting

| Message | Likely cause |
| --- | --- |
| `xID required: select or link an identity for this xite` | No identity is selected for this xite. Call `certXid`. |
| `Include too large` | The user's `content.json` plus `files` exceeds `max_size`. |
| `Include optional files too large` | Optional files exceed `max_size_optional`. |
| `File not allowed` / `Optional file not allowed` | A path does not match `files_allowed` or `files_allowed_optional`. |
| `Merge file not allowed` | The file is not listed in the owner's `merge_files`. |
| `Too many items in ...` | A `max_items` cap was exceeded. |
| `Invalid cert!`, `xID name '...' not found on chain` | The identity is not linked to that name on chain, or the name does not exist. |
| `Valid signs: 0/1` | The signer is not allowed for this directory, for example after a ban. |
| `This file is archived!` | The owner archived the directory after this content was signed. |
| `This node is a read-only gateway; changes are disabled here` | The page is being viewed through a public gateway. Writes need the visitor's own node. |

## Related pages

- [content.json reference](content-json.md) for `includes` and the other manifest fields.
- [Files](files.md) for optional files in user directories and for merge files.
- [Merger xites and hubs](merger-hubs.md) when user content lives in separate hub xites.
- [File commands](../api/files.md), [xite commands](../api/xite.md) and [identity commands](../api/identity.md).
- [The sandbox](sandbox.md) for what a page may and may not do.
