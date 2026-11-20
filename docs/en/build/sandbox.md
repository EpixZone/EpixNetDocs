---
description: How the EpixNet wrapper isolates a xite page, what stops working inside the sandbox, the supported replacements, the permission model, and a checklist for porting an existing web app.
---

# The wrapper sandbox

Every xite page runs inside an iframe that the node controls, and it reaches the node only by sending messages to the page that hosts that iframe, called the wrapper. This design is what lets you open a xite from an unknown publisher without handing it your node. It also means a few ordinary browser features behave differently. This page explains the boundary from a xite author's point of view: which origin your page gets, what breaks in the strictest case, what to use instead, how permissions are granted, and how to port an existing web app.

For the page lifecycle and the message bridge itself, see [Anatomy of a xite](anatomy.md). For the command reference, see the [EpixFrame API overview](../api/index.md). The JavaScript examples use `epixFrame`, the ready-made instance of the [EpixFrame library](../libraries/epixframe.md).

## The model

When a user opens `/<address>/`, the node serves the **wrapper**: a small trusted page that owns the WebSocket to the node, draws the loading screen, notifications and permission prompts, and contains one iframe. Your xite's `index.html` loads inside that iframe.

Your page talks to the wrapper with `postMessage`. The wrapper handles `wrapper*` commands itself and forwards every other command to the node over its own socket. Two properties keep this boundary real:

- **The page cannot reach the wrapper.** The iframe is sandboxed and never shares the wrapper's origin, so your scripts cannot read the wrapper's window, its DOM or its secrets.
- **The page cannot open its own privileged socket.** The wrapper authenticates its WebSocket with a per-xite secret (`wrapper_key`) that is rendered only into the wrapper page and stripped from everything a page can read. A socket opened from an opaque origin or from a xite content origin is refused.

The practical consequence is that a page has exactly the authority the user granted to its xite, and no more.

## Which origin your page gets

The iframe's origin depends on how the user reaches the node. Your xite does not choose the mode, so it should work in all three.

| How the xite is opened | Page origin | `allow-same-origin` | Browser storage |
| --- | --- | --- | --- |
| EpixNet Browser (host mode) | Its own content host, for example `https://talk.content.epix/`, separate from the wrapper at `https://talk.epix/` | Yes | Available, scoped to that xite |
| A regular browser on the same machine, through `127.0.0.1`, `localhost` or `::1` | `http://epix-<address>.localhost:<port>/`, one per xite | Yes | Available, scoped to that xite and node port |
| A LAN address or a public gateway (path mode) | Opaque (`null`) | No | Not available |

In the first two modes the page has a real origin that is still not the wrapper's and not another xite's. In path mode on a shared host there is no separate host to give each xite, so the iframe's `sandbox` attribute omits `allow-same-origin` and the page runs in an opaque origin.

Details worth knowing about the separate content origins:

- The loopback content host contains the xite's full canonical address. Names and aliases that resolve to the same xite share that one host, and the node port is part of the origin.
- A content host serves only that xite's files. It never renders the wrapper, the Config page, backups or any other node control, and it accepts no WebSocket.
- A top-level navigation that lands on a content host is redirected back to the wrapper. Your page is always framed.

!!! tip "Design for the opaque baseline"
    Write your xite so it works with an opaque origin, then treat real browser storage as an optimization. A xite that only works in EpixNet Browser will fail for users on a gateway or a phone on the same LAN.

## What breaks in an opaque origin, and what to use instead

| Feature | In an opaque origin | Supported replacement |
| --- | --- | --- |
| `localStorage`, `sessionStorage` | Access throws | `wrapperGetLocalStorage` and `wrapperSetLocalStorage` |
| Cookies | Not available | Do not use cookies. Identity comes from the node. |
| IndexedDB | Not available | The xite [database](database.md) for shared data, wrapper storage for small local state |
| Service workers | Registration fails | None. Xite files are already served locally by the node. |
| `fetch` or XHR of your own files | Blocked without a key | `fileGet`, or add the `ajax_key` to the URL |
| Reading another xite's files | Blocked | `corsPermission`, then `fileGet("cors-<address>/<path>")` |
| Opening your own WebSocket to the node | Refused | Send commands through the wrapper |
| Reading `parent` or `top` | Blocked | Use the `wrapper*` commands |
| `<script>`, `<link rel="stylesheet">`, `<img>`, audio, video, fonts, ES modules from your own xite | Work | Nothing to change |

### Storage

`wrapperGetLocalStorage` returns one JSON value and `wrapperSetLocalStorage` replaces it. The wrapper keeps the value in its own browser storage, keyed by the xite address and the user's identity for that xite, so two identities on the same node do not share it.

```js title="js/settings.js"
async function loadSettings() {
  return (await epixFrame.cmd("wrapperGetLocalStorage")) || {};
}

async function saveSetting(key, value) {
  const settings = await loadSettings();
  settings[key] = value;
  await epixFrame.cmd("wrapperSetLocalStorage", settings);
}
```

Because the whole value is replaced on every write, read it, change it and write it back. Keep it small: it is meant for preferences and drafts, not for application data. It lives in the user's browser profile, so it does not follow the user to another device and is not part of the xite.

If you also want to use native storage where it exists, guard every access:

```js
function nativeStorage() {
  try {
    const probe = "__probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (error) {
    return null; // opaque origin
  }
}
```

Apply the same guard to `navigator.serviceWorker` and `indexedDB`. Third-party libraries that touch `localStorage` at import time need the same treatment, usually a small in-memory shim installed before the library loads.

### Fetching your own files

Scripts, stylesheets, images, media, fonts and ES modules load from your xite without any change, in every mode. The restriction is on requests whose bytes your script can read: `fetch` and `XMLHttpRequest`.

In an opaque origin those requests carry `Origin: null`, and the node cannot tell your frame from any other opaque document. It therefore answers only when the request carries the xite's `ajax_key`, a second per-xite secret that the wrapper hands to its own page on request.

You have two options.

=== "fileGet (recommended)"

    Ask the node for the file through the command channel. This works identically in every mode and returns the file as text by default. Parameters and formats are in the [file commands reference](../api/files.md).

    ```js
    async function loadConfig() {
      const text = await epixFrame.cmd("fileGet", { inner_path: "data/config.json" });
      return JSON.parse(text);
    }
    ```

=== "fetch with the key"

    Ask the wrapper for the key once with `wrapperGetAjaxKey` and add it to your own URLs. Only your xite's files get the key, so it never reaches another host.

    ```js
    const ajaxKey = await epixFrame.cmd("wrapperGetAjaxKey"); // once, at startup

    async function xiteFetch(path) {
      const url = path + (path.includes("?") ? "&" : "?") + "ajax_key=" + encodeURIComponent(ajaxKey);
      return fetch(url);
    }

    async function loadConfig() {
      const response = await xiteFetch("data/config.json");
      return response.json();
    }
    ```

    EpixFrame's `monkeyPatchAjax()` adds the key to every `XMLHttpRequest` automatically, which helps libraries that use XHR. Do not rely on it for `fetch`: in the current EpixFrame build the patched `fetch` forwards the original URL, so the key is not added. See [EpixFrame known gaps](../libraries/epixframe.md#known-gaps).

A keyless `fetch("data.json")` succeeds on a separate content origin and fails in path mode. That difference is the most common reason a xite works for its author and breaks for a gateway visitor.

The `ajax_key` authorizes reads of your own xite and of xites you hold a `Cors:` grant for. It never grants access to the wrapper document, which is where the xite's secrets live.

### Reading another xite's files

Cross-xite reads need the user's consent. Ask with `corsPermission`, which makes the node show a confirmation in the wrapper, then address the other xite with a `cors-` prefix:

```js
async function readOtherXite(address) {
  await epixFrame.cmd("corsPermission", address);
  return epixFrame.cmd("fileGet", {
    inner_path: "cors-" + address + "/data/data.json",
  });
}
```

If the user declines, `corsPermission` answers with an error and the promise rejects.

The grant is stored as `Cors:<address>` in the xite's permissions. Every read rechecks it, so revoking the grant stops later reads. Merger xites use a related mechanism with `merged-<type>/<address>/<path>` paths, described in [Merger xites and hubs](merger-hubs.md).

On separate content origins, a page that embeds another xite's passive resources, such as an avatar image, has the request redirected to that xite's own content host. Documents, iframes, objects and embeds from another xite also go to its own origin, so foreign bytes never execute as your xite.

### Uploads

The one write a page makes over HTTP is a big file upload. `bigfileUploadInit` returns a URL with a one-time `upload_nonce`, and the node accepts the `POST` from an opaque origin because that nonce authorizes it. Every other cross-site write is refused. See [Files and media](files.md).

### Navigation and history

- Links with `target="_top"` navigate the top window, which is how one xite links to another. The sandbox allows top navigation, popups and downloads.
- The address bar belongs to the wrapper. Use `wrapperPushState`, `wrapperReplaceState` and `wrapperGetState` for client-side routing, and `wrapperSetTitle` for the tab title.
- The wrapper forwards the request's query string into the iframe URL, so `/<address>/?Topic:12` reaches your page as `?Topic:12&wrapper_nonce=...`. Ignore the `wrapper_nonce` parameter when you parse your own query.
- A top-level navigation to a directory or an `.html` file inside the xite renders the wrapper around that file, so multi-page xites work.
- Use `wrapperOpenWindow` to open a new window and `wrapperRequestFullscreen` for full screen.

## The message channel: wrapper_nonce and postmessage_nonce_security

Each time the node renders the wrapper it issues a one-time `wrapper_nonce` and appends it to the iframe URL. A frame library reads it from `location` and includes it as `wrapper_nonce` on every message it sends. EpixFrame does this for you.

The wrapper applies these checks to an incoming message, in order:

1. The message must come from the inner frame's window. Messages from any other window that holds a reference to the wrapper are ignored.
2. The message's origin must equal the configured content origin, or the literal `null` in the opaque fallback.
3. If the xite sets `"postmessage_nonce_security": true` in its root [`content.json`](content-json.md), the message's `wrapper_nonce` must equal the nonce the wrapper was rendered with. Without the flag, the wrapper instead refuses to operate when it was opened as a child window by another page, and asks the user to confirm.

Set the flag for any new xite:

```json title="content.json (excerpt)"
{
  "postmessage_nonce_security": true
}
```

Replies and events are sent to the exact content origin, so navigating the iframe to another xite cannot inherit the first xite's pending replies.

!!! note "Writing your own bridge"
    If you do not use EpixFrame, send `{cmd, params, id, wrapper_nonce}` to `window.parent`, announce yourself once with `innerReady`, answer the wrapper's `ping` with a `response` whose `result` is `"pong"`, and keep your message IDs below 1000000. IDs from 1000000 up are reserved for the wrapper's own commands and are rejected when they come from a page. Epix Mesh Chat ships a 76-line bridge that shows the minimum.

## Permissions

A xite starts with no permissions. Each one is granted by the user in the wrapper, stored in the node's settings for that xite, and visible to the page in `siteInfo().settings.permissions`.

| Permission | What it allows | How a page asks |
| --- | --- | --- |
| `ADMIN` | Node administration commands: configuration, xite management, user and identity management, logs, feeds and more. Full trust. | `wrapperPermissionAdd` |
| `NOSANDBOX` | Adds `allow-same-origin` to the iframe in path mode, so the page shares the wrapper's origin. Full trust. | `wrapperPermissionAdd` |
| `Merger:<type>` | Read and list other xites of a given type. See [Merger xites and hubs](merger-hubs.md). | `wrapperPermissionAdd` |
| `Cors:<address>` | Read files of one other xite | `corsPermission` |
| `CHANNELS` | Read the user's whole private message inbox and send as their identity. See [Channels and local profiles](messaging.md). | `wrapperPermissionAdd` |
| `Channels:<app>` | Read and send private messages in one named app channel | `wrapperPermissionAdd` |
| `LOCAL_PROFILE` | Create a local profile for this xite and exchange public and private group messages | `wrapperPermissionAdd` |

The suffix after `Merger:` or `Channels:` must start with a letter or digit, be at most 128 characters, and contain only letters, digits, `_`, `.` and `-`. Any other permission string is rejected. In particular, EVX execution is not a permission: it has its own consent dialog, described in [EVX programs](evx.md).

!!! danger "ADMIN and NOSANDBOX are full trust"
    A xite with `ADMIN` can administer the node. A xite with `NOSANDBOX` in path mode runs as the wrapper's own origin, which lets it open the node's WebSocket with the wrapper's authority. The prompt for both tells the user to trust the developer before accepting. Almost no xite needs either. On a separate content origin you already have browser storage without `NOSANDBOX`.

### How a grant happens

```js
epixFrame.cmd("wrapperPermissionAdd", "Merger:EpixPost", (result) => {
  if (result === "ok") start();
});
```

1. The page sends `wrapperPermissionAdd` with the permission as a string.
2. The wrapper asks the node for the permission's description and shows a prompt with a **Grant** button.
3. Only a real click on that button sends `permissionAdd`, from the wrapper's own socket.
4. The node stores the grant and pushes an updated `setSiteInfo` event to the page.

Behaviors to plan for:

- **Already granted:** the wrapper sends no answer. Check `siteInfo().settings.permissions` before asking.
- **Dismissed prompt:** the wrapper sends no answer. Use a timeout, or react to `setSiteInfo` instead of awaiting the reply.
- **Public gateway:** the wrapper answers `{error: "Permissions cannot be granted on a public gateway"}` and shows nothing.
- **A raw `permissionAdd` from a page** is routed through the same prompt. The node refuses a grant that does not come from the wrapper or the operator.

A complete helper that handles all four cases is in [Channels and local profiles](messaging.md).

### Who can run which command

| Caller | Authority |
| --- | --- |
| Page (through the wrapper, small message IDs) | Ordinary commands for its own xite, plus whatever its permissions allow |
| Wrapper (its own commands, IDs from 1000000 up, on a socket opened with `wrapper_key`) | Granting permissions after a user click, answering node prompts, EVX consent, and administrative commands of its own without a grant |
| Operator (the node's local admin socket) | Everything, including on a restricted gateway |

`ADMIN` lets a page run the administrative command set. It does not confer wrapper authority: an `ADMIN` xite still cannot grant permissions or EVX consent on its own. The administrative commands are listed in the [admin API reference](../api/admin.md).

On a public gateway the node refuses writes that need ownership, refuses all grants, and answers only a read-only subset of administrative commands.

## Content Security Policy

### The wrapper's policy

The wrapper page is served with this policy, where the nonce is fresh for every response:

```text
default-src 'none';
script-src 'nonce-<nonce>' 'wasm-unsafe-eval';
img-src * blob: data:; media-src * blob: data:; font-src * data:;
style-src 'self' blob: 'unsafe-inline';
connect-src *; frame-src * blob:;
frame-ancestors 'none'
```

It also sends `X-Frame-Options: DENY`, so no page can frame the wrapper and overlay its consent controls. `wasm-unsafe-eval` permits WebAssembly compilation only. It does not allow JavaScript `eval` or inline scripts without the nonce.

This policy governs the wrapper document, not your page.

### Your xite's files

A xite's own files normally carry no Content Security Policy. The iframe sandbox and the separate origin are the isolation, and a restrictive policy would block your own scripts. You may add a `<meta http-equiv="Content-Security-Policy">` to your pages to tighten things for yourself.

A few responses do carry restrictive headers:

- Files requested through the `/raw/<address>/<path>` view are served with a policy that blocks scripts.
- Another xite's file returned through a content host carries `Content-Security-Policy: sandbox`, `nosniff` and `no-store`, so it cannot execute as the requesting xite.
- SVG, XML, PDF and Flash files are served with `Content-Disposition: attachment`, so navigating to one downloads it instead of rendering it as a document.

Xite files are served with `Referrer-Policy: same-origin`. Scripts, stylesheets, images, video and fonts are served as `public, no-cache` with an ETag, so the browser revalidates them on every load and a newly published file shows up on the next reload.

### Diagnosing a wrapper CSP warning

A console message about a blocked script on the wrapper page usually comes from a browser extension that injects a script without the page's nonce. The wrapper keeps working.

1. Open the same URL in a private window. Firefox disables extensions there unless you allow them, so a warning that disappears points at an extension. This is a clue, not proof, because private browsing changes other state too.
2. Retest in a fresh profile or in Firefox Troubleshoot Mode.
3. If an extension is responsible, re-enable extensions one at a time to find it, and exclude the local node URL from its page injection if it supports exclusions.
4. If the warning persists in a clean profile, report the browser version, the URL, the console source location and whether the page works.

Keep the node's policy enabled. A console source such as `sandbox eval code` hints at an extension but does not identify one.

## Wallets inside sandboxed frames

Browser wallets inject a provider into pages and usually communicate with it over an exact-origin message transport. That has two consequences for xites.

- **On a separate content origin**, wallet account grants belong to the xite and the local node instance, not to every xite on a shared `127.0.0.1` origin. Connecting a wallet to one xite does not connect it to another.
- **In an opaque origin**, an installed wallet's transport can be blocked outright. LAN and public gateway access still use the opaque sandbox, so a wallet that needs an exact-origin transport will not work there.

[EpixKit](../libraries/epixkit.md) handles this case: a wallet request that never answers times out with an explanation and suggests opening the xite in EpixNet Browser, whose isolated `.epix` address gives the page a real origin. It does not grant sandbox permissions or forward wallet requests through another page's origin. EpixNet Browser also includes the Epix Wallet (see [Browser and wallet](../start/browser-wallet.md)).

Do not ask users to grant `NOSANDBOX` to make a wallet work. Tell them to open the xite on a local node or in EpixNet Browser. The wallet tutorial is in [Connect a wallet](../web3/wallet-connect.md).

## Porting checklist

Use this list when you move an existing web app into a xite.

- [ ] Bundle every dependency. Remove CDN scripts, remote fonts and analytics. A xite should load with no Internet access.
- [ ] Load EpixFrame (or your own bridge) before application code, and start node work from the `openWebsocket` event.
- [ ] Replace `localStorage`, `sessionStorage` and cookies with `wrapperGetLocalStorage` and `wrapperSetLocalStorage`, or guard native storage with `try` and `catch`.
- [ ] Remove service worker registration, or guard it and treat failure as normal.
- [ ] Replace IndexedDB with the xite database or wrapper storage, or guard it.
- [ ] Replace `fetch` and XHR of your own files with `fileGet`, or add the `ajax_key` to their URLs.
- [ ] Replace your backend API with node commands: `dbQuery` for reads, signed file writes for user data. See [Database](database.md) and [User content](user-content.md).
- [ ] Use relative URLs for every asset. Your files may be served from a path, a `.localhost` host or a `.content.epix` host.
- [ ] Route with `wrapperPushState` and read the initial route from the iframe URL's query string, ignoring `wrapper_nonce`.
- [ ] Add `<base target="_top">` or explicit `target="_top"` on links that should navigate the whole tab.
- [ ] Set `"postmessage_nonce_security": true` in `content.json`.
- [ ] Do not read `window.parent` or `window.top` beyond `postMessage`.
- [ ] Check permissions in `siteInfo().settings.permissions` before requesting them, and never block on the reply.
- [ ] Render every string that came from another user with `textContent`.
- [ ] Test in three places: EpixNet Browser, a regular browser at `http://127.0.0.1:<port>/<address>/`, and the node's LAN address (path mode, opaque origin).

!!! tip
    The LAN address test is the one that finds problems. If the xite works there, it works everywhere.

## Known limits

- The existence of a xite file can still be probed with a `no-cors` load from a page that suppresses its `Referer`. The bytes are not readable. Modern browsers' local-network-access rules and the EpixNet browser extension's clearnet block both stand in front of this.
- LAN and public gateway access in path mode keeps the opaque origin unless the deployment supplies separate `.epix` content hosts.
- The sandbox protects the node and other xites from an untrusted page. It does not make the content of a xite safe or lawful, and a valid signature only proves who published it.

## Related pages

- [Anatomy of a xite](anatomy.md)
- [wrapper* commands](../api/wrapper.md)
- [File commands](../api/files.md)
- [content.json reference](content-json.md)
- [Node source: wrapper-sandbox.md](https://github.com/EpixZone/EpixNet/blob/main/docs/wrapper-sandbox.md)
