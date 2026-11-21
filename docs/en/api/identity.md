---
description: Reference for the EpixFrame identity and cryptography commands. Choose and link xID identities, resolve xID names, store per-user settings, encrypt and sign with the visitor's keys, mute authors on this node, and read the Epix Chain randomness beacon.
---

# Identity and crypto commands

These commands work with the visitor's identity and keys: open the xID identity picker, list and select linked identities, link a new one, resolve xID names, keep private per-user settings, encrypt and decrypt, sign and verify, mute authors on this node, and read the random beacon that Epix Chain produces in every block. This page documents every such command for xite developers. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first. For the concepts, see [User content](../build/user-content.md) and [xID for developers](../web3/xid.md).

An xID is a name registered on Epix Chain, such as `alice.epix`. An identity is an xID name together with an auth address: the `epix1...` address of a key that the chain links to that name and that signs the user's content. See the [glossary](../reference/glossary.md) for other terms.

## How these commands behave

- **The identity is chosen per xite.** The node keeps the identities the person has linked. One of them can be the node-wide default. Each xite either inherits the default, uses an identity chosen for that xite, or browses anonymously. Commands that sign with the user's key use the identity in effect for the page's own xite. The encryption commands use a separate key per xite that this node derives. See [Identity: xID names and auth addresses](../build/user-content.md#identity-xid-names-and-auth-addresses).
- **Keys stay in the node.** Commands that sign or decrypt with the visitor's keys do the work inside the node and return only the result. The page never receives the visitor's private keys.
- **Identity changes are announced.** When the identity in effect for a xite changes, the node pushes a `setSiteInfo` event whose `event` field is `["cert_changed", <cert_user_id or null>]`. See [The setSiteInfo event](xite.md#the-setsiteinfo-event).
- **Two kinds of failure.** Some failures are command errors. Others arrive as a normal result that is an object with an `error` field, for example a name that is not on chain or a beacon the chain cannot supply. In EpixFrame's promise style both reject, so wrap calls in `try` and `catch`.
- **Chain lookups take time.** The xID and beacon commands ask Epix Chain over the network, so they can be slow or fail when the chain endpoint is unreachable. The node caches verified xID answers. Beacon commands are not cached between calls.
- **Gateways are read-only.** On a public gateway (a node in restricted mode), `identitySelect` and `identityLinkComplete` answer `This node is a read-only gateway; changes are disabled here` unless the gateway itself owns the xite.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance.

## Choosing an identity

### certXid

Opens the node's xID account picker for the page's xite and applies the visitor's choice. With a name, it selects or links that identity directly, without a dialog. This is the usual way to ask a visitor to sign in before they post.

**Permission:** none. Without a name, the visitor chooses in a node dialog.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xid_name` | string | no | An xID name such as `alice` or `alice.epix` (position 0, or a bare string). When set, the node skips the picker. |

**Returns:** `"ok"`, `"Not changed"`, or an object with an `error` field.

```js
async function requireIdentity() {
  var info = await epixFrame.siteInfo();
  if (info.cert_user_id) return info;

  try {
    await epixFrame.certSelect();            // sends certXid
  } catch (result) {
    console.log("Identity not linked:", result.error);
    return null;
  }
  info = await epixFrame.siteInfo();
  return info.cert_user_id ? info : null;    // null if the visitor chose None
}
```

The picker lists:

- **None**, which makes the visitor browse this xite anonymously.
- Every identity already held on this node, with the current and default ones marked.
- Names the chain links to one of the person's addresses that this node has not recorded yet, offered as "link".
- **New**, a link into the xID manager xite to register or link a new name. It navigates away from your xite.

What the answer means:

- `"ok"`: the visitor picked an entry and the node applied it. That includes **None**, so `"ok"` does not prove that an identity is now selected. Read `siteInfo` again, as in the example.
- `"Not changed"`: no choice arrived. The node waits up to 180 seconds for the dialog, so this answer can take that long.
- An `error` object: picking a "link" entry failed, for example `{"error": "identity_not_linked", "auth_address": "epix1..."}`.

Notes:

- Before the dialog opens, the node asks the chain which names are linked to the person's addresses. That lookup is limited to 8 seconds. If the chain does not answer in time, the picker opens with the local choices only.
- With `xid_name`, a held identity of that name is selected and the answer is `"ok"`. Otherwise the node looks for the name among those the chain links to the person's addresses and links it. If none matches: `{"error": "xID name '<name>.epix' is not linked to any of your addresses"}`.
- The EpixFrame helper `epixFrame.certSelect()` sends `certXid` with no parameters. It does not send the legacy [`certSelect`](#certselect) command.

### identityList

Returns the identities linked on this node, and which one the page's xite uses. Use it to build your own identity picker.

**Permission:** none

No parameters.

**Returns:** an object.

| Field | Type | Meaning |
| --- | --- | --- |
| `identities` | array | One object per linked identity, in link order. See the next table. |
| `selected` | string or null | The auth address in effect for this xite, or `null` when it is browsed anonymously. |
| `default` | string or null | The auth address of the node-wide default identity, or `null`. |
| `scope` | string | `"inherit"` (the default applies), `"xite"` (an identity chosen for this xite) or `"none"` (explicitly anonymous here). |
| `unlinked` | array of strings | Identity addresses this node has created that are not linked to a name yet. |

Each entry of `identities`:

| Field | Type | Meaning |
| --- | --- | --- |
| `xid` | string | The full name, for example `alice.epix`. |
| `name`, `tld` | string | The bare name and the top-level part, for example `alice` and `epix`. |
| `auth_address` | string | The identity's `epix1` address. |
| `directory` | string | The user directory name to write under, the same as `xid`. |
| `cert_user_id` | string | The label written into user manifests, for example `alice@xid.epix`. |
| `selected` | boolean | Whether this identity is in effect for this xite. |
| `default` | boolean | Whether this is the node-wide default. |
| `linked_at` | number or null | Unix time when this node recorded the identity. |

```js
var list = await epixFrame.cmd("identityList");
list.identities.forEach(function (row) {
  console.log(row.xid + (row.selected ? " (in use here)" : "") + (row.default ? " (default)" : ""));
});
```

The same rows appear in `siteInfo().identities`. See [siteInfo](xite.md#siteinfo).

### identitySelect

Chooses which held identity the page's xite acts as.

**Permission:** none. Refused on a public gateway unless the gateway owns the xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string or null | no | The auth address of a held identity (position 0). `""` browses this xite anonymously. `null` or a missing value makes the xite inherit the node-wide default again. |

**Returns:** `"ok"` when the choice changed, `"Not changed"` when it was already in effect.

```js
// Epix Mail switches the inbox this way.
await epixFrame.cmd("identitySelect", { auth_address: row.auth_address });

// Browse this xite anonymously:
await epixFrame.cmd("identitySelect", { auth_address: "" });
```

Notes:

- The choice is stored for this xite only. It does not change the default or other xites. Changing the default is [`identitySetDefault`](admin.md#identitysetdefault), an `ADMIN` command.
- A bare string is read as `auth_address`. On EpixNet v0.6.8 a bare string is not read, so it counts as a missing value and the xite goes back to inheriting the default; send an object or an array if your xite must work there.
- An address that is not a held identity is an error: `unknown identity <address>`. A value that is neither a string nor `null`: `identitySelect: auth_address must be a string or null`.
- A change pushes the `cert_changed` event described at the top of this page.

### identityDiscover

Asks the chain which xID names are linked to any address this node's user holds, including names this node has not recorded as identities.

**Permission:** none

No parameters.

**Returns:** an array of objects, one per address the chain links to a name.

| Field | Type | Meaning |
| --- | --- | --- |
| `name`, `tld` | string | The linked name, for example `alice` and `epix`. |
| `auth_address` | string | The user's address that is linked. |
| `active` | boolean | `false` when the link has been revoked on chain. |
| `held_locally` | boolean | Whether the address is already a linked identity on this node. |

```js
var found = await epixFrame.cmd("identityDiscover");
var notYetHere = found.filter(function (d) { return d.active && !d.held_locally; });
// Offer to link these with certXid, passing the name.
```

The node checks each address in turn: the master address, every identity address it has created and every held identity. The command has no time limit of its own, so it can be slow when the chain is slow. An address that is not linked, or that cannot be looked up, is left out.

## Linking a new identity

Linking makes an address of this node an identity of an xID name. The owner of the name confirms the link with a chain transaction in the xID manager xite. For the user's side, see [Link your node identity](../start/xid.md#link-your-node-identity).

The usual sequence:

1. The page calls [`identityLinkStart`](#identitylinkstart) and sends the visitor to the returned URL.
2. The xID manager sends the linking transaction, then calls [`xidInvalidateCache`](#xidinvalidatecache) for the address.
3. The node sees the address it is waiting for, verifies the link on chain and records the identity. The page does not need to call [`identityLinkComplete`](#identitylinkcomplete) itself.

### identityLinkStart

Picks an identity address for a new link, creating one when no spare address exists, and returns the xID manager URL that links it on chain and returns to your xite.

**Permission:** none

No parameters.

**Returns:** `{"auth_address": string, "url": string}`. The URL has the form `/<xID manager address>/?linkIdentity=<auth_address>&returnTo=/<your xite address>`.

```js
var link = await epixFrame.cmd("identityLinkStart");
// Leave this xite for the xID manager, in the same tab.
epixFrame.cmd("wrapperOpenWindow", [link.url, "_top"]);
```

Notes:

- The node skips addresses the chain already links to a name. That check is limited to 8 seconds.
- The node remembers one link in progress at a time. Starting another link, or opening the `certXid` picker, replaces it. `xidInvalidateCache` completes a link in progress only within 30 minutes of its start.

### identityLinkComplete

Records an identity once the chain lists the address as an active linked identity of the name, and selects it for the page's xite.

**Permission:** none. The node must hold the private key of the address. Refused on a public gateway unless the gateway owns the xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | yes | The address to record (position 0, or a bare string). On EpixNet v0.6.8 a bare string is also read as `name` and the call fails, so send an array or an object there. |
| `name` | string | no | The xID name, such as `alice.epix` (position 1). Without it, the node asks the chain which name the address is linked to. Without a top-level part, `epix` is assumed. |

**Returns:**

| Result | When |
| --- | --- |
| `{"xid": "alice.epix", "auth_address": "epix1...", "cert_user_id": "alice@xid.epix", "added": true}` | The link is verified and recorded. `added` is `false` when the identity was already held and was updated. |
| `{"error": "identity_not_linked", "auth_address": "epix1..."}` | The chain does not list the address as an active identity of the name. |
| `{"error": "xID name '<name>' not found on chain"}` | The name does not exist. |

```js
try {
  var linked = await epixFrame.cmd("identityLinkComplete", { auth_address: address });
  console.log("Linked as " + linked.xid);
} catch (result) {
  if (result.error === "identity_not_linked") console.log("Not linked yet, try again shortly");
}
```

Notes:

- On success the node also shows the notification "xID linked: `<name>@xid.epix`". When the node has no default identity yet, the new one becomes the default.
- When the name is known but the chain does not list the address, the node first asks the visitor, in a dialog, whether to open the xID manager to link it. It waits up to 120 seconds for an answer before it returns `identity_not_linked`.
- Errors: `identityLinkComplete: auth_address required`, `No private key for the linked identity` (the address does not belong to this node), `Invalid xID name`, and an error starting with `resolve` when the chain cannot be asked.
- When the xID manager reports a finished link to the wrapper, the wrapper sends this command itself.

### xidInvalidateCache

Drops the node's cached lookup for one address, so the next [`xidResolve`](#xidresolve) asks the chain. When the address is the link this node started with `identityLinkStart` or the picker, the node also completes that link in the background.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | The `epix1` address (position 0, or the `address` or `peer_address` key). |

**Returns:** `"ok"`. Completing a pending link happens after the answer, so check for the identity with `identityList` or `xidResolve`.

```js
// As the xID manager does right after a linking transaction:
await epixFrame.cmd("xidInvalidateCache", { address: peerAddress });
var info = await epixFrame.xidResolve(peerAddress);
```

To clear every xID cache at once there is [`xidClearCache`](admin.md#xidclearcache), an `ADMIN` command.

## Legacy certificate commands

Before xID, identities were certificates issued by a provider. These commands remain so that older xites keep working. New code should use `certXid` and the `identity*` commands.

### certSelect

Legacy entry point to the identity picker. When the accepted domains allow xID identities, it opens the same picker as [`certXid`](#certxid). It always answers with the identities as legacy certificate rows.

**Permission:** none

Parameters are read from the object form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `accepted_domains` | array of strings | no | Certificate domains the xite accepts. The picker opens only when the list is empty or contains `"xid.epix"`, or when `accept_any` is true. |
| `accept_any` | boolean | no | Open the picker whatever the domains. Default: `true` when `accepted_domains` is empty or absent, otherwise `false`. |

**Returns:** an array with one row per linked identity: `{"auth_address", "auth_type": "xid", "auth_user_name", "domain": "xid.epix", "selected"}`, where `auth_user_name` is the name without `.epix`.

```js
var rows = await epixFrame.cmd("certSelect", { accepted_domains: ["xid.epix"] });
var current = rows.filter(function (r) { return r.selected; })[0];
```

Notes:

- The answer comes after the picker closes, so it can take up to 180 seconds, as for `certXid`.
- `epixFrame.certSelect()` sends `certXid`, not this command.
- The related legacy commands [`certList`](admin.md#certlist) and [`certSet`](admin.md#certset) need `ADMIN`.

### certAdd

Deprecated. Provider-issued certificates no longer exist, so the command always fails.

**Permission:** none

No parameters are read.

**Returns:** always the error `certAdd is not supported: link an xID identity instead (identityLinkComplete)`.

```js
epixFrame.cmd("certAdd", {}).catch(function (result) {
  console.log(result.error);   // use certXid instead
});
```

### badCert

Marks a certificate signature as bad. From then on the node rejects any incoming user `content.json` whose `cert_sign` field equals that value.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `sign` | string | yes | The `cert_sign` value to reject (position 0). |

**Returns:** `"ok"`.

```js
await epixFrame.cmd("badCert", { sign: manifest.cert_sign });
```

Notes:

- The mark applies to the whole node, not only to your xite.
- It is kept in memory only and is forgotten when the node restarts.
- It affects updates that arrive from peers after the call. Content already stored stays.
- A missing `sign` is an error: `Missing sign`.
- For lasting moderation that every node applies, use the owner's rules instead. See [Moderation](../build/user-content.md#moderation).

## Resolving xID names

These commands read xID records through the node, which verifies the answers against the chain before using them. For the data model, caching and the other ways to read xID, see [xID for developers](../web3/xid.md).

### xidResolve

Reverse-resolves an identity address to the xID name it is linked to. A dotted value, such as a user directory name `alice.epix`, is resolved forward instead.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | An `epix1` identity address or a dotted name (position 0, or the `address` or `peer_address` key). |

**Returns:** `null` when nothing is registered or linked. Otherwise:

| Field | Type | Meaning |
| --- | --- | --- |
| `name`, `tld` | string | The name, for example `alice` and `epix`. |
| `owner` | string | The chain account that owns the name, as an `epix1` address. |
| `active` | boolean | For a reverse lookup, `false` when the queried identity has been revoked. Always `true` for a forward lookup. |
| `revoked_at`, `revoked_at_time` | number | Block height and Unix time of the revocation, `0` when not revoked or for a forward lookup. |
| `avatar`, `bio` | string | The profile, `""` when unset. |

```js
var info = await epixFrame.xidResolve("alice.epix");
if (info) {
  label.textContent = info.name + "." + info.tld;
}
```

Notes:

- When the queried address belongs to this node's user but is not linked itself, the node tries the user's other addresses and returns the first name it finds. The record then belongs to a different address of the same user.
- A lookup that fails because the chain cannot be reached also returns `null`.
- A missing address is an error: `xidResolve: address required`.

### xidResolveIdentity

Alias of [`xidResolve`](#xidresolve), registered under the name some xites call. Same parameters and result.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | yes | Position 0, or the `address` or `peer_address` key. |

**Returns:** as for `xidResolve`.

```js
var info = await epixFrame.xidResolveIdentity("epix1...");
```

### xidResolveBatch

Resolves up to 50 addresses or dotted names in one call. Use it for lists, such as all the authors on a page.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addresses` | array of strings | yes | Addresses and dotted names to resolve, inside the array form (`[[...]]`) or under the `addresses` key. |

**Returns:** an object keyed by each value you passed. Each value is a record shaped as for [`xidResolve`](#xidresolve), or `null`.

```js
var authors = ["alice.epix", "bob.epix", "epix1..."];
var byKey = await epixFrame.xidResolveBatch(authors);
authors.forEach(function (key) {
  var info = byKey[key];
  console.log(key, info ? info.bio : "(not registered)");
});
```

Notes:

- Only the first 50 entries are read. Entries that are not strings are skipped.
- The node runs up to eight lookups at a time.
- Unlike `xidResolve`, an unlinked address of the user's own is not replaced by the user's other addresses.
- `epixFrame.xidResolveBatch(list)` sends `{addresses: list}`. With `cmd`, wrap the list: `epixFrame.cmd("xidResolveBatch", [list])`. A flat array is an error: `xidResolveBatch: addresses must be a list`.

### xidResolveName

Returns the full verified record of one name: owner, linked identities and DNS records.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The name, with or without the top-level part, such as `alice` or `alice.epix` (position 0, or the `name` or `xid_name` key). |
| `tld` | string | no | The top-level part (position 1). Without it, the part after the last dot of `name` is used, and `epix` when there is none. |

**Returns:** an object, or `{"error": "..."}` when the name cannot be resolved.

| Field | Type | Meaning |
| --- | --- | --- |
| `name`, `tld`, `owner` | string | The name and its owner account (`epix1...`). |
| `content_root` | string | The hash the chain computes over the active linked identities. |
| `identities` | array | `{address, label, active, revoked_at, revoked_at_time}` per linked identity. |
| `dns_records` | array | `{record_type, value}` per record. Type `65280` (`EPIXNET`) holds a xite address. |
| `avatar`, `bio` | string | The profile, `""` when unset. |

```js
try {
  var record = await epixFrame.xidResolveName("alice.epix");
  var xite = record.dns_records.filter(function (r) { return r.record_type === 65280; })[0];
  if (xite) console.log("alice.epix points at " + xite.value);
} catch (result) {
  console.log("Not resolved:", result.error);
}
```

Notes:

- A label that looks like an `epix1` address with a bad checksum is not resolved as a name: `{"error": "<name>.epix looks like a mistyped epix1 address (bad checksum)"}`.
- A missing name is an error: `xidResolveName: name required`.

## Per-user settings

The node keeps a private settings object per xite for the local user. It is stored with the user's data on this node, is never published and is not part of the xite's files. It suits read markers, preferences and similar state that should survive a browser change on the same node. For storage kept in the browser instead, see [`wrapperSetLocalStorage`](wrapper.md#wrappersetlocalstorage).

### userGetSettings

Returns the stored settings object of the page's xite.

**Permission:** none

No parameters.

**Returns:** an object. `{}` when nothing was stored.

```js
var settings = await epixFrame.cmd("userGetSettings");
var prefs = settings.my_app || {};
```

### userSetSettings

Replaces the stored settings object of the page's xite.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `settings` | object | yes | The complete new settings object (position 0, or the `settings` key). An object without a `settings` key, sent as the whole parameter, is also stored as is. |

**Returns:** `"ok"`.

```js
// Read, change, write back: the call replaces the whole object.
var settings = await epixFrame.cmd("userGetSettings");
settings.my_app = Object.assign(settings.my_app || {}, { last_seen: Date.now() });
await epixFrame.cmd("userSetSettings", [settings]);
```

Notes:

- The object replaces what was stored. Keys you leave out are deleted. Epix Talk keeps its data under one key (`epix_talk`) and always reads before it writes.
- A value that is not an object is stored as `{}`.
- The settings belong to the xite on this node, not to an identity. Switching identities does not switch settings.

### userGetGlobalSettings

Returns the user's node-wide settings object, which the Dashboard uses for interface settings such as the theme.

**Permission:** none

No parameters.

**Returns:** an object. The node may keep internal values in it, so read only the keys you know.

```js
var global = await epixFrame.cmd("userGetGlobalSettings");
console.log(global.use_system_theme);
```

Writing it is [`userSetGlobalSettings`](admin.md#usersetglobalsettings), an `ADMIN` command.

## Encryption

The node offers two building blocks, compatible with the archived Python implementation:

- **ECIES** on secp256k1: encrypt to a public key, decrypt with the matching private key. Each blob is AES-256-CBC encrypted and authenticated with HMAC-SHA256.
- **AES-256-CBC** with PKCS#7 padding and a key you manage. These commands do not authenticate the ciphertext.

Every value travels as base64. Decryption that fails answers `null` for that item instead of an error.

!!! warning "Encryption is not anonymity"
    Encrypted content you publish can be copied by anyone who has the xite, and it stays where it was replicated. Only the text is hidden. Who wrote it, when, for which xite, and its size remain visible.

### userPublickey

Returns the visitor's encryption public key for the page's xite. Other users encrypt to this key with [`eciesEncrypt`](#eciesencrypt), and the visitor decrypts with [`eciesDecrypt`](#eciesdecrypt).

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `index` | number | no | Which of the user's keys for this xite (position 0, or a bare number). Default `0`. |

**Returns:** the public key as base64 of the 33-byte compressed SEC1 form.

```js
var publicKey = await epixFrame.getPublicKey(0);
// Publish it, for example in the user's data.json, so others can encrypt to it.
```

Notes:

- The key is derived from this node's master seed and the xite address. It is not the xID identity key. The same person on another node, even with the same xID name, has a different encryption key.
- The key differs depending on whether an identity is selected for the xite. Content encrypted to the key used while browsing anonymously does not decrypt with the key used after selecting an identity, and the other way around.

### eciesEncrypt

Encrypts text to a public key.

**Permission:** none

Parameters are read from the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | yes | The text to encrypt (position 0). |
| `publickey` | string or number | no | A base64 SEC1 public key, compressed or uncompressed (position 1). A number, or a missing value, means the user's own key for this xite with that index. Default `0`. |
| `return_aes_key` | boolean | no | Also return the AES key used for this blob (position 2). Default `false`. |

**Returns:** the encrypted blob as base64. With `return_aes_key`, an array `[blob, aes_key]`, both base64.

```js
// Encrypt to another user's published key.
var blob = await epixFrame.encrypt("See you at 8", recipientPublicKey);

// Encrypt to yourself (key index 0).
var mine = await epixFrame.encrypt("Draft notes");
```

Errors: `eciesEncrypt: text required`, `eciesEncrypt: bad public key` (not base64), and an error from the key parser when the bytes are not a valid public key.

### eciesDecrypt

Decrypts one blob or a list of blobs with the user's own key for the page's xite, or with a private key you pass.

**Permission:** none

Parameters are read from the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `param` | string or array of strings | yes | One base64 blob, or a list of them (position 0). |
| `privatekey` | string or number | no | A private key (64 hex characters or WIF), or the index of the user's own key for this xite (position 1). Default `0`. |

**Returns:** for one blob, the text or `null`. For a list, an array of text or `null` in the same order. List entries that are not strings are dropped, so the result can be shorter than the list.

```js
var text = await epixFrame.decrypt(blob);
if (text === null) console.log("Not encrypted to this key");

var many = await epixFrame.cmd("eciesDecrypt", [[blobA, blobB, blobC]]);
```

Errors: `eciesDecrypt: param required`, and `eciesDecrypt: invalid param` when the first parameter is neither a string nor a list.

### aesEncrypt

Encrypts text with AES-256-CBC, using a key you pass or a new random key.

**Permission:** none

Parameters are read from the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `text` | string | no | The text to encrypt (position 0). Default: empty. |
| `key` | string | no | A base64 AES-256 key, 32 bytes (position 1). Without it, the node creates a random key. |

**Returns:** an array `[key, iv, ciphertext]`, all base64. A new random 16-byte IV is used for every call.

```js
var parts = await epixFrame.cmd("aesEncrypt", ["Group message"]);
var key = parts[0], iv = parts[1], ciphertext = parts[2];
```

Errors: `aesEncrypt: bad key` when the key is not base64, and an error from the cipher when it is not 32 bytes.

### aesDecrypt

Decrypts AES-256-CBC ciphertext. The batch form tries several keys on several ciphertexts, which helps when a page holds the keys of many groups.

**Permission:** none

Parameters are read from the array form only. There are two forms:

| Form | Parameters | Returns |
| --- | --- | --- |
| Single | `[iv, ciphertext, key]`, three base64 strings | The text, or `null` |
| Batch | `[[[iv, ciphertext], ...], [key, ...]]` | An array with, for each pair, the text from the first key that decrypts it, or `null` |

```js
var text = await epixFrame.cmd("aesDecrypt", [iv, ciphertext, key]);

var texts = await epixFrame.cmd("aesDecrypt", [
  [[iv1, ciphertext1], [iv2, ciphertext2]],
  [groupKeyA, groupKeyB]
]);
```

Notes:

- A key "decrypts" an item when the padding checks out and the result is valid UTF-8. Without a MAC, a wrong key is usually but not always detected this way, and changes to the ciphertext are not detected.
- Errors: `aesDecrypt: expected params array`, `aesDecrypt: iv`, `aesDecrypt: ciphertext` and `aesDecrypt: key` in the single form (a value that is not base64), and `aesDecrypt: encrypted_texts` or `aesDecrypt: keys` when the batch form is malformed.

## Signatures and keys

Signatures use recoverable ECDSA on secp256k1 over the text in Bitcoin "signed message" form (double SHA-256), the same format as the archived Python node. A signature is 65 bytes in base64, 88 characters. An `epix1` address is derived from the public key, so a signature is checked against an address rather than a public key.

### ecdsaSign

Signs text with the page's identity key, or with a private key you pass.

**Permission:** none. Without `privatekey`, an xID identity must be selected for the xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `data` | string | yes | The text to sign (position 0). |
| `privatekey` | string | no | A private key, 64 hex characters or WIF (position 1). Without it, the identity in effect for this xite signs. |

**Returns:** the signature as base64.

```js
// Epix Post signs a hub review with the visitor's identity, then checks it.
var info = await epixFrame.siteInfo();
var message = JSON.stringify(review);
var signature = await epixFrame.sign(message);
var ok = await epixFrame.verify(message, info.auth_address, signature);
```

Notes:

- With no identity selected and no key: `xID required: select or link an identity for this xite`.
- A bare string is read as `data`. On EpixNet v0.6.8 it is read as both `data` and `privatekey` and signing fails, so send an array or an object if your xite must work there.
- Avoid handling private keys in page code. Let the node sign with the identity.
- A missing `data` is an error: `ecdsaSign: data required`.

### ecdsaVerify

Checks that a signature over the text was made by the key of an address.

**Permission:** none

Parameters are read from the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `data` | string | yes | The signed text (position 0). |
| `address` | string | yes | The `epix1` address expected to have signed (position 1). |
| `signature` | string | yes | The base64 signature (position 2). |

**Returns:** `true` or `false`. A malformed signature is `false`, not an error.

```js
var valid = await epixFrame.verify(row.message, row.signer, row.signature);
```

Errors (missing parameters): `ecdsaVerify: expected [data, address, signature]`, `ecdsaVerify: data`, `ecdsaVerify: address`, `ecdsaVerify: signature`.

A valid signature shows who signed. It does not make the content true, safe or lawful.

### eccPrivToPub

Converts a private key to its public key.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `privatekey` | string | yes | 64 hex characters or WIF (position 0, or a bare string). |

**Returns:** the public key as base64 of the 33-byte compressed SEC1 form.

```js
var publicKeyBase64 = await epixFrame.cmd("eccPrivToPub", [privateKey]);
```

Errors: `eccPrivToPub: privatekey` when it is missing, and a parser error for a malformed key.

### eccPubToAddr

Converts a public key to its `epix1` address.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `publickey` | string | yes | A SEC1 public key, compressed or uncompressed, as **hex** (position 0, or a bare string). |

**Returns:** the `epix1` address.

```js
// eccPrivToPub and userPublickey return base64; convert to hex first.
function base64ToHex(b64) {
  return Array.from(atob(b64), function (c) {
    return c.charCodeAt(0).toString(16).padStart(2, "0");
  }).join("");
}
var address = await epixFrame.pubToAddr(base64ToHex(publicKeyBase64));
```

Errors: `eccPubToAddr: publickey` when it is missing, and an error for a value that is not hex or not a valid key.

### recordSign

Signs one record of a signed merge file, such as a post, comment or vote, with the page's identity key. The node sets the record's `author`, derives its `post_id` on creation, and signs the canonical form of the record. Use it for every write to a merge file.

**Permission:** none. An xID identity must be selected for the xite.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `record` | object | yes | The record without `sign` (position 0, or the `record` key). A new record needs either a `key`, or a `nonce` and a `date_added`. |

**Returns:** the record with `author`, `post_id` (when it had none) and `sign` filled in.

```js
var signed = await epixFrame.cmd("recordSign", [{
  nonce: randomNonce(),
  clock: Date.now(),
  supersedes: 0,
  deleted: false,
  date_added: Math.floor(Date.now() / 1000),
  body: "First!"
}]);
// Write it into the user's merge file with fileWrite, then sitePublish.
```

Notes:

- `author` is always the address of the signing key, so a page cannot claim another author.
- A record with a `key` gets a `post_id` derived from the author and the key, so later versions replace earlier ones. Otherwise the `post_id` comes from the author, `nonce` and `date_added`. An edit keeps the `post_id` it already has.
- Errors: `recordSign: record required`, `record must be a JSON object`, `record needs a nonce or a key`, `record needs a date_added`, and the xID error when no identity is selected.
- The full write pattern, including edits, deletes and moderation tombstones, is in [Signed merge files](../build/files.md#signed-merge-files).

## Muting authors

A mute hides an author's content on this node only, by leaving their files out of the local databases of every xite. It changes nothing on other nodes. The node-wide list is read with [`muteList`](admin.md#mutelist), an `ADMIN` command, and is managed on the Dashboard.

### muteAdd

Adds an author to the node-wide mute list and rebuilds the databases so their content drops out of queries.

**Permission:** none, with a condition. Unless the calling xite holds `ADMIN`, the node asks the visitor to confirm in the wrapper ("Remove all content from ...?") and changes the list only when they click **Mute**. Refused on a public gateway.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | yes | Which author to mute (position 0). Despite the name, the official xites pass the user directory name, for example `bob.epix`. See the notes. |
| `cert_user_id` | string | no | A label shown in the mute list and in the confirmation, for example `bob@xid.epix` (position 1). Default: empty. |
| `reason` | string | no | Why, shown in the mute list (position 2). Default: empty. |

**Returns:** `"ok"`, after every database has been rebuilt.

```js
// Like Epix Talk's "Mute this user" menu item. The node shows the
// confirmation; the promise rejects if the visitor does not confirm.
try {
  await epixFrame.muteAdd("bob.epix", "bob@xid.epix", "Topic: Weekly thread");
} catch (err) {
  // err.error is "The mute list was not changed"
}
```

Notes:

- **How matching works.** When the node builds a database, it skips every data file whose path contains the muted value as whole directory names. User files live under `data/users/<directory>/`, and the directory is named after the xID, so pass the directory name. Muting `bob.epix` hides `data/users/bob.epix/` but not `data/users/bigbob.epix/`. A value with several segments, such as `data/blocked/`, matches that run of directories. An empty value mutes nothing. (On EpixNet v0.6.8 the match is plain text, so a short value can hide more than one author.)
- **Files stay.** The author's files remain on disk and are still served and readable with `fileGet`. Only database queries stop returning them.
- **It is node-wide.** The mute applies to every xite on the node, not only the one that called it. Rebuilding every database can take a while on a node with many xites.
- **Confirmation.** A dismissed or unanswered confirmation fails with `The mute list was not changed`. EpixNet v0.6.8 asks for no confirmation, so on that release call it only in response to a clear action by the visitor, and ask first with [`wrapperConfirm`](wrapper.md#wrapperconfirm).
- **Gateways.** On a public gateway the command fails with `muteAdd is disabled on this gateway`, except from the operator socket.
- Mutes apply while the node's ContentFilter plugin is enabled. They stay stored while it is off.
- A missing `auth_address` is an error: `muteAdd: auth_address required`.

### muteRemove

Removes an author from the node-wide mute list and rebuilds the databases so their content returns.

**Permission:** none, with a condition. Unless the calling xite holds `ADMIN`, the node asks the visitor to confirm in the wrapper ("Unmute ...?"). Refused on a public gateway, except from the operator socket.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | yes | The value the author was muted with (position 0). |

**Returns:** `"ok"`, after every database has been rebuilt. Removing a value that was not muted also returns `"ok"`.

```js
await epixFrame.muteRemove("bob.epix");
```

A missing `auth_address` is an error: `muteRemove: auth_address required`. A dismissed confirmation fails with `The mute list was not changed`, and a gateway answers `muteRemove is disabled on this gateway`. EpixNet v0.6.8 asks for no confirmation.

### FilterIncludeList

Compatibility stub for the content filter include lists of the archived Python node. It always returns an empty array.

**Permission:** none

No parameters are read.

**Returns:** `[]`.

```js
var includes = await epixFrame.cmd("FilterIncludeList");   // []
```

### filterIncludeList

Alias of [`FilterIncludeList`](#filterincludelist) with a lowercase first letter. The Dashboard calls it under this name.

**Permission:** none

No parameters are read.

**Returns:** `[]`.

```js
var includes = await epixFrame.cmd("filterIncludeList", { all_sites: true, filters: true });   // []
```

## Chain randomness

Epix Chain stores a random beacon for every block: a 64-character hex value fixed once its block is produced. These commands read beacons through the node and derive values from them. For how the beacon is made, what it can and cannot guarantee, and how to settle outcomes on chain with commit and reveal, read [Verifiable randomness](../web3/contracts.md#verifiable-randomness) first.

!!! warning "Trust and timing"
    The node reads beacons from the chain REST endpoints configured on the node and does not verify them against validator signatures, so a page that uses these commands trusts that endpoint. Never derive an outcome from a beacon that already existed when the user committed. For anything of value, settle it in a contract that reads the VRF precompile.

The chain keeps only a window of recent beacons (a module parameter, 256 blocks by default). Older beacons cannot be read.

### vrfGetBeacon

Returns the beacon of one block.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `height` | number | yes | The block height (position 0, the `height` key, or a bare number). A numeric string also works. EpixNet v0.6.8 does not read a bare number. |

**Returns:** `{"height": number, "beacon": string, "proposer": string, "timestamp": number}`, or `{"error": "..."}`. `proposer` is the consensus address of the block's proposer and `timestamp` the block time in Unix seconds.

```js
try {
  var b = await epixFrame.vrfGetBeacon(123456);
  if (!b.beacon) throw { error: "beacon not available" };
  console.log("Block " + b.height + ": " + b.beacon);
} catch (result) {
  console.log(result.error);
}
```

Notes:

- Treat an `error` result or an empty `beacon` as "not available": the block has not ended yet, or its beacon has been pruned.
- A missing height is an error: `vrfGetBeacon: height required`.

### vrfLatestBeacon

Returns the newest beacon that can be read: the one for the block before the chain's latest block, because a block's beacon is stored only at its end.

**Permission:** none

No parameters.

**Returns:** the same shape as [`vrfGetBeacon`](#vrfgetbeacon), or `{"error": "..."}`.

```js
var latest = await epixFrame.vrfLatestBeacon();
// { height: 123456, beacon: "9f2c...", proposer: "...", timestamp: 1790000000 }
```

Polling faster than the chain produces blocks returns the same beacon again. The VRF Debugger xite refreshes every 6 seconds.

### vrfMultiBlockBeacon

Combines the beacons of several consecutive blocks into one value, so that more than one block proposer contributes.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `end_height` | number | yes | The last block of the window (position 0). |
| `blocks` | number | no | How many blocks, from 1 to 256 (position 1). Default `1`. |

**Returns:** `{"beacon": string}`, the hex SHA-256 of the beacons' hex strings concatenated in block order, or `{"error": "..."}`.

```js
var combined = await epixFrame.vrfMultiBlockBeacon(123456, 25);
var values = await epixFrame.cmd("vrfDeriveRandom", [combined.beacon, "raffle-7", 1]);
```

Notes:

- `end_height` must be at least `blocks`, and every block in the window must still have its beacon. Otherwise the result is an `error` object.
- The node fetches each block's beacon in turn, so a large window takes noticeably longer.
- A missing `end_height` is an error: `vrfMultiBlockBeacon: end_height required`.

### vrfDeriveRandom

Derives deterministic values from a beacon and a seed of your choice. It runs in the node without any network request, and anyone can recompute the result.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `beacon` | string | yes | The beacon value, as the hex string the beacon commands return (position 0, or a bare string, which leaves `seed` empty). On EpixNet v0.6.8 a bare string is also used as the seed. |
| `seed` | string | no | Your application seed (position 1). Default: empty. |
| `count` | number | no | How many values (position 2). Default `1`. |

**Returns:** an array of `count` hex strings of 64 characters, where value `i` is `SHA256(beacon + seed + i)`, hashing the beacon as its hex text and `i` as decimal digits.

```js
var latest = await epixFrame.vrfLatestBeacon();
var values = await epixFrame.cmd("vrfDeriveRandom", [latest.beacon, "draw-2026-11", 3]);
var roll = 1 + Number(BigInt("0x" + values[0]) % 6n);
```

!!! warning "Pass the beacon, not a height"
    The node reads the first argument as the beacon string. Passing a block height fails with `vrfDeriveRandom: beacon required`. Read the beacon first and pass `beacon.beacon`, as in the example. The EpixFrame helper takes the beacon too (`vrfDeriveRandom(beacon, seed, count)`); EpixFrame 1.0.x names that argument `height`, which is misleading.

Notes:

- The node does not cap `count`. Ask only for the values you need.
- To check a result without the node, see the derivation in [Verifiable randomness](../web3/contracts.md#verifiable-randomness).

### vrfInvalidateCache

Compatibility command that does nothing and returns `"ok"`. The node keeps no beacon cache between calls, so there is nothing to clear.

**Permission:** none

No parameters.

**Returns:** `"ok"`.

```js
await epixFrame.vrfInvalidateCache();   // "ok"
```

## Related pages

- [User content](../build/user-content.md): user directories, identities and moderation rules.
- [xID for developers](../web3/xid.md): what xID stores on chain, verified lookups, the precompile.
- [xID for users](../start/xid.md): registering names and linking a node identity.
- [Files and media](../build/files.md#signed-merge-files): the signed merge file pattern behind `recordSign`.
- [Smart contracts from a xite](../web3/contracts.md#verifiable-randomness): randomness, commit and reveal, the VRF precompile.
- [Xite and server commands](xite.md): `siteInfo` and the `setSiteInfo` event.
- [Admin commands](admin.md): `identitySetDefault`, `identityRemove`, `muteList`, `xidClearCache` and the legacy `certList` and `certSet`.
- [How the node verifies xID](../internals/xid-light-client.md): the light client and finality behind verified answers.
