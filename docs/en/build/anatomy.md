---
description: How a xite is laid out on disk, how the node serves it inside the wrapper, and how a page talks to the node.
---

# Xite anatomy

This page explains what a xite is made of and what happens between a visitor typing an address and your JavaScript receiving its first event. Read it after the [quickstart](quickstart.md) and before you design anything larger than a single page. New terms are defined in the [glossary](../reference/glossary.md).

## Files in a xite

A xite is a folder of static files. On your node it lives at `<data folder>/data/<address>/`, where `<address>` is the xite's `epix1...` address. A typical layout looks like this:

```text
<address>/
├── content.json              signed manifest (required)
├── index.html                entry page (required)
├── dbschema.json             optional: maps JSON files to SQL tables
├── css/  js/  img/           your assets
├── js/lib/epixframe.min.js   the EpixFrame library, carried by the xite
├── languages/                optional: translation dictionaries
└── data/
    ├── notes.json            data signed by the owner
    └── users/
        ├── content.json      rules for user content, signed by the owner
        └── alice.epix/
            ├── content.json  signed by that user
            └── data.json     that user's data
```

Only two names are fixed by the node:

| File | Role |
| --- | --- |
| `content.json` | The signed manifest. The root one carries the xite's metadata and the size and hash of every file. A directory can have its own `content.json`, which makes it a separately signed unit. See the [content.json reference](content-json.md). |
| `index.html` | The document loaded for the xite root and for any directory URL. |

Everything else is convention. `dbschema.json` is read when present ([Database](database.md)). `data/users/` is the customary home of user content ([User content](user-content.md)). `languages/` is the customary home of translations ([Translating a xite](i18n.md)).

There is no server-side code. A xite cannot run scripts on the node. Everything dynamic happens in the visitor's browser, with the node acting as storage, database, identity provider and network layer through the [EpixFrame API](../api/index.md). Sandboxed WebAssembly programs are the one exception and need explicit user consent; see [EVX](evx.md).

## The wrapper and the iframe

When a visitor opens a xite, the node does not send your `index.html` as the top-level page. It sends its own page, called the **wrapper**, and loads your page inside an `<iframe>` in it.

The wrapper is the part of the node the visitor can trust. It provides:

- the loading screen with download progress;
- the corner button that returns home and opens the xite sidebar;
- notifications, confirmation dialogs, prompts and permission requests;
- the only WebSocket connection to the node.

Your page is deliberately kept apart from it. The iframe is sandboxed and never shares the wrapper's origin, so your code cannot read the wrapper's document, its secrets or its socket. Everything your page asks of the node travels through the wrapper as a message.

<figure class="epix-diagram-figure" markdown="0">
<div class="epix-diagram">
--8<-- "docs/en/img/diagrams/wrapper.svg"
</div>
<figcaption>Your page reaches the node only through the wrapper. The wrapper holds the only connection to it.</figcaption>
</figure>


How isolated the page's own origin is depends on how the visitor reaches the node:

| Access | Wrapper URL | Your page's origin | Browser storage for the page |
| --- | --- | --- | --- |
| EpixNet Browser (host mode) | `https://<name>.epix/` | `https://<name>.content.epix/`, a real origin for this xite | `localStorage`, IndexedDB and service workers work, scoped to the xite |
| Local node on loopback | `http://127.0.0.1:42222/<address>/` | `http://epix-<address>.localhost:<port>/`, a real origin for this xite | Works, scoped to the xite and this node |
| LAN address or public gateway | `http://<host>/<address>/` | Opaque (`null`) origin | Not available |

Write for the most restrictive row and your xite works in all three. The details and the security reasoning are in [The wrapper sandbox](sandbox.md).

## URL forms

The same xite can be addressed several ways.

| URL | What it serves |
| --- | --- |
| `http://127.0.0.1:42222/<address>/` | The wrapper, with `index.html` in the iframe (path mode). |
| `http://127.0.0.1:42222/<name>.epix/` | The same, by `.epix` name. The node resolves the name to an address first. |
| `http://127.0.0.1:42222/<address>/docs/` | The wrapper with `docs/index.html` in the iframe. |
| `http://127.0.0.1:42222/<address>/about.html` | The wrapper with `about.html` in the iframe, when opened as a top-level page. |
| `https://<name>.epix/` | Host mode in the EpixNet Browser: the wrapper for that xite. |
| `http://127.0.0.1:42222/raw/<address>/<path>` | The file's bytes with no wrapper, under a policy that blocks scripts. Useful for viewing or sharing a single file. |
| `http://127.0.0.1:42222/list/<address>/` | The built-in file browser for the xite. |
| `http://127.0.0.1:42222/add/<address>` | Redirects to `/<address>/`. |

A few behaviors follow from this:

- When a xite claims a `.epix` name in `content.json` and the node has verified the name, opening the address form redirects to the name form.
- A query string on the wrapper URL is passed to your page. Opening `/<address>/?Topic:12` loads `index.html?Topic:12&wrapper_nonce=...` in the iframe, so your page can route on `location.search`.
- A fragment on the wrapper URL (`#section`) is appended to the iframe URL after your page reports that it has loaded (`wrapperInnerLoaded`).
- Requesting a file that is declared but not downloaded yet makes the node fetch it. Optional files are only fetched after the visitor has allowed optional downloads for the xite. See [Files](files.md).

### HTML placeholders

When the node serves an `.html` file from a xite, it replaces three placeholders:

| Placeholder | Replaced with |
| --- | --- |
| `{themeclass}` | `theme-dark` when the node user's stored theme is dark, otherwise `theme-light`. It does not follow the operating system theme; see [UI kit](../libraries/ui-kit.md). |
| `{site_modified}` | The `modified` time of the root `content.json`. Handy as a cache key: `css/all.css?v={site_modified}`. |
| `lang={lang}` | `lang=<code>` with the node's interface language, for example `js/app.js?lang=de`. |

```html
<body class="{themeclass}">
```

## Links and relative URLs

Because the iframe URL differs between access modes, follow these rules:

- **Use relative URLs for your own files**: `css/style.css`, `img/logo.png`, `data/notes.json`. Do not start them with `/`. A root-relative URL points at the node's root in path mode and at the xite's root in host mode, so it is not portable.
- **Navigate between your own pages at the top level.** Give page links `target="_top"`, or set it once with `<base target="_top">` as Epix Talk does. The node then renders the wrapper around the new page and issues a fresh wrapper nonce. A link followed inside the iframe loads the raw file without a nonce, and a xite that sets `postmessage_nonce_security` cannot talk to the wrapper from such a page.
- **Link to other xites by path at the top level**: `<a href="/<address>/" target="_top">` or `<a href="/<name>.epix/" target="_top">`. The node turns this into the right URL for the current access mode.
- **Prefer single-page routing for app-like xites.** Keep one `index.html` and route on the query string, updating the address bar with `wrapperPushState` (see [Navigation and history](#navigation-and-history)).

Access to other xites' files is restricted: reading another xite's files from script needs the `Cors:<address>` permission, which the visitor grants. See [The wrapper sandbox](sandbox.md).

## How commands travel

A command from your page to the node makes two hops.

1. **Page to wrapper, by `postMessage`.** EpixFrame posts a message to `window.parent`:

    ```json
    { "cmd": "siteInfo", "params": {}, "id": 1, "wrapper_nonce": "<nonce from the page URL>" }
    ```

    The wrapper only accepts messages from its own iframe and from the expected origin. When the xite sets `postmessage_nonce_security` in `content.json`, the message must also carry the `wrapper_nonce` the node placed in the iframe URL.

2. **Wrapper to node, by WebSocket.** Commands named `wrapper...` are handled by the wrapper itself: notifications, prompts, title, history, local storage, permission requests. Everything else is forwarded unchanged over the wrapper's WebSocket to the node.

The answer returns the same way:

```json
{ "cmd": "response", "to": 1, "result": { "address": "<address>", "peers": 3 } }
```

`to` matches the `id` of the request. EpixFrame keeps the table of pending ids and resolves your callback or Promise.

Things to know about this path:

- **Errors are results.** A failed command answers with `result: {"error": "..."}`. In callback style you receive that object and must check it. In Promise style EpixFrame rejects the Promise with it.
- **Authority comes from the socket, not from your code.** The wrapper authenticates its WebSocket with a per-xite secret that is never given to the page. Commands you send keep page-level authority: they act on your xite only, and commands marked ADMIN are refused unless the visitor has granted your xite that permission. See [Permissions](../api/index.md).
- **Granting is always the visitor's decision.** A page can ask for a permission with `wrapperPermissionAdd`; the wrapper shows the prompt and, if accepted, sends the grant itself.
- **You do not open a WebSocket yourself.** The node refuses WebSocket connections from xite content origins.

If you do not want a library, the protocol above is all there is. In practice use [EpixFrame](../libraries/epixframe.md), which also answers the wrapper's liveness probe and restores scroll position.

## Page lifecycle

1. The visitor opens a xite URL. The node renders the wrapper. If the xite is not on this node yet, the wrapper shows the loading screen while the node finds peers, downloads `content.json`, verifies it and fetches the files. The page document is held back until the files declared in the root `content.json` have arrived, so your page never boots with half of its scripts missing.
2. The wrapper points the iframe at your page. The URL carries a one-time `wrapper_nonce` parameter.
3. Your page loads. Constructing an `EpixFrame` instance reads the nonce from the URL and posts `innerReady` to the wrapper.
4. The wrapper's WebSocket to the node opens and subscribes to change events for this xite and for the node. Once the socket is open and your page has introduced itself, the wrapper posts `wrapperOpenedWebsocket` to your page. EpixFrame turns that into a call to `onOpenWebsocket()` (and an `openWebsocket` event).
5. Your page sends its first commands, usually `siteInfo` and whatever data it needs.
6. While the page is open, the node pushes events as things change. EpixFrame delivers them to `onRequest(cmd, message)` (and as a `request` event).
7. If the connection to the node drops, your page receives `wrapperClosedWebsocket` (`onCloseWebsocket()`). When it returns, you receive `wrapperOpenedWebsocket` again. Treat every `onOpenWebsocket()` as a cue to reload state.

!!! note "Overriding the hooks"
    The default `onOpenWebsocket`, `onCloseWebsocket` and `onRequest` methods are what emit the `openWebsocket`, `closeWebsocket` and `request` events. If you override a hook in a subclass, the matching event is no longer emitted unless you call `super`. Pick one style per xite: subclass and override, or use the shared instance with `.on(...)`.

## Events pushed to the page

All of these arrive in `onRequest(cmd, message)`; the payload is `message.params`.

| `cmd` | Sent when | Payload |
| --- | --- | --- |
| `setSiteInfo` | Anything about the xite changed: a file arrived, peers were found, the content was signed, the visitor's identity changed. | The same object `siteInfo` returns, optionally with an `event` array (below). |
| `setServerInfo` | Node-level state changed, such as the interface language or network status. | The same object `serverInfo` returns. |
| `setAnnouncerInfo` | Peer discovery progress, while the loading screen is showing. | Tracker statistics. Most xites ignore it. |
| `wrapperPopState` | The visitor used the browser's back or forward button. | `{href, state}` where `state` is what you passed to `wrapperPushState`. |
| `wrapperOpenedWebsocket` | The wrapper's connection to the node opened. | None. Delivered as `onOpenWebsocket()`. |
| `wrapperClosedWebsocket` | The connection was lost. | None. Delivered as `onCloseWebsocket()`. |
| `channelEvent` | A channel your xite uses received a message. | See [Messaging](messaging.md). |
| `webNotificationClick`, `webNotificationClose` | The visitor clicked or closed a system notification your page raised with `wrapperWebNotification`. | See [Wrapper commands](../api/wrapper.md). |

Node notifications, confirmation dialogs, prompts, progress bars and redirects are handled by the wrapper and never reach your page.

### The `event` field of `setSiteInfo`

`setSiteInfo` often carries `event: [name, value]` saying why it was sent.

| `event` | Meaning |
| --- | --- |
| `["file_done", "<inner path>"]` | A file was downloaded, verified and (for JSON data) loaded into the database. Re-read or re-query whatever depends on it. Not sent to the connection that wrote the file itself. |
| `["file_deleted", true]` | A file was removed. |
| `["file_failed", "<inner path>"]` | A file could not be downloaded during the initial download. The node retries. |
| `["peers_added", <count>]` | New peers were found during the initial download. |
| `["cert_changed", "<cert user id>"]` | The visitor selected or removed an identity for this xite. The value is `null` when they signed out. |
| `["updated", true]` | An update check finished. |

Without an `event`, the message is a plain refresh of the information. Events sent while the xite is still downloading can carry a reduced object, so check that a field exists before you read into it.

A typical handler, taken from the pattern the official xites use. EpixFrame does not set `this.address` for you: save it from your first `siteInfo` response, as the [quickstart](quickstart.md) does.

```js
onRequest(cmd, message) {
  if (cmd !== "setSiteInfo") return;
  var info = message.params;
  if (info.address !== this.address) return;   // ignore other xites' events
  this.site_info = info;

  if (info.event && info.event[0] === "file_done") {
    var path = info.event[1];
    if (path.endsWith(".json")) this.reloadData();
  }
  if (info.event && info.event[0] === "cert_changed") {
    this.updateSignedInUser(info.cert_user_id);
  }
}
```

Useful `siteInfo` fields include `address`, `peers`, `content` (the root `content.json` with `files`, `files_optional` and `includes` reduced to counts and the signatures removed), `settings` (per-node settings such as `own` and `permissions`), `cert_user_id` and `auth_address` (the visitor's identity on this xite, or `null`), and `privatekey` (a boolean: whether this node holds the owner key). The full list is in [Xite and server commands](../api/xite.md).

## Navigation and history

For single-page xites, keep the visible address in step with your view:

```js
// Show ?Note:2 in the address bar without reloading.
Page.cmd("wrapperPushState", [{ note_id: 2 }, "Note 2", "?Note:2"]);
```

The three parameters are a state object, a title and the new location, given as a query string (`?Note:2`) or a fragment (`#top`). `wrapperReplaceState` takes the same parameters and replaces the current entry. `wrapperGetState` returns the current state object.

When the visitor goes back, handle `wrapperPopState` and render the view for `message.params.state` or `message.params.href`.

On first load, read `location.search` in your page: the wrapper forwards its query string to the iframe (with an added `wrapper_nonce` parameter that you should ignore).

## Where state can live

| Kind of state | Where to keep it | Shared with other visitors |
| --- | --- | --- |
| Published content | Files in the xite, signed by the owner. | Yes, after signing and publishing. |
| Per-user content | Files under that user's directory, signed by the user. See [User content](user-content.md). | Yes. |
| Queryable data | JSON files loaded into the database by `dbschema.json`. See [Database](database.md). | Yes (it is derived from the files). |
| Large or optional media | Optional files. See [Files](files.md). | Yes, on demand. |
| Private per-visitor preferences | `wrapperSetLocalStorage` and `wrapperGetLocalStorage`. Stored in the browser, keyed by xite and by the visitor's identity on it. Works in every access mode. | No. |
| Browser storage (`localStorage`, IndexedDB) | Available only where the page has a real origin (see the table above). Wrap access in `try`/`catch` and fall back. | No. |
| View state and scroll position | The history state (`wrapperPushState`, `wrapperReplaceState`). | No. |
| Assets and balances | On Epix Chain, through the visitor's wallet. See [Epix Chain for xite developers](../web3/index.md). | Yes, on chain. |

```js
// Save and load visitor preferences. Pass the object itself as params.
Page.cmd("wrapperSetLocalStorage", { theme: "dark", last_read: 42 });
Page.cmd("wrapperGetLocalStorage", [], (data) => {
  var prefs = data || {};
});
```

!!! warning "Nothing in a xite is secret"
    Every file in a xite is public to anyone who downloads it, and a valid signature only proves who published a file, not that it is safe or lawful. Do not put secrets in xite files or in the database. For private data, encrypt for specific recipients ([Identity and cryptography commands](../api/identity.md)), use encrypted shards ([Files](files.md)) or use channels ([Messaging](messaging.md)).

## Related pages

- [The wrapper sandbox](sandbox.md): the security model in detail.
- [EpixFrame library guide](../libraries/epixframe.md): the client library.
- [EpixFrame API overview](../api/index.md): every command.
- [Node architecture](../internals/architecture.md): how the pieces fit inside the node.
