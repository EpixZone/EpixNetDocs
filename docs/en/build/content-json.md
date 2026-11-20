---
description: Field-by-field reference for content.json, the signed manifest of every xite.
---

# content.json reference

`content.json` is the signed manifest of a xite: it names the xite, lists every file with its size and hash, and carries the owner's signature. This page documents every field the current node reads or writes, for xite authors who edit the file by hand or generate it from a build script.

## How the file is used

- The **root** `content.json` sits at the top of the xite folder. Its signature must come from the xite's own address, so a valid root manifest proves that the owner published exactly this set of files.
- A directory can hold its **own** `content.json`. That directory is then a separately signed unit: its files are listed in its manifest, not in the root. The root (or another parent) decides who may sign it through [`includes`](#includes) or [`user_contents`](#user_contents).
- Nodes exchange manifests first and files second. A node accepts a manifest only when its signature and rules verify and its `modified` time is newer than the copy it already has. It then fetches any file whose hash changed.

A valid signature proves authorship. It does not make the content safe or lawful.

## Who writes what

Fields fall into three groups. Knowing which is which prevents most mistakes.

| Group | Fields | Rule |
| --- | --- | --- |
| You write | `title`, `description`, `domain`, `favicon`, `background-color` and its theme variants, `viewport`, `ignore`, `optional`, `shard`, `includes`, `postmessage_nonce_security`, `cloneable`, `merged_type`, `order_policy`, `distribution`, `feeds`, `pool`, `evx`, `settings` | Edit freely, then sign. The signer keeps your values. |
| The signer writes | `address`, `inner_path`, `modified`, `files`, `files_optional`, `signs`, `signs_required`, `epixnet_version`, `edx`, `bundles`, `files_merkle_root`, `files_shard`, `edx_salt` | Rebuilt or stamped on every sign. Hand edits are overwritten or break the signature. |
| Written once at creation | `address_index`, `cloned_from`, `clone_root` | Leave as they are. |

Because unknown fields are part of the signed payload and are otherwise ignored, you may add your own fields. Official xites use a `settings` object for this.

## Annotated example

A trimmed root manifest for a forum xite with user content:

```json title="content.json"
{
 "address": "epix1examplexiteaddress0000000000000000000000",
 "address_index": 33769021,
 "background-color": "#F5F5F5",
 "background-color-dark": "#2e2b32",
 "background-color-light": "",
 "bundles": {
  "9c1f...e2": {"seq": 0, "size": 262144}
 },
 "cloneable": true,
 "description": "Decentralized forum with xID",
 "distribution": {
  "default": {"retention": "complete", "unit": "package"},
  "paths": {
   "data/users/": {"retention": "complete", "unit": "feed"}
  }
 },
 "domain": "forum.epix",
 "edx": 1,
 "epixnet_version": "0.6.8",
 "favicon": "img/favicon.ico",
 "files": {
  "index.html": {
   "b3": "5d0c...9a",
   "bundle": "9c1f...e2",
   "off": 0,
   "sha512": "a3f1...77",
   "size": 18240
  },
  "js/app.js": {
   "b3": "71be...04",
   "bundle": "9c1f...e2",
   "off": 18240,
   "sha512": "0e9d...c1",
   "size": 40112
  }
 },
 "files_merkle_root": "b7a4...30",
 "ignore": "(data/users/.*/.*|\\.git|.*\\.py)",
 "includes": {
  "data/users/content.json": {
   "signers": ["alice.epix"],
   "signers_required": 1
  }
 },
 "inner_path": "content.json",
 "modified": 1794340473,
 "optional": "",
 "order_policy": {
  "first_paint": ["index.html", "css/all.css", "js/app.js"],
  "prefetch": ["img/banner.png"]
 },
 "postmessage_nonce_security": true,
 "shard": "",
 "signs": {
  "epix1examplexiteaddress0000000000000000000000": "G1qY...tL8="
 },
 "signs_required": 1,
 "title": "Example Forum",
 "viewport": "width=device-width, initial-scale=1"
}
```

The address is a placeholder, and hashes and signatures are shortened. The node writes the file with sorted keys and one-space indentation, so diffs between versions stay small.

## Descriptive fields

These control how the xite is presented. New and re-signed xites get any missing field from this section added with the value `""`, so you can fill them in without looking up the names. A blank value means "use the default".

### title

The xite's name. Shown in the wrapper's page title, the Dashboard and the sidebar. When blank, the wrapper falls back to the name or address the visitor typed.

### description

A short description, shown in the Dashboard and the sidebar.

### domain

The `.epix` name this xite claims, for example `"forum.epix"`. It is a claim, not a registration: the node checks it against the name's record in xID, and only a verified match is shown in the address bar. See [Give your xite a .epix name](publishing.md#give-your-xite-a-epix-name).

### favicon

Path to the icon, relative to the xite root, for example `"img/icon.png"`. The wrapper adds it as the page icon. When the field is blank, the Dashboard's xite list falls back to `favicon.ico`, `favicon.png`, `img/favicon.ico` or `img/favicon.png` if the xite ships one.

### background-color, background-color-light, background-color-dark

The color painted behind the iframe while the page loads, which avoids a flash of the wrong color. The wrapper uses the variant matching the visitor's theme and falls back to `background-color`.

Values are limited to 128 characters from letters, digits, spaces and `# ( ) , . % - + / _`, which covers hex colors and functions such as `rgb(20, 20, 24)`. Anything else is ignored.

### viewport

Content for the wrapper's `<meta name="viewport">` tag, for example `"width=device-width, initial-scale=1"`. A page can change it later with `wrapperSetViewport`.

## File selection patterns

Three regular expressions decide how files on disk are treated when you sign. Each is matched from the **start** of the file's path relative to the manifest's directory, so `"drafts/"` matches `drafts/a.txt` but not `old/drafts/a.txt`. Use `.*` to match anywhere: `".*\\.map"`. A blank or invalid pattern matches nothing. Lookahead is supported, which the official xites use for "everything in this folder except" rules:

```json
"ignore": "(css/(?!all\\.css)|data/users/.*/.*|\\.git|.*\\.py)"
```

### ignore

Files that must not be signed. They stay on your disk and are never listed, so other nodes never receive them. Typical entries: build sources, `.git`, `node_modules/`, tests, local databases, and user directories that are signed by their own manifests.

### optional

Files to list in `files_optional` instead of `files`. Visitors do not download optional files with the xite; they fetch them on demand or when they opt in. Use this for large media. See [Files](files.md).

### shard

Files to publish only as encrypted shards. Matching files are removed from `files` and `files_optional` and described in `files_shard` instead; a per-xite `edx_salt` is generated on first use. See [Files](files.md) before using this.

### What signing always skips

Regardless of the patterns, the signer never lists:

- any `content.json` (each one is its own signed unit);
- files inside a subdirectory that has its own `content.json`;
- files whose own name starts with a dot, such as `.gitignore` or the node's `.sign-cache.json`;
- files ending in `-old`, `-new`, `-shm`, `-wal` or `-journal` (temporary and SQLite companion files);
- files declared as merge files in `files_merged`.

!!! warning "Dot directories are not skipped"
    Only a file's own name is checked for a leading dot. Files inside a directory such as `.git/` are signed unless you exclude the directory, which is why most xites include `\\.git` in `ignore`.

## Generated fields

### address

The xite's `epix1...` address. A manifest whose `address` differs from the xite it was fetched for is rejected.

### inner_path

The manifest's own path inside the xite: `"content.json"` for the root, `"data/users/content.json"` for a child. Must match where the file actually is.

### modified

Signing time in whole seconds since the Unix epoch. Each sign uses the current time, or the previous value plus one if the clock has not advanced. A node replaces its copy only with a manifest whose `modified` is greater.

### files

One entry per required file, keyed by path relative to the manifest's directory.

| Key | Meaning |
| --- | --- |
| `size` | Size in bytes. A nonnegative integer. |
| `sha512` | The first 32 bytes of the file's SHA-512, as 64 lowercase hexadecimal characters. |
| `b3` | BLAKE3 root of the file, 64 hexadecimal characters. Used by EDX for verified, resumable and partial downloads. |
| `bundle`, `off` | For small files (under 128 KiB) packed together: the bundle that holds the bytes and the offset inside it. |

Paths must be portable. The node rejects a manifest that contains an absolute path, a `.` or `..` segment, a backslash or any of `: * ? " < > |`, a control character, a segment ending in a space or dot, or a Windows device name such as `CON` or `LPT1`. Two paths that differ only by letter case are also rejected, because they would collide on case-insensitive file systems.

### files_optional

Same shape as `files`, for files matched by `optional`. An entry whose file is missing from your disk is dropped at the next sign, so deleting an optional file really removes it from the xite. To keep entries for files you no longer hold locally, sign with the keep-missing option ([Publishing](publishing.md#from-the-command-line)).

### signs

A map from signer address to signature. The signed text is the manifest without `signs`, serialized with sorted keys. For the root manifest the signer is the xite address. An old-style single `sign` field is not accepted.

### signs_required

Set to `1` when missing. One valid signature from an authorized signer is always sufficient; larger values are not enforced.

### epixnet_version

The version of the node that produced the signature. Informational.

### edx, bundles, files_merkle_root

EDX is the node's content distribution layer. On every sign the node sets `edx` to `1`, groups small required files into `bundles` (each with a `size` and a `seq` creation order) and writes `files_merkle_root`, a commitment to the whole file set. Bundle membership is kept stable across signs so unchanged files are not re-downloaded. These fields are part of the signed manifest but need no attention from you. See [EDX content distribution](../internals/edx.md).

### files_shard, edx_salt

Written only when `shard` is set. `files_shard` describes each encrypted file's chunks; `edx_salt` is a random per-xite salt, generated once and kept stable.

### address_index, cloned_from, clone_root

`address_index` is written when the node creates a xite. It is the public index that lets the owner key be re-derived from the node's master seed, so keep it. See [Owner keys](publishing.md#owner-keys).

`cloned_from` (source address) and `clone_root` (template directory inside the source) are written when a xite is cloned. The Dashboard uses them to offer **Upgrade code**.

## Behavior fields

### postmessage_nonce_security

Boolean. When `true`, the wrapper only accepts messages from the page that carry the `wrapper_nonce` the node placed in the page URL. EpixFrame sends it automatically. Xites created from the Dashboard have it enabled. Keep it on, and make sure page-to-page links load through the wrapper ([Links and relative URLs](anatomy.md#links-and-relative-urls)).

### cloneable

Boolean. When `true`, the Dashboard offers a **Clone** action for the xite. Cloning copies the files into a new xite with a new address and key. Paths containing `-default` are treated as the clean starting state: `data-default/` is copied to `data/` in the clone, and the source's own `data/` is left behind. If a `content.json-default` exists it is used as the clone's manifest template. See [Cloning](publishing.md#cloning).

### merged_type

A string that marks this xite as a hub that merger xites of that type may combine into one view. See [Merger xites and hubs](merger-hubs.md).

### order_policy

Tells downloading nodes what to fetch first.

```json
"order_policy": {
  "first_paint": ["index.html", "css/all.css", "js/app.js"],
  "prefetch": ["img/banner.png"],
  "feed_order": "newest-first"
}
```

| Key | Meaning |
| --- | --- |
| `first_paint` | Paths fetched first, before everything else. List what the page needs to render. |
| `prefetch` | Paths fetched last, in the background. |
| `feed_order` | How feed records stream in: `newest-first`, `oldest-first`, `pinned-first` or `custom`. Only `oldest-first` changes scheduling today; the other values schedule newest first. |

Entries in `first_paint` and `prefetch` are exact file paths, not patterns. When the field is absent, the node orders by file type: markup, styles, scripts, JSON, images and fonts first; video, audio, archives and documents last. Once you declare a policy, paths you leave out all share one middle tier, so list everything the first render needs.

### distribution

Declares how much of the xite a visiting node should keep.

```json
"distribution": {
  "default": {"unit": "package", "retention": "complete"},
  "paths": {
    "data/users/": {"unit": "feed", "retention": "complete"},
    "media/":      {"unit": "file-refs", "retention": "partial"}
  }
}
```

`unit` is `package` (an indivisible app or site), `file-refs` (large files fetched individually) or `feed` (a stream of records). `retention` is `complete` (download and reseed all of it) or `partial` (keep only what was viewed). The rule with the longest matching path prefix wins, then `default`. A path that no rule covers, including every path of a xite without `distribution`, is treated as `package` with `complete` retention. Completing a large xite in the background still asks the visitor first when it would exceed their size limit. See [Files](files.md) and [EDX content distribution](../internals/edx.md).

### feeds, pool, evx

Feature sections owned by other guides:

| Field | Purpose | Guide |
| --- | --- | --- |
| `feeds` | Feed descriptors for the node's feed and search engine. | [Feeds, notifications and search](feeds-search.md) |
| `pool` | Declares directories that hold anonymous channel message pools. No signed file may live under a pool directory. | [Messaging](messaging.md) |
| `evx` | Declares sandboxed WebAssembly programs and jobs. | [EVX](evx.md) |

### settings and other custom fields

The node does not interpret `settings`. Official xites use it for owner-controlled application configuration, read by the page from `siteInfo().content.settings`. Because it is in the root manifest, only the owner can change it.

## includes

`includes` delegates a directory to its own manifest. Each key is the path of a child `content.json`, relative to this manifest, and each value is the set of rules that child must satisfy.

```json
"includes": {
  "data/news/content.json": {
    "signers": ["epix1editoraddress000000000000000000000000000", "alice.epix"],
    "files_allowed": ".*\\.(json|png|jpg)",
    "max_size": 5000000,
    "includes_allowed": false
  }
}
```

| Rule | Meaning |
| --- | --- |
| `signers` | Addresses, or xID names such as `alice.epix`, that may sign the child. A name resolves to the addresses linked to it on chain. The xite's own address is always a valid signer. |
| `signers_required` | Accepted for compatibility. One valid signature is always sufficient. |
| `max_size` | Maximum total in bytes of the child manifest plus all files in its `files`. |
| `max_size_optional` | Maximum total in bytes of its `files_optional`. |
| `files_allowed` | Regular expression every path in the child's `files` must match in full. |
| `files_allowed_optional` | The same for `files_optional`. |
| `includes_allowed` | When `false`, the child may not declare `includes` of its own. |
| `merge_files` | Names the merge files the child may declare in `files_merged`. See [Files](files.md). |
| `max_items` | Caps array lengths in the child's `data.json` files, for example `{"comment": 100}`. |

`files_allowed` uses a different matcher from `ignore`: the whole path must match, and lookahead is not available.

Use `includes` to let co-editors or automated tools publish part of a xite without holding the owner key, and to keep fast-changing data out of the root manifest so small updates stay small.

## user_contents

`user_contents` appears in a child manifest (by convention `data/users/content.json`) and turns its subdirectories into per-user spaces: each user signs a manifest in a directory named after them, within limits the owner sets.

```json title="data/users/content.json"
{
 "address": "epix1examplexiteaddress0000000000000000000000",
 "files": {},
 "ignore": ".",
 "inner_path": "data/users/content.json",
 "modified": 1786156535,
 "signs": {"epix1examplexiteaddress0000000000000000000000": "HMPz...ew="},
 "user_contents": {
  "cert_signers": {"xid.epix": ["chain"]},
  "permission_rules": {
   ".*": {
    "files_allowed": "data.json",
    "max_size": 200000,
    "signers": ["alice.epix"]
   }
  },
  "permissions": {}
 }
}
```

| Key | Meaning |
| --- | --- |
| `cert_signers` | Which identity providers are accepted. `{"xid.epix": ["chain"]}` accepts xID identities verified against Epix Chain. |
| `permission_rules` | Rules applied to users whose identity matches the key, a regular expression tested from the start of `<auth type>/<user id>`. The rule keys are the same as for `includes`. Where several rules match, larger numbers and longer strings win and lists are combined. |
| `permissions` | Per-user rules, keyed by user directory name or user id. They are the starting point that matching `permission_rules` merge into, so they can raise a limit but not lower one. `false` bans the user. |
| `archived`, `archived_before` | Retire old user content. `archived` maps a user directory name to a time and `archived_before` is one time for all users; a user manifest modified at or before that time is no longer accepted. |

A user manifest also carries `cert_user_id`, `cert_auth_type` and `cert_sign`, which tie the signature to the user's identity. User manifests may not declare `includes`. The complete guide, including size limits and moderation, is [User content](user-content.md).

## Delegated signers on the root

Verification supports a root `signers` list. When the list of valid signers has more than one entry, the manifest must also contain `signers_sign`, the owner's signature over that list, which proves the owner authorized the delegates.

The node's own signing commands sign the root manifest only with the xite's key and do not produce `signers_sign`, so this is not a workflow the node offers today. To share publishing duties, delegate directories with [`includes`](#includes) instead. See [Working with more than one signer](publishing.md#working-with-more-than-one-signer).

## Fields the current node does not read

You will meet these in xites that were first written for the archived Python implementation. They are harmless, and they stay in the signed manifest, but the node does not act on them.

| Field | Note |
| --- | --- |
| `translate` | Listed files were translated by the old node when serving. Translation is now done in the page; see [Translating a xite](i18n.md). |
| `default_page` | Not read. The entry page is `index.html`. |
| `sign` | Old single-signature field. Removed at the next sign; a manifest that has only `sign` is rejected. |
| `signers_sign` on a xite without `signers` | Left over from older signers. Not checked. |

## Limits

| Limit | Value |
| --- | --- |
| Root `content.json` size | Must not exceed the visitor's size limit for the xite. |
| Default xite size limit | 1000 MB per xite, raised by the visitor when a xite outgrows it. |
| Bundled file size | Files under 128 KiB are bundled. |
| Files in one signing pass | 100,000 directory entries. |

## Editing checklist

1. Edit only the fields in the "You write" group.
2. Keep the file valid JSON. Remember that a backslash in a regular expression is written `\\` in JSON.
3. Sign: **Sign and publish** in the sidebar, or `epix-server siteSign <address>`.
4. Check the result with `epix-server siteVerify <address>` if you want confirmation that every listed file matches.

Next: [Publishing](publishing.md) covers signing and distribution, and [Database](database.md) covers the data files the manifest protects.
