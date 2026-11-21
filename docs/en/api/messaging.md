---
description: Reference for the EpixFrame messaging commands. Channel commands for sealed, rate-limited private messages between xID identities, and local profile commands for signed public rooms and encrypted groups without an xID.
---

# Messaging commands

Messaging commands let a xite (a site published on EpixNet) use the two private messaging systems the node runs on the page's behalf: **channels**, which carry sealed messages between xID identities over an anonymous, rate-limited record pool, and **local profiles**, which give a xite a per-xite signing identity for signed public rooms and small encrypted groups without an xID. This page documents every `channel*` and `localProfile*` command, their parameters, results, errors and the event the node pushes for incoming messages. It is written for xite developers. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first. For the concepts, the privacy properties and when to pick which system, read [Channels and local profiles](../build/messaging.md).

## How these commands behave

### Channel commands

- **A channel grant is required.** The calling xite must hold `CHANNELS` (the whole private inbox, every app) or `Channels:<app>` (only the conversations tagged with `<app>`). The Epix Mail xite passes without a grant and has full scope, and so does a xite that holds `ADMIN`. Without a grant every channel command fails with `channels: this xite has no channel permission`. The visitor grants the permission in the wrapper's prompt after the page calls [`wrapperPermissionAdd`](wrapper.md#wrapperpermissionadd). No permission can be granted on a public gateway.
- **Not on gateways.** On a public gateway every channel command fails with `Channels are unavailable on public gateways`, whatever the page's grants, and the node pushes no `channelEvent` to pages. Only the operator socket can use channels there.
- **App scope.** A `Channels:<app>` client reads, sends and changes only its own app's conversations. Passing a different `app` fails with `channels: this xite is scoped to app <app>`, and touching a conversation of another app fails with `channels: conversation belongs to app <app>`. A full grant reads every app unless it passes `app`, and sends as `mail` unless it passes `app`. An `app` value must be 1 to 32 characters from `a` to `z`, `0` to `9`, `_` and `-`; anything else fails with `channels: invalid app name "<app>"`. A `Channels:<app>` grant follows the same rule, so a grant always names an app the commands accept. (EpixNet v0.6.8 also grants longer names, with uppercase letters or dots, that no command accepts as `app`.)
- **The acting identity.** Each linked xID identity the node holds has its own channel keys and its own inbox. A command acts as the identity the xite currently uses. When the first parameter is an object, it may name another identity the node holds with `auth_address` (the identity's `epix1` address) or `xid` (its name, with or without `.epix`); an identity the node does not hold fails with `unknown identity <value>`. Only a full grant (`CHANNELS`, Epix Mail, `ADMIN` or the operator socket) can switch identities this way. A `Channels:<app>` client acts only as the identity its own xite uses (its selection, else the node default), and naming another one fails with `channels: this xite cannot act as identity <value>`. The parameter tables mark it as **identity selector**.
- **No identity selected.** When the xite is browsed without an identity, read commands answer with empty results, `channelSessionInfo` reports `identity: null`, `channelIdentityStatus` answers `null`, and commands that act as an identity fail with `xID required: select or link an identity for this xite`.
- **Parameter form.** Most channel commands read a positional array, and several read their options only from an object inside that array, as in `[{ app: "talk" }]`. Each table says which form the command reads. With no parameters, EpixFrame sends an empty object, which every command that has only optional parameters accepts.
- **When channels are off.** If the node operator turned channels off with the `channel_enabled` setting, every command fails with `channels are not enabled`. If the `Channel` plugin is disabled, the commands are not registered and answer `null`, like any unknown command.
- **Read state is per node.** Read marks, stars, archives and local deletions change only this node's private index. They are not synchronized to the user's other devices.

### Local profile commands

- **`LOCAL_PROFILE` is required.** Grant it the same way, with `wrapperPermissionAdd("LOCAL_PROFILE")`. Without it, [`localProfileInfo`](#localprofileinfo) answers with `granted: false` and every other command fails with `LOCAL_PROFILE permission required`.
- **One profile per xite and user.** The keys are derived inside the node from the user's master seed and the xite address. A page never sees them. Changing the selected xID does not change the local profile.
- **Parameters are an object.** Every `localProfile*` command takes an object, `{}` when there is nothing to pass. Any other form fails with `Local profile parameters must be an object`. A request larger than 192 KiB fails with `Local profile request exceeds limit`.
- **Not on gateways, not through `as`.** On a public gateway every command, including `localProfileInfo`, fails with `Local profiles are unavailable on public gateways`. The `as` command refuses them with `Local profiles cannot be accessed through as`.
- **User switch.** If the node's user changes while the page is open, commands fail with `Local profile changed; reopen this xite`.
- **Writes are signed user content.** A command that changes state writes the user's `data/users/<author>/data.json`, signs that directory's `content.json` with the local profile key and publishes it. The xite needs owner-signed user content rules that allow this; see [Prepare the xite](../build/messaging.md#prepare-the-xite). The node runs these commands one at a time.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance. EpixFrame has no convenience methods for these commands, so every example calls `epixFrame.cmd`. Called without a callback, `cmd` returns a Promise that rejects when the result carries an `error` field.

## Channel session and events

### channelSessionInfo

Reports whether channels are ready on this node and which identity the page acts as, with its setup state, unread count and outbox state. Call it on page load to decide what to show.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `app` | string | no | Count `unread` in this app only. A scoped client always counts its own app. |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:** an object.

| Field | Type | Meaning |
| --- | --- | --- |
| `enabled` | boolean | Always `true` when the command answers. |
| `xite` | string | Address of the hub xite that holds the pool and the published key bundles. |
| `hub_ready` | boolean | Whether the hub is present on this node with its pool descriptor. |
| `client_xite` | string | Address of the Epix Mail xite. |
| `identity` | object or null | `null` without an identity. Otherwise `auth`, `xid`, `enabled`, `setup` (the [setup object](#channelidentitysetup)), `key_bundle_published`, `unread`, `outbox_pending` and `outbox_error`. |
| `identities` | array | Every identity the node holds, each `{auth, xid, enabled, state, unread}`, where `state` is the setup state and `unread` counts every app. Always empty for a `Channels:<app>` client. |
| `key_bundle_published`, `unread`, `outbox_pending`, `outbox_error` | | Copies of the same fields of `identity`, kept for older clients. `false`, `0`, `0` and `null` without an identity. |

In `identity`:

- `key_bundle_published` is `true` only when this device's key bundle is in the hub, valid, and covered by the identity's signed `content.json`. Keys derived on the node or an unsigned draft do not count.
- `unread` is the number of unread, unarchived conversations, within `app` when one applies.
- `outbox_pending` is the number of sealed records still waiting in the node's outbox, and `outbox_error` the last error of the oldest one, or `null`.

```js
var session = await epixFrame.cmd("channelSessionInfo", [{ app: "talk" }]);
if (!session.identity) {
  showStatus("Select or link an xID to use private messages.");
} else if (!session.identity.key_bundle_published) {
  showStatus("Your message keys are still being published (" + session.identity.setup.state + ").");
} else {
  setUnreadBadge(session.identity.unread);
}
```

### channelSubscribe

Registers the calling xite to receive [`channelEvent`](#the-channelevent-event) messages for the identity it acts as, within its app scope.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `app` | string | no | Receive events of this app only. Default: every app for a full grant, the granted app for a scoped client. |

**Returns:** `{"ok": true, "app": string or null}`, where `app` is the scope the registration uses (`null` means every app).

```js
await epixFrame.cmd("channelSubscribe", [{ app: "talk" }]);
```

Notes:

- The registration is kept per xite in the node's memory. It survives page reloads and is lost when the node restarts, so call it on every page load. A second call from the same xite replaces the first, scope included.
- The Epix Mail xite is registered for every app when the node starts.
- Events reach every open page of the xite, because the wrapper joins the `siteChanged` event channel for you.

### The channelEvent event

The node pushes `channelEvent` to a subscribed xite when something happens in the inbox of the identity that xite acts as. It arrives through `epixFrame.on("request", ...)` with the event object in `message.params`.

An event reaches a xite only when the identity it names is the one the xite currently uses, and, for an event with an `app`, when the xite's scope includes that app.

| `type` | Sent when | Fields |
| --- | --- | --- |
| `new_message` | A message was decrypted and added to the private index. | `identity_id`, `xid`, `auth` (the identity it landed in), `app`, `conv_id`, `from_xid`, `subject`, `snippet`, `unread`, `pending` |
| `setup` | The node published an identity's key bundle into the hub. | `identity_id`, `xid`, `auth`, `state` (`"published"`). No `app`: it concerns every app. |
| `migrated` | Legacy Epix Mail messages were imported into the private index. | `imported`, `identity_id`, `xid`, `auth`, `app` (`"mail"`) |

`pending` greater than zero means earlier messages of the conversation are still arriving out of order.

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd !== "channelEvent") return;
  var event = message.params;
  if (event.type === "new_message" && event.app === "talk") {
    refreshThreads();
  } else if (event.type === "setup") {
    loadSession();
  }
});
```

Treat `subject`, `snippet` and `from_xid` as untrusted text and insert them with `textContent`.

### channelRlnStatus

Reports the admission rule of the hub's pool and, when the pool requires rate limit nullifiers (RLN), how much of today's sending allowance this node has spent. A page uses it to draw a usage bar and a reset countdown. See [Admission](../build/messaging.md#admission-proof-of-work-and-rate-limit-nullifiers) for the concepts.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. Only `member` depends on it. |

**Returns:** for a pool that only requires proof of work, `{"rln_required": false, "retention_weeks": number}`. `retention_weeks` is `0` while the hub's pool descriptor is not available yet. For a pool that requires RLN:

| Field | Type | Meaning |
| --- | --- | --- |
| `rln_required` | boolean | `true`. |
| `member` | boolean | Whether the acting identity is on the pool's roster. `false` without an identity. |
| `unit_limit` | number | Units the node may spend in the current epoch. |
| `units_used` | number | Units already spent. |
| `units_remaining` | number | `unit_limit` minus `units_used`. |
| `epoch` | number | The current epoch: the UTC day, counted in days since the Unix epoch. |
| `resets_in_secs` | number | Seconds until the next epoch starts. |
| `retention_weeks` | number | How many weeks the pool keeps records. |

```js
var status = await epixFrame.cmd("channelRlnStatus", []);
if (status.rln_required) {
  showAllowance(status.units_used, status.unit_limit, status.resets_in_secs);
}
```

The allowance belongs to the node and is shared by every identity it holds. Membership is per identity.

## Keys and recipients

### channelKeyLookup

Reports, for each xID, whether it can receive channel messages: whether it has a usable key bundle in the hub, whether the name is revoked, and how many devices it has. It reads data the node has already synced and sends nothing to the network.

**Permission:** `CHANNELS` or `Channels:<app>`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `xids` | array of strings | yes | The names to check (position 0). `alice` and `alice.epix` are the same name. Entries that are not strings are skipped. |

**Returns:** an object keyed by the normalized name (`alice.epix`), each value `{"has_bundle": boolean, "revoked": boolean, "devices": number}`. `has_bundle` is `true` when the name is not revoked and at least one active device bundle verifies. `devices` counts those bundles.

```js
var lookup = await epixFrame.cmd("channelKeyLookup", [["alice", "bob.epix"]]);
// { "alice.epix": { has_bundle: true, revoked: false, devices: 2 },
//   "bob.epix":   { has_bundle: false, revoked: false, devices: 0 } }
```

A missing or malformed list fails with `channelKeyLookup: [xids] required`.

### channelContacts

Lists the people the acting identity has conversations with.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. |
| `app` | string | no | One app only. A scoped client always sees its own app. |

**Returns:** an array of `{"xid": string}`, sorted by name and without duplicates. Empty without an identity.

```js
var contacts = await epixFrame.cmd("channelContacts", []);
var names = contacts.map(function (c) { return c.xid; });
```

The list is built from the peer of each of the 500 most recent unarchived conversations in the app scope: every app for a full grant unless it passes `app`, and only its own app for a scoped client.

### channelKeyBundlePublish

Builds the acting identity's channel key bundle and asks the node to publish it into the hub. The node already does this automatically for every linked identity, so new code should use [`channelIdentitySetup`](#channelidentitysetup) instead. This command is kept for older Epix Mail clients.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:**

| Field | Type | Meaning |
| --- | --- | --- |
| `ok` | boolean | `true`. |
| `xid` | string | The identity's name. |
| `auth` | string | The identity's `epix1` address. |
| `primary_path` | string | `data/users/<name>/data.json`, the primary bundle slot in the hub. |
| `device_path` | string | `data/users/<name>/data-<auth>.json`, this device's own slot. |
| `bundle` | object | The public key bundle. Treat it as opaque. |

```js
var result = await epixFrame.cmd("channelKeyBundlePublish", []);
```

The command does not write the bundle itself. It queues the node's setup job, which picks the slot and publishes. It fails with `xID required: select or link an identity for this xite` without an identity.

## Sending

### channelSend

Seals a private message for every device of every recipient, solves the pool's admission requirement, stores the records in the node's durable outbox and tries to append them to the pool right away.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `recipients` | array of strings | yes | Recipient names (position 0). Names are normalized (`alice` becomes `alice.epix`), sorted and deduplicated. |
| `subject` | string | no | The subject (position 1). Default: empty. |
| `body` | string | no | The message text (position 2). Default: empty. |
| `conv_id` | string | no | Reply in this conversation: 32 hexadecimal characters, from an earlier send or a thread row. Pass it as a string at position 3, or in the options object. A value that does not decode to 16 bytes is ignored and a new conversation starts. |
| `app` | string | no | In the options object (any position after the body). The app to tag the message with. A scoped client always sends as its own app. Default for a full grant: `mail`. |

**Returns:**

| Field | Type | Meaning |
| --- | --- | --- |
| `ok` | boolean | `true`. |
| `conv_id` | string | The conversation, new or the one you replied in. |
| `recipients` | number | Number of distinct recipients. |
| `envelopes` | number | Number of pool records the send produced. One record carries up to eight device slots. |
| `delivery` | string | `"published"` when the records were appended to the pool, `"queued"` when they wait in the outbox and the node keeps retrying in the background. |

```js
async function sendTalkMessage(recipients, subject, body, convId) {
  var options = { app: "talk" };
  if (convId) options.conv_id = convId;
  var result = await epixFrame.cmd("channelSend", [recipients, subject, body, options]);
  return result.conv_id;
}
```

Notes:

- **Do not resend on `queued`.** Once the command answers, the message is accepted and its encryption state has advanced. A transport failure after that point is reported as `queued`, not as an error, so that a client does not send the same message twice. Neither value means anyone has read the message.
- **It can be slow.** The node computes the pool's proof of work, and with RLN a proof, for each record. Show progress and keep the button disabled until the answer arrives.
- **Operator delays.** When the node sets a send delay (`channel_send_jitter_max_secs`), every send answers `queued`. A send to more than eight devices is split into several records, which the node may space out (`channel_burst_jitter_max_secs`). See [Node settings that affect channels](../build/messaging.md#node-settings-that-affect-channels).
- **Recipients are checked first.** The node reads recipient bundles from the hub only. Check them with [`channelKeyLookup`](#channelkeylookup) while the user types.
- **Size.** A message that does not fit the hub's largest padding bucket is refused. Send a reference to a file published in the xite instead. See [Limits](../build/messaging.md#limits).

Errors include:

| Error | Cause |
| --- | --- |
| `channelSend: [recipients, subject, body, conv_id?]` | The parameters are not an array. |
| `channelSend: at least one recipient required` | `recipients` is missing or has no string. |
| `xID required: select or link an identity for this xite` | No identity selected. |
| `<name> has not published channel keys` | A recipient has no usable bundle in the hub on this node. |
| `<name>'s identity has been revoked` | The chain reports the recipient's name as revoked. |
| `this device's identity for <name> has been revoked` | The sending identity's own address is revoked. |
| `this xite has no pool configured` | The hub's pool descriptor is not available. |
| `epoch allowance exhausted: send needs <n> units, <used>/<limit> already spent` | The RLN allowance for today is spent. |
| `this pool requires RLN but no membership is available` | The pool requires RLN and the node has no admission state. |
| `RLN usage reconciliation is incomplete; channel send was not staged` | The node is still reconciling its usage ledger. Retry later. |
| `channels: this xite is scoped to app <app>` | A scoped client asked for another app. |

## Reading

### channelThreads

Lists the acting identity's conversations, newest activity first.

**Permission:** `CHANNELS` or `Channels:<app>`.

Options are read from an object at position 0 of an array: `[{...}]`. A bare object is not read.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `folder` | string | no | `"all"` (default) lists unarchived conversations, `"starred"` starred unarchived ones, `"archived"` archived ones. Any other value acts as `"all"`. |
| `offset` | number | no | Rows to skip. Default `0`. |
| `limit` | number | no | Maximum rows. Default `50`. |
| `app` | string | no | One app only. A scoped client always sees its own app. |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:** `{"threads": [...]}`, empty without an identity. Each thread row:

| Field | Type | Meaning |
| --- | --- | --- |
| `thread_id` | number | Row id in the private index. |
| `conv_id` | string | The conversation id. Pass it to the other commands. |
| `peer_xid` | string or null | The other participant. |
| `members` | string | Every participant, as a JSON-encoded array in a string. Parse it with `JSON.parse`. |
| `subject`, `snippet` | string | Subject and a short excerpt of the latest message. |
| `last_ms` | number | Time of the latest message, in milliseconds since the Unix epoch. |
| `msg_count` | number | Number of messages. |
| `unread` | number | Greater than `0` when the conversation has unread messages. |
| `starred`, `archived` | number | `1` or `0`. |
| `app` | string | The app the conversation belongs to: the app of its first message. |

```js
var result = await epixFrame.cmd("channelThreads", [{ folder: "all", limit: 50, app: "talk" }]);
result.threads.forEach(function (thread) {
  var members = JSON.parse(thread.members || "[]");
  renderThread(thread.conv_id, thread.subject, members, thread.unread > 0);
});
```

### channelSent

Lists the acting identity's own sent messages across every conversation, newest first.

**Permission:** `CHANNELS` or `Channels:<app>`.

Options are read from an object at position 0 of an array: `[{...}]`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `offset` | number | no | Rows to skip. Default `0`. |
| `limit` | number | no | Maximum rows. Default `50`. |
| `app` | string | no | One app only. A scoped client always sees its own app. |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:** `{"messages": [...]}`, empty without an identity. Each row has `msg_id`, `conv_id`, `subject`, `body`, `sent_ms`, `members` (a JSON-encoded array in a string, as in thread rows), `peer_xid` and `app`.

```js
var sent = await epixFrame.cmd("channelSent", [{ offset: 0, limit: 20, app: "talk" }]);
```

### channelConversation

Returns the messages of one conversation, oldest first.

**Permission:** `CHANNELS` or `Channels:<app>`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `conv_id` | string | yes | The conversation (position 0), as a string or inside an object: `[convId]` or `[{ conv_id: convId }]`. |
| `auth_address` or `xid` | string | no | Identity selector, in the object form. |

**Returns:** `{"messages": [...]}`. Each message row:

| Field | Type | Meaning |
| --- | --- | --- |
| `msg_id` | number | Row id in the private index. |
| `dir` | string | `"in"` for a received message, `"out"` for one this identity sent. |
| `sender_xid` | string | Who sent it. |
| `subject`, `body` | string | The decrypted subject and text. |
| `sent_ms`, `received_ms` | number | When it was sent and when this node indexed it, in milliseconds. |
| `read` | number | `1` or `0`. |

```js
var result = await epixFrame.cmd("channelConversation", [{ conv_id: convId }]);
result.messages.forEach(function (m) {
  var item = document.createElement("li");
  item.textContent = m.sender_xid + ": " + m.body;
  list.appendChild(item);
});
```

Notes:

- The array is required: a bare object fails with `channelConversation: conv_id required`.
- A conversation this identity does not hold answers with an empty list.
- A scoped client gets `channels: conversation belongs to app <app>` for a conversation of another app.

### channelSearch

Searches the subjects and bodies in the acting identity's private index, newest first.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form only.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | yes | What to search for (position 0). |
| `limit` | number | no | Maximum results (position 1). Default `100`. |
| `app` | string | no | In an object at position 2. One app only. A scoped client always searches its own app. |

**Returns:** `{"results": [...]}`, empty without an identity. Each result has `msg_id`, `conv_id`, `dir`, `sender_xid`, `subject`, `sent_ms` and `snippet`.

```js
var found = await epixFrame.cmd("channelSearch", [query, 50, { app: "talk" }]);
```

Notes:

- By default the node uses SQLite full-text search, so `query` follows the SQLite FTS5 query syntax and a malformed query returns an error. `snippet` is an excerpt with the matched terms wrapped in `[` and `]`.
- When the operator enables at-rest encryption of the index (`channel_encrypt_at_rest`), the node instead scans the identity's messages for a case-insensitive substring, and `snippet` is the first 80 characters of the body.
- A missing query fails with `channelSearch: query required`.
- This command takes no identity selector, because its first parameter is the query.

## Conversation state

These commands change only this node's private index. The sealed records in the pool are never changed. Each answers `{"ok": true}`, needs a selected identity, and takes no identity selector.

### channelMarkRead

Marks every message of a conversation read or unread.

**Permission:** `CHANNELS` or `Channels:<app>`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `conv_id` | string | yes | The conversation (position 0). |
| `read` | boolean | no | `true` (default) marks it read, `false` unread (position 1). |

**Returns:** `{"ok": true}`.

```js
await epixFrame.cmd("channelMarkRead", [convId, true]);
```

A missing `conv_id` fails with `channelMarkRead: conv_id required`.

### channelSetConvState

Stars, unstars, archives or unarchives a conversation.

**Permission:** `CHANNELS` or `Channels:<app>`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `conv_id` | string | yes | The conversation (position 0). |
| `starred` | boolean | no | In an object at position 1. Leave it out to keep the current value. |
| `archived` | boolean | no | In an object at position 1. Leave it out to keep the current value. |

**Returns:** `{"ok": true}`.

```js
await epixFrame.cmd("channelSetConvState", [convId, { archived: true }]);
```

Errors: `channelSetConvState: [conv_id, {starred?, archived?}]` when the parameters are not an array, `channelSetConvState: conv_id required`.

### channelDeleteLocal

Deletes a conversation and its messages from this node's private index. Other participants and the user's other devices keep their copies.

**Permission:** `CHANNELS` or `Channels:<app>`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `conv_id` | string | yes | The conversation (position 0). |

**Returns:** `{"ok": true}`.

```js
await epixFrame.cmd("channelDeleteLocal", [convId]);
```

A missing `conv_id` fails with `channelDeleteLocal: conv_id required`.

## Identity setup

The node sets up channels for every linked identity on its own: it derives the keys, publishes the key bundle into the hub, and retries while the hub is not synced or the chain cannot be reached. These commands report and steer that job. The same controls appear in the Identities section of the node's Config page.

### channelIdentitySetup

Runs the setup job for an identity again now. A failed or pending identity starts over. A published one is checked against the hub and republished if its bundle is missing.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. Default: the identity the xite uses. |

**Returns:** the setup object, read right after the job was queued:

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | string | `"keys"` (keys derived, publish due), `"pending"` (waiting or retrying), `"published"`, `"failed"` (stopped until retried) or `"off"` (channels turned off for this identity). |
| `error` | string or null | Why the last attempt did not finish. |
| `attempts` | number | Failed attempts since the last reset. |
| `next_retry_ms` | number | When a pending identity is retried, in milliseconds since the Unix epoch. |
| `published_path` | string or null | The hub file that holds the bundle. |
| `published_ms` | number | When the bundle was last published. |
| `published_peers` | number | How many peers accepted that publish. |

```js
var setup = await epixFrame.cmd("channelIdentitySetup", []);
if (setup.state === "failed") showStatus("Message key setup failed: " + setup.error);
```

The job runs in the background. Watch for the `setup` [`channelEvent`](#the-channelevent-event) or call [`channelSessionInfo`](#channelsessioninfo) again to see the outcome. Without an identity the command fails with `xID required: select or link an identity for this xite`.

### channelIdentitySetEnabled

Turns channels on or off for one identity the node holds. While off, the identity's incoming messages are not indexed, its unread count is not shown, and its bundle is not published again. A bundle already in the hub stays there.

**Permission:** `ADMIN`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` | string | yes | The identity's `epix1` address (position 0, or the `auth_address` key). |
| `enabled` | boolean | yes | `true` to turn channels on, `false` to turn them off (position 1, or the `enabled` key). |

**Returns:** the [setup object](#channelidentitysetup). Its `state` is `"off"` after turning off and `"keys"` after turning on.

```js
var setup = await epixFrame.cmd("channelIdentitySetEnabled", [session.identity.auth, false]);
```

Notes:

- The command acts on any identity the node holds. It is an administration command: a page needs `ADMIN`, and the node's Config page runs it from the operator socket. A channel grant alone is not enough. (On EpixNet v0.6.8 any channel client can run it.)
- Errors: `channelIdentitySetEnabled: auth_address required`, `channelIdentitySetEnabled: enabled (bool) required`, `unknown identity <address>`.

### channelIdentityStatus

Returns the status entry the Config page shows for an identity: a summary, a detail line and the actions that fit its state.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:** `null` without an identity, otherwise:

| Field | Type | Meaning |
| --- | --- | --- |
| `provider` | string | `"channels"`. |
| `state` | string | The setup state, as in the [setup object](#channelidentitysetup). |
| `summary` | string | For example `"channels: published"`. |
| `detail` | string | For `published`, the bundle path and peer count. For `pending` and `failed`, the error. |
| `actions` | array | Each `{cmd, params, label}`: `channelIdentitySetup` ("Retry setup") in the `keys`, `pending` and `failed` states, and always `channelIdentitySetEnabled` ("Turn channels off" or "Turn channels on"), which needs `ADMIN`. |

```js
var status = await epixFrame.cmd("channelIdentityStatus", []);
if (status) {
  statusLine.textContent = status.summary + " (" + status.detail + ")";
}
```

## Legacy mail import

### channelMigrateLegacy

Imports the acting identity's messages from the earlier Epix Mail format (the `data/users/*/messages.json` files of the Epix Mail xite) into the private index. The node also runs this import on its own, once per identity each time it starts; the command repeats it on request, for example from a settings page.

**Permission:** `CHANNELS` or `Channels:<app>`.

Reads the array form `[{...}]` or a bare object.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `auth_address` or `xid` | string | no | Identity selector. |

**Returns:** `{"imported": number, "skipped": number, "scanned": number}`. All three are `0` when the node does not serve the Epix Mail xite or no legacy files are on disk.

```js
var report = await epixFrame.cmd("channelMigrateLegacy", {});
showStatus(report.imported + " older messages imported.");
```

Notes:

- The import is idempotent: messages already imported and records this identity cannot decrypt are skipped. It reads the legacy files and never changes or removes them.
- When at least one message is imported, the node pushes a `migrated` [`channelEvent`](#the-channelevent-event).
- Without an identity the command fails with `xID required: select or link an identity for this xite`.

## Local profile state

### localProfileInfo

Reports whether local profiles can be used on this xite, whether the xite holds `LOCAL_PROFILE`, the user's own profile and the node's limits. It is the only local profile command that answers before the permission is granted, so call it first.

**Permission:** none to read the grant state. The other fields need `LOCAL_PROFILE`.

No parameters. Pass `{}`.

**Returns:**

| Field | Type | Meaning |
| --- | --- | --- |
| `available` | boolean | `true`. |
| `granted` | boolean | Whether the xite holds `LOCAL_PROFILE`. |
| `profile` | object or null | The user's own [profile view](#localprofilecreate), or `null` before the profile exists and always without the grant. |
| `can_link_xid` | boolean | Whether an xID identity is selected for this xite, so [`localProfileLinkXid`](#localprofilelinkxid) can work. `false` without the grant. |
| `limits` | object | The node's limits, listed below. |

| `limits` field | Value | Meaning |
| --- | --- | --- |
| `group_members` | `8` | Members per private group, including the creator. |
| `text_bytes` | `4096` | Longest message text, in UTF-8 bytes. |
| `document_bytes` | `524288` | Largest `data.json` per user (512 KiB). |
| `public_history` | `128` | Public messages kept per user. |
| `private_history` | `32` | Private records kept per user. |
| `list_documents` | `64` | User documents accepted per list. |
| `list_attempts` | `128` | User documents attempted per list. |
| `list_bytes` | `8388608` | Bytes read per list (8 MiB). |
| `record_checks` | `512` | Signature checks per list. |
| `decrypt_attempts` | `256` | Decryption attempts per list. |

```js
async function loadLocalProfile() {
  var info = await epixFrame.cmd("localProfileInfo", {});
  if (info === null) {
    // An unknown command answers null: this node predates local profiles.
    showStatus("Update EpixNet to use this xite.");
    return null;
  }
  return info; // info.granted tells you whether to show the "Create profile" flow
}
```

Read the limits from this result instead of hard-coding them. On a public gateway the command fails with `Local profiles are unavailable on public gateways`.

### localProfileCreate

Creates the user's local profile for this xite, or changes its display name. The node signs the profile, saves it in the user's `data.json` and publishes it.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `display_name` | string | yes | The name to show. At most 80 bytes, not only whitespace, and no control characters other than newline and tab. |

**Returns:** `{"record": profile view, "publish": publish result}`.

The profile view:

| Field | Type | Meaning |
| --- | --- | --- |
| `author` | string | The profile's `epix1` signing address. It is also the user directory name: `data/users/<author>/`. |
| `display_name` | string | The display name. |
| `encryption_key` | string | The public key other members encrypt group messages to. |
| `own` | boolean | Whether this is the current user's profile. |
| `signed_profile` | object | The signed profile record. Treat it as opaque and pass it back unchanged to [`localProfileGroupCreate`](#localprofilegroupcreate). |
| `xid` | object or null | `null` without a link. Otherwise `{"name": string, "status": string}`; see [`localProfileLinkXid`](#localprofilelinkxid). |

The publish result, shared by every command that changes state:

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | string | `"accepted_by_peers"` when at least one peer accepted the signed update, `"local_only"` when it is saved on this node only. |
| `peers` | number | How many peers accepted it. |
| `error` | string | Present when publishing failed: `Peer publication failed; the signed update is saved locally`. |

```js
var result = await epixFrame.cmd("localProfileCreate", { display_name: "Alice" });
console.log(result.record.author, result.publish.status);
```

Notes:

- Renaming keeps the profile's creation time and its xID link.
- Peer acceptance does not mean anyone has read anything, and the node does not keep a delivery queue for these updates: the update reaches other nodes through normal xite synchronization.
- Errors: `Missing display_name`, `Invalid text length or characters`, and `Signed profile update failed; reload and check this xite's user-content rules` when the signed write is refused, most often because the xite's user content rules do not allow it.

## Local profile messages and groups

### localProfilePublicPost

Publishes a signed public message in a room. Anyone who has the xite can read it.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `room` | string | yes | The room name, at most 80 bytes. Rooms are a convention of your xite; the node accepts any name that passes the text rules. |
| `text` | string | yes | The message, at most 4096 UTF-8 bytes. |

Both values must not be only whitespace and may contain no control characters other than newline and tab.

**Returns:** `{"record": public message view, "publish": publish result}`. The public message view has `kind` (`"public"`), `id`, `author`, `display_name`, `room`, `text`, `sent_at` (Unix seconds) and `own`.

```js
var text = input.value;
if (new TextEncoder().encode(text).length > info.limits.text_bytes) {
  throw new Error("Message is too long.");
}
var result = await epixFrame.cmd("localProfilePublicPost", { room: "lobby", text: text });
```

Notes:

- The node keeps the newest 128 public messages per user and removes older ones, and it also drops the oldest records when the document would exceed 512 KiB.
- Errors: `Create a local profile first`, `Missing room`, `Missing text`, `Invalid text length or characters`, and the signed write error described under [`localProfileCreate`](#localprofilecreate).

### localProfileGroupCreate

Creates a private group from profiles that have reached this node, and stores an encrypted invitation that every member can open. Members see the group when they next list.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | The group title, at most 120 bytes. |
| `profiles` | array | yes | The other members, as the `signed_profile` objects from [`localProfileList`](#localprofilelist). Your own profile is added if it is missing. An empty array makes a group of one. |

**Returns:** `{"record": private message view, "publish": publish result}`. The record is the invitation, with `kind` `"invitation"` and an empty `text`. Its `group_id` identifies the new group.

The private message view:

| Field | Type | Meaning |
| --- | --- | --- |
| `group_id` | string | The group id, 64 hexadecimal characters. |
| `title` | string | The group title. |
| `members` | array | The members, as profile views. |
| `own_member` | boolean | `true`. |
| `kind` | string | `"invitation"` or `"message"`. |
| `id` | string | The record id, 64 hexadecimal characters. |
| `author`, `display_name` | string | The sender. |
| `sent_at` | number | Unix seconds. |
| `text` | string | The message. Empty for an invitation. |
| `own` | boolean | Whether the current user sent it. |

```js
var chosen = data.profiles
  .filter(function (p) { return selectedAuthors.indexOf(p.author) !== -1; })
  .map(function (p) { return p.signed_profile; });
var result = await epixFrame.cmd("localProfileGroupCreate", { title: "Weekend trip", profiles: chosen });
var groupId = result.record.group_id;
```

Notes:

- A group has 1 to 8 members, including you. Every member profile must be a valid profile of this xite and appear only once.
- Membership is fixed. To add or remove someone, create a new group.
- Errors: `Create a local profile first`, `Missing group profiles`, `Missing title`, `Invalid group size`, `Group members must be unique and sorted` (a profile appears twice), `Invalid text length or characters`.

### localProfileSeal

Encrypts a message for every member of a group, including you for your own history, and publishes it.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `group_id` | string | yes | A group the user belongs to, from `localProfileList().groups`. |
| `text` | string | yes | The message, at most 4096 UTF-8 bytes. |

**Returns:** `{"record": private message view, "publish": publish result}`, with `kind` `"message"`.

```js
var result = await epixFrame.cmd("localProfileSeal", { group_id: groupId, text: "See you at nine." });
```

Notes:

- The node knows a group only from records it could decrypt during the current read. If it is not found, the error is `Unknown private group`; list again and retry.
- The node keeps the newest 32 private records per user, invitations included.
- Other errors: `Create a local profile first`, `Missing group_id`, `Missing text`, `Invalid text length or characters`, `Private message exceeds the bounded format`.

## Reading and verifying local profile records

### localProfileList

Returns everything the node can verify for this xite: profiles, public messages, the private messages the user can decrypt, and the user's groups.

**Permission:** `LOCAL_PROFILE`.

No parameters. Pass `{}`.

**Returns:**

| Field | Type | Meaning |
| --- | --- | --- |
| `profiles` | array | Profile views, the user's own first when it exists. |
| `public_messages` | array | Public message views, oldest first. |
| `private_messages` | array | Private message views the user can open, oldest first. |
| `groups` | array | `{group_id, title, members, own_member}` for each group seen in those messages, sorted by `group_id`. |
| `truncated` | boolean | `true` when a read limit stopped the list early, so some records are not shown. |
| `rejected` | number | Documents or records that failed verification and were ignored. |

```js
async function refresh() {
  var info = await epixFrame.cmd("localProfileInfo", {});
  if (!info || !info.granted) return;
  var data = await epixFrame.cmd("localProfileList", {});
  render(info, data);
  if (data.truncated) showStatus("Some older messages or profiles are not shown.");
}

epixFrame.on("openWebsocket", refresh);
epixFrame.on("request", function (cmd) {
  if (cmd === "setSiteInfo") refresh();
});
```

Notes:

- **There is no dedicated event.** Other users' updates arrive as ordinary signed files, announced by `setSiteInfo` events (see [Events pushed to the page](xite.md#events-pushed-to-the-page)). The node does not send that event to the connection whose command made the change, so use the result of your own command or list again after it.
- Only files covered by verified, signed manifests count. Unsigned files, changed files and invalid signatures are counted in `rejected` and never shown.
- The node reads at most 128 user documents, accepts at most 64, reads at most 8 MiB, checks at most 512 signatures and attempts at most 256 decryptions per call. When a limit is reached, `truncated` is `true`.
- xID link status is looked up for at most four linked profiles per call. The others report `status: "unknown"`.

### localProfileOpen

Verifies and decrypts one private envelope for the current user. Use it for an envelope your page read itself, for example from a user's `data.json` with `fileGet`.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `envelope` | object | yes | A private record, as stored in a user's `private_messages`. |

**Returns:** the private message view described under [`localProfileGroupCreate`](#localprofilegroupcreate).

```js
var raw = await epixFrame.fileGet("data/users/" + author + "/data.json", { required: false });
var doc = raw ? JSON.parse(raw) : { private_messages: [] };
for (var i = 0; i < doc.private_messages.length; i++) {
  try {
    var message = await epixFrame.cmd("localProfileOpen", { envelope: doc.private_messages[i] });
    console.log(message.title, message.text);
  } catch (result) {
    // "Not a recipient" for envelopes addressed to other people.
  }
}
```

Errors include `Not a recipient` (none of the copies is for this user), `Not a private envelope`, `Invalid local profile signature`, `Invalid local profile scope or size` (a record of another xite or over 192 KiB), `Invalid recipient count` and `Not a group member`.

### localProfileVerify

Verifies one signed record and returns its view: a profile, a public message, or a private envelope, which it also decrypts.

**Permission:** `LOCAL_PROFILE`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `record` | object | yes | A record whose `kind` is `"profile"`, `"public"` or `"private"`. |

**Returns:** the profile view (see [`localProfileCreate`](#localprofilecreate)), the public message view (see [`localProfilePublicPost`](#localprofilepublicpost)) or the private message view (see [`localProfileGroupCreate`](#localprofilegroupcreate)).

```js
try {
  var view = await epixFrame.cmd("localProfileVerify", { record: doc.public_messages[0] });
  console.log(view.display_name + " in " + view.room + ": " + view.text);
} catch (result) {
  console.log("Rejected:", result.error);
}
```

A record of any other kind fails with `Unsupported local profile record`. Verification errors are the same as for [`localProfileOpen`](#localprofileopen).

### localProfileLinkXid

Links the local profile to the xID identity selected for this xite, so other users can see a name next to the profile. The node signs a link record with the identity's key, embeds it in the profile and publishes the profile.

**Permission:** `LOCAL_PROFILE`.

No parameters. Pass `{}`.

**Returns:** `{"record": profile view, "publish": publish result}`. The profile view's `xid` is `{"name": string, "status": string}`.

| `status` | Meaning |
| --- | --- |
| `"verified"` | The chain lookup lists the linking address as an active identity of the name. |
| `"stale"` | The same, but from a cached lookup. |
| `"revoked"` | The linking address is revoked or no longer active for the name. |
| `"unknown"` | No answer within 800 milliseconds, or the address is not listed. |

```js
var info = await epixFrame.cmd("localProfileInfo", {});
if (info.can_link_xid) {
  var result = await epixFrame.cmd("localProfileLinkXid", {});
  if (result.record.xid.status === "verified") showBadge(result.record.xid.name);
}
```

Notes:

- The user must have an xID identity selected for the xite; otherwise the error is `Select a linked xID first`. The user selects one in the node's account picker, which a page opens with `certXid`.
- A signed link is not proof of current name ownership. Show a verified label only for `"verified"`, and never treat a display name as proof of an xID.
- An offline or unresolved link never blocks local profile messaging.
- Other errors: `Create a local profile first`, and the signed write error described under [`localProfileCreate`](#localprofilecreate).

## Related pages

- [Channels and local profiles](../build/messaging.md): concepts, privacy properties, the Epix Mail and Epix Mesh Chat walkthroughs, and the xite setup for local profiles.
- [API overview](index.md): how commands travel, errors, pushed events and the full command index.
- [Wrapper commands](wrapper.md): `wrapperPermissionAdd`, which asks for `CHANNELS`, `Channels:<app>` and `LOCAL_PROFILE`.
- [Xite and server commands](xite.md): `channelJoin`, `siteInfo` and the `setSiteInfo` event.
- [The wrapper sandbox](../build/sandbox.md): the permission model.
- [Channel cryptography](../internals/channels-crypto.md): how channel messages are sealed.
- [Privacy and routing](../start/privacy.md): what peers and observers can still see.
