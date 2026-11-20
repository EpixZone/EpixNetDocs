---
description: A practical guide to EpixFrame, the JavaScript library that connects a xite page to the EpixNet node. Covers installation, the handshake, promises and callbacks, events, every convenience method and TypeScript.
---

# EpixFrame

EpixFrame is the official JavaScript library that connects a xite page to the node. This guide shows how to install it, how the connection works, and what every helper method sends. It is for xite developers; for the meaning of each command, parameter and return value, follow the links into the [EpixFrame API reference](../api/index.md).

The name is used for two things. The **EpixFrame API** is the set of commands a page can send to the node. The **EpixFrame library** (this page) is one file of JavaScript that implements the message transport for that API and wraps the common commands in named methods. You can call any command in the API through the library, including commands that have no named helper.

| | |
| --- | --- |
| Repository | [EpixZone/epixframe](https://github.com/EpixZone/epixframe) |
| Version | 1.0.0 (tag `v1.0.0`) |
| License | MIT |
| Dependencies | None |
| Size | About 9 KB minified, 19 KB unminified |

## Install

EpixFrame is installed by copying one file into your xite. See [Vendoring](index.md#vendoring-ship-local-copies) for why xites ship local copies instead of loading from a CDN.

The repository's `dist/` folder contains three builds:

| File | Format | Use it when |
| --- | --- | --- |
| `dist/epixframe.min.js` | UMD, minified | You load scripts with `<script>` tags and want the smallest file |
| `dist/epixframe.js` | UMD, readable | You load scripts with `<script>` tags and want to read or debug the source. Most official xites ship this one |
| `dist/epixframe.esm.js` | ES module | You use `import`, with or without a bundler |

Copy the file you chose to a folder such as `js/lib/` in your xite, record where it came from, and keep the license file next to it.

!!! note "Not on the npm registry"
    The repository has a `package.json` named `@epixzone/epixframe`, but the package is not published to the npm registry at the time of writing, so `npm install @epixzone/epixframe` does not work. Copy the file from the repository instead. The repository README also shows a CDN script tag; do not use that in a xite.

## Load the library

=== "Script tag"

    ```html title="index.html"
    <script src="js/lib/epixframe.min.js"></script>
    <script src="js/app.js"></script>
    ```

    The script defines two globals:

    - `window.EpixFrame`, the class, for subclassing.
    - `window.epixFrame`, a ready-to-use shared instance. It is created the first time you read the property.

    ```js title="js/app.js"
    epixFrame.on("openWebsocket", async function () {
      var info = await epixFrame.siteInfo();
      document.title = info.content.title;
    });
    ```

=== "ES module"

    ```html title="index.html"
    <script type="module" src="js/app.js"></script>
    ```

    ```js title="js/app.js"
    import { EpixFrame, epixFrame } from "./lib/epixframe.esm.js";

    const frame = epixFrame();

    frame.on("openWebsocket", async () => {
      const info = await frame.siteInfo();
      document.title = info.content.title;
    });
    ```

    The module exports the `EpixFrame` class and a function named `epixFrame`. Calling the function returns the shared instance and creates it on first use.

!!! warning "`epixFrame` is an object in one build and a function in the other"
    With the script tag, `epixFrame` is the instance itself, so you write `epixFrame.siteInfo()`. With the ES module (and with the UMD build loaded through a module loader), `epixFrame` is a function, so you write `epixFrame().siteInfo()`. The repository README shows the module import used like an object; that form does not work.

## Two ways to structure your code

### The shared instance

For a small xite, use the shared instance and attach event listeners. This is what the Epix Airdrop xite does:

```js
var page = epixFrame;

page.on("openWebsocket", async function () {
  var info = await page.siteInfo();
  var server = await page.serverInfo();
  console.log("Xite", info.address, "on EpixNet", server.version);
});
```

### A subclass

For a larger xite, extend `EpixFrame` and override its hooks. The official application xites (the Dashboard, Talk, Mail, Post, Blog, Wiki, Sites and the xID manager) all use this pattern, usually with one global named `Page`.

```js title="js/MyApp.js"
class MyApp extends EpixFrame {
  // Runs at the end of the constructor, before the wrapper answers.
  init() {
    this.site_info = null;
  }

  // The connection to the node is ready. This is where a page starts loading.
  onOpenWebsocket() {
    this.cmd("siteInfo", {}, (info) => {
      this.site_info = info;
      this.render();
    });
  }

  // The node pushed something, for example an updated siteInfo.
  onRequest(cmd, message) {
    if (cmd === "setSiteInfo") {
      this.site_info = message.params;
      this.render();
    }
  }

  render() {
    document.getElementById("peers").textContent = this.site_info.peers;
  }
}

window.Page = new MyApp();
```

!!! warning "Create one instance per page"
    Each instance registers its own message listener and introduces itself to the wrapper. If you subclass, create your subclass once and do not also touch `window.epixFrame`, because reading that property creates a second instance.

!!! note "Overriding a hook replaces the matching event"
    The built-in `onOpenWebsocket`, `onCloseWebsocket` and `onRequest` methods are what emit the `openWebsocket`, `closeWebsocket` and `request` events. If you override a hook and still want `on(...)` listeners to fire, call `super.onOpenWebsocket()` (or the matching method) from your override.

## How the connection works

You do not need this section to use the library, but it explains the behavior you will see.

Your page never talks to the node directly. The node serves a trusted page called the wrapper, which loads your `index.html` inside a sandboxed iframe and owns the WebSocket to the node. Your page reaches the node by posting messages to the wrapper. [Anatomy of a xite](../build/anatomy.md) and [The wrapper sandbox](../build/sandbox.md) describe this boundary in full.

1. The wrapper loads your page with a one-time `wrapper_nonce` parameter in its URL. The node uses the nonce to authorize that page load.
2. When an `EpixFrame` instance is constructed it reads the nonce from `document.location.href`, starts listening for `message` events, and posts `{cmd: "innerReady"}` to `window.parent`.
3. Every message the library sends carries the nonce and a numeric `id` that starts at 1 and increases. The wrapper only accepts messages that come from your frame and its expected origin. A xite can also opt into a strict nonce check on every message by setting `postmessage_nonce_security` in its [content.json](../build/content-json.md).
4. Once the wrapper's WebSocket is open and your page has introduced itself, the wrapper posts `wrapperOpenedWebsocket`. The library calls `onOpenWebsocket()`.
5. When you call `cmd()`, the wrapper either handles the command itself (the `wrapper...` commands, such as notifications and history) or forwards it to the node. The answer comes back as `{cmd: "response", to: <id>, result: ...}` and the library resolves the matching promise or callback.
6. The library answers the wrapper's `ping` with `pong`, and repeats `innerReady` if the wrapper asks with `wrapperReady`.

Practical consequences:

- **Construct the instance early**, before any router or script rewrites the page URL. The nonce is read once, in the constructor.
- **Start your work in `onOpenWebsocket`**, not at script load. Commands sent before the wrapper is listening can be lost.
- **`onOpenWebsocket` can run more than once.** If the connection to the node drops and comes back, the wrapper announces it again. Make your startup code safe to repeat.
- **`isEmbedded`** is `true` when a nonce was found in the URL. Use it to show a helpful message when someone opens your `index.html` outside EpixNet.

## Send commands

`cmd()` sends any command in the [EpixFrame API](../api/index.md):

```js
cmd(name)                    // returns a Promise
cmd(name, params)            // returns a Promise
cmd(name, callback)          // callback style, returns nothing
cmd(name, params, callback)  // callback style, returns nothing
```

`params` is either an object of named parameters or an array of positional ones, depending on the command. The API reference lists both forms where a command accepts both.

```js
// Named parameters
var text = await epixFrame.cmd("fileGet", { inner_path: "data/data.json", required: false });

// Positional parameters
var rows = await epixFrame.cmd("dbQuery", ["SELECT * FROM topic ORDER BY added DESC LIMIT 20"]);
```

### Promises and callbacks

Both styles send the same message. They differ in how an error is delivered.

=== "Promise"

    ```js
    try {
      var res = await epixFrame.fileWrite("data/note.json", btoa(JSON.stringify({ text: "hi" })));
      console.log(res); // "ok"
    } catch (err) {
      // err is the node's result object, not an Error instance.
      epixFrame.notify("error", "Could not save: " + err.error);
    }
    ```

    If the result is an object with an `error` property, the promise rejects with that object. Read `err.error` for the message.

=== "Callback"

    ```js
    epixFrame.cmd("fileWrite", ["data/note.json", btoa(JSON.stringify({ text: "hi" }))], function (res) {
      if (res !== "ok") {
        epixFrame.cmd("wrapperNotification", ["error", "Could not save: " + (res.error || res)]);
      }
    });
    ```

    The callback always receives the result as the node sent it, including `{error: "..."}` objects. Nothing is thrown. This matches how older xite code checks errors.

### Things to know about results

- **Unknown commands resolve with `null`.** The node answers a command it does not implement with `null` instead of an error, so a misspelled command name looks like an empty result.
- **Some wrapper commands never answer.** The wrapper sends no response for `wrapperNotification`, `wrapperSetViewport`, `wrapperSetTitle`, `wrapperPushState`, `wrapperReplaceState`, `wrapperOpenWindow` and `wrapperInnerLoaded`. The promises returned by `notify()`, `setViewport()`, `setTitle()`, `pushState()`, `replaceState()`, `openWindow()` and `innerLoaded()` therefore never settle. Call these without `await`.
- **Some answers wait for the user.** `confirm()`, `prompt()` and `requestPermission()` resolve when the user acts. If the user ignores the dialog, the promise stays pending.
- **There are no timeouts.** The library does not give up on a command. Add your own timeout where a hung request would block the page.

## Events and lifecycle hooks

### Hooks

Override these in a subclass.

| Hook | Called when |
| --- | --- |
| `init()` | At the end of the constructor. The connection is not ready yet. |
| `onOpenWebsocket()` | The wrapper reports that its connection to the node is open. |
| `onCloseWebsocket()` | The wrapper reports that the connection was lost. |
| `onRequest(cmd, message)` | Any other message arrives from the wrapper or the node. `message.params` holds the payload. |

### Events

Without a subclass, listen for the same moments as events.

```js
function onOpen() { /* ... */ }

epixFrame.on("openWebsocket", onOpen);   // every time
epixFrame.once("openWebsocket", onOpen); // first time only
epixFrame.off("openWebsocket", onOpen);  // remove one listener
epixFrame.off("openWebsocket");          // remove all listeners for the event
```

| Event | Listener arguments |
| --- | --- |
| `openWebsocket` | None |
| `closeWebsocket` | None |
| `request` | `cmd`, `message` |

`on`, `once` and `off` return the instance, so calls can be chained.

### Messages pushed to your page

The `request` event (or the `onRequest` hook) is how your page hears about changes. The wrapper forwards these to every page:

| `cmd` | Sent when | `message.params` |
| --- | --- | --- |
| `setSiteInfo` | Something about the xite changed: a file arrived, peers changed, the user selected a different identity | The same shape as `siteInfo`, plus an `event` field such as `["file_done", "<inner path>"]` on file activity |
| `setServerInfo` | Node settings changed, for example the theme | The same shape as `serverInfo` |
| `setAnnouncerInfo` | Announce status for the xite changed | Announce status |
| `wrapperPopState` | The user pressed Back or Forward | `{href, state}` |

Other features push their own messages through the same path. See [Xite and server commands](../api/xite.md) for the event catalog.

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd === "setSiteInfo" && message.params.event && message.params.event[0] === "file_done") {
    reloadPosts();
  }
});
```

## Convenience methods

Every method below is a thin wrapper around `cmd()`. It returns a promise and has no callback form; use `cmd()` directly when you want a callback. The **Sends** column is the API command, which is what you look up in the reference.

### Xite and node information

| Method | Sends | Result |
| --- | --- | --- |
| `siteInfo()` | `siteInfo` | Information about the current xite: `address`, `peers`, `settings`, `content`, the user's `auth_address`, `cert_user_id` and `xid_directory`, and more |
| `serverInfo()` | `serverInfo` | Information about the node: `version`, `rev`, `platform`, `language`, `user_settings`, chain endpoints, and more |

Reference: [Xite and server commands](../api/xite.md).

### Wrapper interface

| Method | Sends | Notes |
| --- | --- | --- |
| `notify(type, message, timeout?)` | `wrapperNotification` | `type` is `"info"`, `"done"` or `"error"`. `timeout` is in milliseconds. The message is HTML-escaped, except for `<br>`, `<b>`, `<u>`, `<i>` and `<small>`. Never settles |
| `confirm(message)` | `wrapperConfirm` | Shows a prompt with one button. Resolves with `1` when the user presses it |
| `prompt(message, type?, placeholder?)` | `wrapperPrompt` | Resolves with the text the user entered. `type` defaults to `"text"`. See [Known gaps](#known-gaps) for the third argument |
| `setTitle(title)` | `wrapperSetTitle` | Sets the browser tab title. Never settles |
| `setViewport(viewport)` | `wrapperSetViewport` | Sets the wrapper's viewport meta tag, for example `"width=device-width, initial-scale=1"`. Never settles |
| `openWindow(url)` | `wrapperOpenWindow` | Opens a URL in a new window. Never settles |
| `innerLoaded()` | `wrapperInnerLoaded` | Tells the wrapper your page has rendered, so it can apply the URL fragment (`#anchor`) to your frame. Never settles |
| `requestPermission(permission)` | `wrapperPermissionAdd` | Asks the user to grant a permission such as `"Merger:MyType"`. Resolves with `"ok"` after the user grants it |
| `getLocalStorage()` | `wrapperGetLocalStorage` | Resolves with the value stored for this xite and user, or `null` |
| `setLocalStorage(data)` | `wrapperSetLocalStorage` | Stores a value for this xite and user. See [Known gaps](#known-gaps) |
| `getState()` | `wrapperGetState` | Resolves with the current history state |
| `pushState(state)` | `wrapperPushState` | Adds a history entry without changing the URL. Never settles |
| `replaceState(state)` | `wrapperReplaceState` | Replaces the current history entry. Never settles |

Reference: [Wrapper commands](../api/wrapper.md). Check `settings.permissions` in the `siteInfo` result before you ask for a permission the xite may already hold.

### Files

| Method | Sends | Notes |
| --- | --- | --- |
| `fileGet(path, opts?)` | `fileGet` | Resolves with the file's text, or `null`. `opts.required: false` returns at once when the file is not present. `opts.format: "base64"` returns binary content as base64 |
| `fileWrite(path, content)` | `fileWrite` | `content` must be base64. Resolves with `"ok"` |
| `fileDelete(path)` | `fileDelete` | Resolves with `"ok"` |
| `fileList(path)` | `fileList` | Resolves with every file under a directory, recursively, as inner paths |
| `dirList(path, opts?)` | `dirList` | Resolves with the names in one directory |
| `fileRules(path)` | `fileRules` | Resolves with the signing rules that apply to a path (signers, size limits) |
| `fileNeed(path, opts?)` | `fileNeed` | Asks the node to download a file. Resolves with `"ok"` |

Reference: [File commands](../api/files.md). Writing text needs a UTF-8 safe base64 step. The official xites use this one-liner:

```js
function toBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

await epixFrame.fileWrite("data/data.json", toBase64(JSON.stringify(data, null, 1)));
```

### Database

| Method | Sends | Notes |
| --- | --- | --- |
| `dbQuery(query, params?)` | `dbQuery` | Runs a read-only SQL query against the xite's database. Resolves with an array of row objects |

Reference: [Database commands](../api/database.md) and [Database](../build/database.md).

```js
var rows = await epixFrame.dbQuery(
  "SELECT * FROM comment WHERE topic_id = :topic_id ORDER BY added DESC",
  { topic_id: 12 }
);
```

### Signing and publishing

| Method | Sends | Notes |
| --- | --- | --- |
| `siteSign(privatekey?, innerPath?, opts?)` | `siteSign` | Signs the `content.json` that governs `innerPath`. Resolves with `"ok"` |
| `sitePublish(privatekey?, innerPath?, opts?)` | `sitePublish` | Signs, then pushes the change to peers. Pass `{sign: false}` in `opts` to publish without signing again. Resolves with `"ok"` |

Both methods build a named-parameter object: `privatekey` and `inner_path` are added when you pass them, and every key in `opts` is copied in. For user content you normally pass only the path:

```js
await epixFrame.sitePublish(null, "data/users/" + directory + "/content.json");
```

Reference: [Xite and server commands](../api/xite.md) and [User content](../build/user-content.md).

### Identity (xID)

xID is the on-chain name and identity system (see [xID for developers](../web3/xid.md)).

| Method | Sends | Notes |
| --- | --- | --- |
| `certSelect()` | `certXid` | Opens the identity picker so the user can choose which xID this xite acts as |
| `xidResolve(address)` | `xidResolve` | Resolves an address, or a dotted name such as `alice.epix`, to xID information. Resolves with `null` when nothing is found |
| `xidResolveIdentity(address)` | `xidResolveIdentity` | Handled by the node in the same way as `xidResolve` |
| `xidResolveName(name)` | `xidResolveName` | Resolves a name to its on-chain record |
| `xidResolveBatch(addresses)` | `xidResolveBatch` | Resolves up to 50 addresses or names in one call. Resolves with an object keyed by the values you passed |
| `xidResolveSite(site)` | `xidResolveSite` | Not implemented by the current node. See [Known gaps](#known-gaps) |

Reference: [Identity and cryptography commands](../api/identity.md).

### Encryption and signatures

| Method | Sends | Notes |
| --- | --- | --- |
| `getPublicKey(index?)` | `userPublickey` | Resolves with the user's encryption public key for this xite, base64 encoded. `index` defaults to `0` |
| `encrypt(text, publickey?)` | `eciesEncrypt` | Encrypts text to a public key, or to the user's own key when none is given. Resolves with base64 |
| `decrypt(text)` | `eciesDecrypt` | Decrypts base64 ciphertext with the user's key. Resolves with the text, or `null` when it cannot be decrypted |
| `sign(text)` | `ecdsaSign` | Signs text with the key of the identity selected for this xite. Rejects when no identity is selected |
| `verify(text, address, signature)` | `ecdsaVerify` | Resolves with `true` or `false` |
| `pubToAddr(pubkey)` | `eccPubToAddr` | Converts a hex-encoded public key to an `epix1` address |

Reference: [Identity and cryptography commands](../api/identity.md).

### Feeds and muting

| Method | Sends | Notes |
| --- | --- | --- |
| `feedFollow(feeds)` | `feedFollow` | Saves this xite's feed queries, as `{name: [query, params]}`. Resolves with `"ok"` |
| `feedList()` | `feedListFollow` | Resolves with the feeds this xite follows |
| `feedQuery(params?)` | `feedQuery` | Runs every followed feed across all xites. Accepts `limit` and `day_limit`. Requires the ADMIN permission |
| `feedSearch(query)` | `feedSearch` | Searches across xites. Requires the ADMIN permission |
| `muteAdd(authAddress, certUserId, reason)` | `muteAdd` | Mutes a user |
| `muteRemove(authAddress)` | `muteRemove` | Removes a mute |
| `muteList()` | `muteList` | Lists muted users. Requires the ADMIN permission |

Reference: [Merger, feed and search commands](../api/merger.md) and [Feeds, notifications and search](../build/feeds-search.md).

### Optional files

| Method | Sends | Notes |
| --- | --- | --- |
| `optionalFileInfo(path)` | `optionalFileInfo` | Resolves with details about one optional file |
| `optionalFileList(path)` | `optionalFileList` | Resolves with this xite's downloaded optional files. The node reads named options only, so call `cmd("optionalFileList", {...})` to filter or sort |
| `optionalFilePin(path)` | `optionalFilePin` | Pins a file so it is kept |
| `optionalFileUnpin(path)` | `optionalFileUnpin` | Removes the pin |
| `optionalFileDelete(path)` | `optionalFileDelete` | Deletes the local copy |
| `optionalHelp(directory, title, address?)` | `optionalHelp` | Starts helping to distribute a directory of optional files. Resolves with `{num, size}` |
| `optionalHelpRemove(directory, address?)` | `optionalHelpRemove` | Stops helping |

Reference: [File commands](../api/files.md) and [Optional and big files](../build/files.md).

### Merger xites

| Method | Sends | Notes |
| --- | --- | --- |
| `mergerSiteAdd(addresses)` | `mergerSiteAdd` | Adds one address or an array of addresses to this merger xite |
| `mergerSiteDelete(address)` | `mergerSiteDelete` | Removes a merged xite |
| `mergerSiteList(querySiteInfo?)` | `mergerSiteList` | Lists merged xites. Pass `true` to include each xite's information |

Reference: [Merger, feed and search commands](../api/merger.md) and [Merger xites and hubs](../build/merger-hubs.md).

### Randomness beacon (VRF)

Epix Chain stores a random beacon for every block. These methods have the node fetch it from the configured chain REST endpoints. The node does not check the answer against validator signatures, and `vrfLatestBeacon` returns the beacon of the block before the chain's latest height, without waiting for finality.

| Method | Sends | Result |
| --- | --- | --- |
| `vrfLatestBeacon()` | `vrfLatestBeacon` | `{height, beacon, proposer, timestamp}` |
| `vrfGetBeacon(height)` | `vrfGetBeacon` | The same shape, for one block height |
| `vrfMultiBlockBeacon(endHeight, blocks)` | `vrfMultiBlockBeacon` | `{beacon}`, one value combined from several consecutive blocks |
| `vrfDeriveRandom(beacon, seed, count)` | `vrfDeriveRandom` | An array of `count` hex strings derived from a beacon value and your seed |
| `vrfInvalidateCache()` | `vrfInvalidateCache` | `"ok"`. The current node keeps no beacon cache, so this does nothing |

A failed chain request comes back as `{error: "..."}`, which rejects the promise. See [Reading and writing contracts](../web3/contracts.md) for how to use the beacon fairly.

### Chain endpoints

| Method | Resolves with |
| --- | --- |
| `chainRpcUrl()` | The Epix Chain REST API URL the node is currently using |
| `chainEvmRpcUrl()` | The first configured EVM JSON-RPC URL |
| `chainBlockExplorerUrl()` | The configured block explorer URL |

These read `chain_rpc_url`, `chain_evm_rpc_url` and `chain_block_explorer_url` from `serverInfo`, cache the answer for the lifetime of the instance, and resolve with `null` when a value is missing. Use them instead of hardcoding endpoints, so your xite follows the user's node configuration. `serverInfo()` also returns `chain_rpc_urls` and `chain_evm_rpc_urls`, the full lists, if you want to fail over to another endpoint yourself.

```js
var rpcUrl = (await epixFrame.chainEvmRpcUrl()) || "https://evmrpc.epix.zone";
var provider = new ethers.JsonRpcProvider(rpcUrl);
```

See [Epix Chain for xite developers](../web3/index.md).

## History and deep links

The address bar belongs to the wrapper, not to your page, so a single-page xite changes its URL through the wrapper.

- The wrapper passes the query string of its own URL to your page. A link to `/<address>/?Topic:12` loads your `index.html` with `?Topic:12` (plus the nonce) in `location.search`.
- The URL fragment is not part of that first load. The wrapper applies it to your frame when you call `innerLoaded()`, and again whenever the fragment changes.
- The `pushState()` and `replaceState()` helpers store a state object but do not take a URL. To change the URL, send the command with three parameters: state, title and URL.

```js
// Navigate to a new view and put it in the address bar.
epixFrame.cmd("wrapperPushState", [{ view: "topic", id: 12 }, "", "?Topic:12"]);

// React to Back and Forward.
epixFrame.on("request", function (cmd, message) {
  if (cmd === "wrapperPopState") {
    route(message.params.state, message.params.href);
  }
});
```

The URL parameter can be a query string (`"?Topic:12"`), a fragment (`"#section"`) or a path inside the xite that starts with `/`.

The library also keeps your scroll position across reloads: it saves `scrollTop` into the history state when the page unloads and restores it on the next load.

## Fetching your own files

For reading a file from your xite, `fileGet()` is the simplest tool and works in every serving mode.

A direct `fetch()` or `XMLHttpRequest` to your own files is different. In the path-based fallback mode (a node reached over the LAN, or a public gateway) your page runs in an opaque origin, and the node only answers such a request when its URL carries the xite's `ajax_key`. `monkeyPatchAjax()` patches `XMLHttpRequest.prototype.open` so that the key is appended to XHR URLs, then asks the wrapper for the key. It also replaces `window.fetch`, but that replacement does not work in the current build (see [Known gaps](#known-gaps)), so add the key to `fetch` URLs yourself:

```js
var ajaxKey = await epixFrame.cmd("wrapperGetAjaxKey");
var res = await fetch("data/catalog.json?ajax_key=" + encodeURIComponent(ajaxKey));
```

!!! warning "The patch applies to every request"
    After `monkeyPatchAjax()`, the key is added to every `XMLHttpRequest`, including requests to other hosts such as a chain RPC endpoint. Always `await` the call before fetching, because requests made earlier carry no usable key. If your xite also talks to external services, prefer `fileGet()`, or add the key only to your own URLs:

    ```js
    var ajaxKey = await epixFrame.cmd("wrapperGetAjaxKey");

    function xiteFetch(path) {
      var sep = path.indexOf("?") === -1 ? "?" : "&";
      return fetch(path + sep + "ajax_key=" + ajaxKey);
    }
    ```

Scripts, styles, images, fonts and ES modules that your HTML references load without the key. See [The wrapper sandbox](../build/sandbox.md).

## Properties and logging

| Member | Description |
| --- | --- |
| `isEmbedded` | `true` when a wrapper nonce was found in the page URL |
| `url` | The value passed to the constructor, or `null` |
| `wrapper_nonce` | The nonce read from the URL, or `null` |
| `history_state` | The last history state received from the wrapper. Set only by `dist/epixframe.js` on the `main` branch, see [Known gaps](#known-gaps) |
| `waiting_cb` | Pending requests, keyed by message id |
| `log(...args)` | `console.log` with the class name as a prefix, for example `[MyApp]` |
| `logStart(name, ...args)` | Starts a named timer |
| `logEnd(name, ...args)` | Logs the time since `logStart(name)` in milliseconds |
| `response(to, result)` | Sends a response to a message from the wrapper. The library uses it to answer `ping` |

The built-in hooks log `Websocket open`, `Websocket close` and `Unknown request` to the console. Override the hooks if you want a quiet console.

## TypeScript

The repository ships declarations in `types/epixframe.d.ts`. Because the package is not on the npm registry, copy that file next to the build you vendored and give it a matching name.

=== "ES module"

    Save the declarations as `lib/epixframe.esm.d.ts`, beside `lib/epixframe.esm.js`. The import is then typed:

    ```ts title="src/app.ts"
    import { epixFrame, type SiteInfo } from "./lib/epixframe.esm.js";

    const frame = epixFrame();

    frame.on("openWebsocket", async () => {
      const info: SiteInfo = await frame.siteInfo();
      console.log(info.address, info.peers);
    });
    ```

=== "Script tag"

    Save the declarations as `types/epixframe.d.ts` and declare the globals the script creates:

    ```ts title="types/globals.d.ts"
    import type { EpixFrame as EpixFrameClass } from "./epixframe";

    declare global {
      const EpixFrame: typeof EpixFrameClass;
      const epixFrame: EpixFrameClass;
    }

    export {};
    ```

The declarations type the helper methods, the event names and interfaces such as `ServerInfo`, `SiteInfo`, `FileRules` and `FileGetOptions`. Treat the result interfaces as a starting point: they carry an index signature so unknown fields are allowed, and a few of them describe an older API shape (see below). `cmd()` returns `Promise<any>`, so cast the result of commands that have no helper.

## Known gaps

The library was written against an earlier node. The transport is unaffected, but a few helpers do not line up with what the current node and wrapper do. Until the library is updated, use the workaround shown.

| Helper | What happens | Do this instead |
| --- | --- | --- |
| `xidResolveSite(site)` | The current node has no `xidResolveSite` command, so the promise resolves with `null` | Read `canonical_domain` from `siteInfo()`, or use `xidResolveName()` |
| `setLocalStorage(data)` | The helper wraps `data` in an array before sending, so `getLocalStorage()` later returns `[data]` | `cmd("wrapperSetLocalStorage", data)`, which stores the value as given |
| `prompt(message, type, placeholder)` | The wrapper reads the third value as the button caption and a fourth as the placeholder | `cmd("wrapperPrompt", [message, type, caption, placeholder])` |
| `vrfDeriveRandom(height, seed, count)` | The parameter is named `height` in the source and the declarations, but the node expects the beacon value (a hex string) and returns a plain array | Pass the `beacon` field from `vrfGetBeacon()` as the first argument |
| `dirList(path, opts)` | Options are sent positionally and the node ignores them | `cmd("dirList", {inner_path: path, stats: true})` |
| `monkeyPatchAjax()` | The `XMLHttpRequest` patch works. The `fetch` patch does not: the builds run in strict mode, where the wrapper's change to its `url` parameter does not reach the `arguments` it forwards, so `fetch` is called without the key | Add the key from `cmd("wrapperGetAjaxKey")` to your `fetch` URLs, or read files with `fileGet()` |
| `requestPermission(permission)` | The helper sends the permission inside an array, and the wrapper compares that value with the granted list, so a permission the xite already holds is asked for again. (Sent as a plain string, an already granted permission gets no answer at all) | Check `settings.permissions` from `siteInfo()` first and only ask for what is missing |
| `confirm(message)` | Declared as `Promise<boolean>`, but resolves with the number `1` | Treat any resolved value as confirmation |
| VRF result types | The `VrfBeacon`, `VrfDeriveResult` and `VrfMultiBlockResult` interfaces list fields the current node does not return | Use the result shapes in [Randomness beacon](#randomness-beacon-vrf) |

The ES module and minified builds in `dist/` are also one small change behind `dist/epixframe.js` on the `main` branch: they do not set the public `history_state` property. The `dist/epixframe.js` at tag `v1.0.0` predates that change too, so take that file from `main` (the copy the official xites ship) if you need the property. This only matters if your code reads that property. Scroll restoration works in all three builds.

## Build from source

You only need this to change the library itself.

```sh
git clone https://github.com/EpixZone/epixframe.git
cd epixframe
npm install
npm run dist
```

`npm run dist` runs Rollup and Terser and writes `dist/epixframe.js`, `dist/epixframe.esm.js` and `dist/epixframe.min.js`. The source is a single file, [`src/epixframe.js`](https://github.com/EpixZone/epixframe/blob/main/src/epixframe.js).

## Next steps

- [Build your first xite](../build/quickstart.md) uses EpixFrame from the first page.
- [EpixFrame API overview](../api/index.md) lists every command, including the ones with no helper here.
- [EpixKit](epixkit.md) adds wallet connections on top.
- [AI-assisted development](../ai/index.md) explains how to give a coding agent the context it needs to use this library correctly.
