---
description: Reference for the commands the EpixNet wrapper handles in the browser. Notifications, dialogs, title and viewport, history, per-xite storage, permission and EVX consent requests, web notifications and avatar thumbnails.
---

# Wrapper commands

Wrapper commands are handled by the wrapper, the trusted page the node serves around every xite, instead of by the node. They cover what a sandboxed page cannot do for itself: show a dialog, change the tab title or the address bar, keep small amounts of storage, ask the visitor for a permission. This page documents each of them for xite developers. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first.

## How wrapper commands behave

- **They run in the browser.** Most need no round trip to the node and work the moment your page has loaded. The ones that read xite information (`wrapperGetLocalStorage`, `wrapperSetLocalStorage`, `wrapperPermissionAdd`, `evxRequest` and the web notification commands) wait until the wrapper has received the xite's `siteInfo` from the node.
- **Parameters are read literally.** Where an entry says "array", send an array. The wrapper does not accept the named-object alternative that node commands offer.
- **Many send no response.** Entries marked "no response" never answer, so a Promise returned by `cmd` or by an EpixFrame helper stays pending and a callback is never called. Call these without `await`.
- **Dialogs can be dismissed.** A confirmation or prompt that the visitor closes with its close button sends no response either.
- **Dialog buttons need a real click.** The wrapper checks that the event on its buttons and inputs is a trusted user event, so a page cannot answer its own dialogs.

!!! note "HTML in messages"
    Text you pass to `wrapperNotification`, `wrapperConfirm`, `wrapperPrompt` and `wrapperProgress` is HTML-escaped before it is shown. Only these tags survive: `<br>`, `<b>`, `<u>`, `<i>` and `<small>` (opening and closing forms, without attributes). Escape nothing yourself, and do not rely on any other markup.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance.

## Page lifecycle and handshake

EpixFrame sends these for you. They are documented so that you can read the traffic in the browser console and so that a custom transport can implement them.

### innerReady

Announces that the page's frame library is loaded and listening. The wrapper marks the page as ready and, once its connection to the node is open, posts `wrapperOpenedWebsocket` to the page.

**Permission:** none

No parameters.

**Returns:** no response. The effect is the `wrapperOpenedWebsocket` message, which EpixFrame turns into `onOpenWebsocket()` and the `openWebsocket` event.

```js
// EpixFrame sends this from its constructor. A custom transport would post:
window.parent.postMessage({ cmd: "innerReady", params: {}, id: 1, wrapper_nonce: nonce }, "*");
```

Notes:

- Send it once per document. The wrapper treats a second `innerReady` as a new document that replaced the old one, resets its state for the page and announces the connection again. Creating two EpixFrame instances in one page therefore makes `onOpenWebsocket()` run twice. Use either the shared `epixFrame` instance or one instance of your own subclass, not both.
- If the wrapper has not heard from a page by the time the frame finishes loading, it posts a `ping` message. Answer with [`response`](#response) and the result `"pong"`. EpixFrame does this automatically.

### wrapperInnerLoaded

Tells the wrapper the page has finished loading. If the wrapper's own URL has a `#fragment`, the wrapper appends it to the iframe URL so that the page scrolls to the matching anchor.

**Permission:** none

No parameters.

**Returns:** no response.

```js
// The helper returns a Promise that never settles; do not await it.
epixFrame.innerLoaded();
```

### innerLoaded

The older name of [`wrapperInnerLoaded`](#wrapperinnerloaded). The wrapper handles both names identically.

**Permission:** none

No parameters.

**Returns:** no response.

```js
epixFrame.cmd("innerLoaded");
```

Prefer `wrapperInnerLoaded` (or the `innerLoaded()` helper, which sends it) in new code.

### innerLoadState

Internal. While a xite is still downloading, the node serves a placeholder document in the iframe. That placeholder posts `innerLoadState` with the value `"waiting"` so that the wrapper keeps its loading screen up and loads the real page once the download completes.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| (value) | string | yes | `"waiting"`. Any other value clears the state. |

**Returns:** no response.

```js
// Sent only by the node's own placeholder document:
window.parent.postMessage({ cmd: "innerLoadState", params: "waiting" }, "*");
```

A xite has no use for this command. The wrapper ignores it from any document that has already sent `innerReady`.

### response

A reply frame. Messages flow in both directions, so the page sometimes has to answer the wrapper. From a page, the wrapper accepts exactly one reply: `"pong"` to its own `ping` probe (see [`innerReady`](#innerready)). Every other `response` sent by a page is ignored.

**Permission:** none

A `response` message has no `params`. It carries these top-level fields instead:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `to` | number | yes | The `id` of the message being answered. |
| `result` | any | yes | The answer. For the `ping` probe: `"pong"`. |

**Returns:** no response.

```js
// What EpixFrame does when the wrapper pings the page:
epixFrame.response(message.id, "pong");
```

Confirmations and prompts raised by the node are answered by the wrapper over its own connection. The node ignores a `response` that does not come from the wrapper, so a page cannot accept a dialog for the visitor.

## Notifications and dialogs

### wrapperNotification

Shows a notification toast in the wrapper.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: type | string | yes | `"info"`, `"done"` or `"error"`. It selects the icon and color. |
| 1: message | string | yes | The text. See the note on HTML above. |
| 2: timeout | number | no | Milliseconds until the toast closes by itself. Without it (or with `0`) the toast stays until the visitor closes it. |

**Returns:** no response.

```js
epixFrame.notify("done", "Link copied", 3000);

// The same with the raw command:
epixFrame.cmd("wrapperNotification", ["done", "Link copied", 3000]);
```

A toast with a timeout has no close button.

### wrapperConfirm

Shows a confirmation dialog with one or more buttons and reports which button the visitor clicked.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: message | string | yes | The question. See the note on HTML above. |
| 1: caption | string or array of strings | no | The button label, or several labels for several buttons. Default `"ok"`. |

**Returns:** the 1-based index of the clicked button, as a number. With a single button the answer is always `1`. No response if the visitor closes the dialog without choosing.

```js
epixFrame.cmd("wrapperConfirm", ["Are you sure you want to delete this post?", "Delete"], function (choice) {
  if (choice === 1) deletePost();
});
```

Notes:

- The `confirm(message)` helper sends only the message, so the button reads "ok". It resolves with `1`, not with `true`.
- An open confirmation is identified by its caption. Raising a second one with the same caption replaces the first, and the first never answers.

### wrapperPrompt

Shows a dialog with a text input and returns what the visitor typed.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: message | string | yes | The label shown above the input. See the note on HTML above. |
| 1: type | string | no | The HTML input type, for example `"text"` or `"password"`. Default `"text"`. |
| 2: caption | string | no | The button label. Default `"OK"`. |
| 3: placeholder | string | no | Placeholder text for the input. Default empty. |

**Returns:** the input value as a string, sent when the visitor presses Enter or clicks the button. No response if the dialog is closed.

```js
epixFrame.cmd("wrapperPrompt", ["Reason for the report (optional):", "text", "Send report", "Reason"], function (reason) {
  sendReport(reason);
});
```

!!! warning "The `prompt()` helper and the button label"
    `epixFrame.prompt(message, type, placeholder)` sends its third argument in position 2, which the wrapper reads as the button caption, not as the placeholder. Use the raw command when you want both a caption and a placeholder.

### wrapperProgress

Shows a progress toast with a circular indicator, or updates one that is already showing.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: id | string | yes | A name for this progress toast. Calls with the same id update the same toast. |
| 1: message | string | yes | The text next to the indicator. |
| 2: percent | number | yes | Progress from `0` to `100`. `100` marks the toast as done and closes it after 3 seconds. A negative value marks it as failed. |
| 3: plain | boolean | no | `true` shows the message as literal text: nothing is interpreted as HTML and line breaks in the string are kept. |

**Returns:** no response.

```js
function showUploadProgress(done, total) {
  var percent = Math.round((done / total) * 100);
  epixFrame.cmd("wrapperProgress", ["upload", "Uploading " + done + " of " + total, percent]);
}

// Report a failure:
epixFrame.cmd("wrapperProgress", ["upload", "Upload failed", -1]);
```

Once a toast has been marked done or failed, its indicator does not change again. Use a new id for the next operation.

## Web notifications

### wrapperWebNotification

Shows a notification through the browser's Notification API, outside the page. If the browser has not been asked yet, the wrapper requests notification permission first.

**Permission:** none in EpixNet. The browser asks the visitor for its own notification permission.

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: title | string | yes | The notification title. |
| 1: id | string | yes | Your own identifier for this notification. It comes back in the click and close messages and is the handle for `wrapperCloseWebNotification`. |
| 2: options | object | yes | Options passed to the browser's `Notification` constructor, such as `body`. The wrapper also reads `focus_tab`: unless it is set, the wrapper cancels the browser's default action when the notification is clicked. Set it to `true` when a click should be allowed to bring the xite's tab forward. Pass `{}` when you need no options. |

**Returns:** `"ok"` when the notification is shown. `{"error": "Web notifications are disabled by the user"}` when the visitor has blocked notifications. No response if the visitor does not grant the browser permission when asked.

Afterwards the page receives these messages (through `onRequest` or the `request` event):

| Message | `params` | When |
| --- | --- | --- |
| `webNotificationClick` | `{"id": "<id>"}` | The visitor clicked the notification. |
| `webNotificationClose` | `{"id": "<id>"}` | The notification was closed. |

```js
var seq = 0;

function notifyNewMessage(title, body) {
  var id = "mail-" + (++seq);
  epixFrame.cmd("wrapperWebNotification", [title, id, { body: body, focus_tab: true }]);
  return id;
}

epixFrame.on("request", function (cmd, message) {
  if (cmd === "webNotificationClick") openConversationFor(message.params.id);
});
```

### wrapperCloseWebNotification

Closes a notification that was opened with [`wrapperWebNotification`](#wrapperwebnotification).

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: id | string | yes | The id given to `wrapperWebNotification`. |

**Returns:** no response. The page receives `webNotificationClose` for that id.

```js
epixFrame.cmd("wrapperCloseWebNotification", [id]);
```

Only pass the id of a notification that is still open. The wrapper forgets an id as soon as its notification closes.

## Title, viewport and windows

### wrapperSetTitle

Sets the title of the browser tab.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| (value) | string | yes | The new title. Pass the string itself, not an array. |

**Returns:** no response.

```js
epixFrame.setTitle("Inbox (3) - Epix Mail");
```

Until a page sets a title, the wrapper shows the `title` from `content.json` followed by " - EpixNet". After the first `wrapperSetTitle` the wrapper leaves the title to the page. Setting `document.title` inside the iframe has no effect on the tab.

### wrapperSetViewport

Sets the content of the `<meta name="viewport">` tag of the top-level page. A viewport tag inside the iframe does not control the browser's viewport, so responsive xites need this command.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| (value) | string | yes | The viewport content. Pass the string itself, not an array. |

**Returns:** no response.

```js
epixFrame.setViewport("width=device-width, initial-scale=1");
```

A xite can also declare a `viewport` string in [`content.json`](../build/content-json.md). The wrapper applies it when the xite's information arrives, unless the page has already called `wrapperSetViewport`.

### wrapperRequestFullscreen

Asks the browser to show the xite's frame in fullscreen.

**Permission:** none

No parameters.

**Returns:** no response.

```js
document.querySelector("#fullscreen").addEventListener("click", function () {
  epixFrame.cmd("wrapperRequestFullscreen");
});
```

### wrapperOpenWindow

Opens a URL in a new window or tab from the wrapper. The new window's `opener` is cleared, so the opened page gets no reference back to the wrapper.

**Permission:** none

Parameters are either a single string (the URL) or an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: url | string | yes | The address to open. A path such as `"/<address>/"` opens another xite on the same node. |
| 1: target | string | no | A window target as understood by `window.open`, for example `"_blank"` or `"_top"`. `"_top"` navigates the current tab instead of opening a new one. |
| 2: specs | string | no | A window features string as understood by `window.open`. |

**Returns:** no response.

```js
// Open another xite in a new tab:
epixFrame.cmd("wrapperOpenWindow", ["/<address>/"]);

// Leave the current xite and go to another one in the same tab:
epixFrame.cmd("wrapperOpenWindow", ["/<address>/", "_top"]);
```

The `openWindow(url)` helper sends `[url]`.

### wrapperReload

Reloads the whole wrapper page, and with it the xite.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: query | string | no | A query string fragment such as `"lang=en"`. When given, the wrapper navigates to its current URL (without the `#fragment`) with this appended, using `?` or `&` as needed. When absent, the wrapper reloads the current URL. |

**Returns:** no response.

```js
epixFrame.cmd("wrapperReload", []);
```

## History and navigation

A single-page xite should keep the address bar in step with what it shows, so that reload, bookmarks and shared links work. The address bar belongs to the wrapper, so the page changes it with these commands. When the visitor uses the back or forward button, the page receives [`wrapperPopState`](#messages-from-the-wrapper).

For all three commands the wrapper turns the `url` parameter into an address for the current xite:

| `url` value | Resulting address |
| --- | --- |
| Starts with `?`, or any other non-empty text | The current path with that text as the query string. |
| Starts with `#` | The current address with that fragment. |
| Starts with `/` | A path inside the current xite: the first segment of the current path (the xite's address or name in the URL) is kept and the rest is replaced. |
| Empty string | The current path without a query string. |
| `null` or omitted | The current path and query, unchanged. |

!!! note "Keep your state in `history_state`"
    EpixFrame keeps an object in `epixFrame.history_state`. At startup it loads the current entry's state into it. When the page unloads, it writes the scroll position into that object as `scrollTop` and stores the object with `wrapperReplaceState`, so that the scroll position can be restored on the next load. State that you stored for the current entry without going through that object is overwritten at that point. The official xites therefore put their own fields on `history_state` and pass that object to the commands below.

### wrapperPushState

Adds an entry to the browser history and updates the address bar.

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: state | any | yes | A JSON value stored with the history entry. You get it back from `wrapperGetState` and in `wrapperPopState`. |
| 1: title | string | no | Passed to `history.pushState` as its title argument. The official xites pass `""`. |
| 2: url | string | no | The new address, by the rules in the table above. |

**Returns:** no response.

```js
function showTopic(id) {
  renderTopic(id);
  epixFrame.history_state = { view: "topic", id: id };
  epixFrame.cmd("wrapperPushState", [epixFrame.history_state, "", "?Topic:" + id]);
}
```

The `pushState(state)` helper sends `[state, null]`: it stores the state in a new history entry but leaves the address unchanged. Use the raw command to change the URL.

### wrapperReplaceState

Replaces the current history entry instead of adding one. Parameters and URL rules are the same as for [`wrapperPushState`](#wrapperpushstate).

**Permission:** none

Parameters are an array:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| 0: state | any | yes | A JSON value stored with the history entry. |
| 1: title | string | no | Passed to `history.replaceState` as its title argument. The official xites pass `""`. |
| 2: url | string | no | The new address, by the rules in the table above. |

**Returns:** no response.

```js
// Normalize the address without adding a history entry:
epixFrame.history_state = { view: "inbox" };
epixFrame.cmd("wrapperReplaceState", [epixFrame.history_state, "", "?Inbox"]);
```

The `replaceState(state)` helper sends `[state, null]`, which replaces the stored state and leaves the address unchanged.

### wrapperGetState

Returns the state stored with the current history entry.

**Permission:** none

No parameters.

**Returns:** the wrapper window's `history.state`: the value last stored for this entry with `wrapperPushState` or `wrapperReplaceState`, or `null` for an entry that has none (the first entry of a visit, for example).

```js
var state = await epixFrame.getState();
if (state && state.view === "topic") renderTopic(state.id);
```

EpixFrame sends this command itself when it starts, to fill `history_state` and restore the scroll position.

## Storage and file requests

### wrapperGetLocalStorage

Reads the value the xite stored with [`wrapperSetLocalStorage`](#wrappersetlocalstorage). The wrapper keeps one value per xite and per identity in its own browser storage, which works even where the page itself has no `localStorage` (see [The wrapper sandbox](../build/sandbox.md)).

**Permission:** none

No parameters.

**Returns:** the stored JSON value, or `null` if nothing has been stored.

```js
var settings = (await epixFrame.getLocalStorage()) || {};
```

Notes:

- The storage key is `xite.<address>.<auth_address>`, where `auth_address` is the address of the identity currently selected for the xite, or `anon` when the visitor browses anonymously. When the visitor switches identity, the page sees a different (possibly empty) value.
- The value is kept by the browser, not by the node. It is not published and does not follow the visitor to another browser or device. Use it for preferences and drafts. For private state that the node should keep, use [`userSetSettings`](identity.md#usersetsettings); for data other visitors should see, use [user content](../build/user-content.md).

### wrapperSetLocalStorage

Stores a JSON value for the xite and the current identity, replacing the previous value.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| (value) | any JSON value | yes | The value to store. The whole `params` value is stored as it is. |

**Returns:** a response with no value, sent once the value is stored.

```js
// Raw command: what you store is what you get back.
await epixFrame.cmd("wrapperSetLocalStorage", { theme: "dark", drafts: {} });
var stored = await epixFrame.cmd("wrapperGetLocalStorage"); // { theme: "dark", drafts: {} }
```

!!! warning "The `setLocalStorage()` helper wraps the value in an array"
    `epixFrame.setLocalStorage(data)` sends `[data]`, and the wrapper stores that array. `getLocalStorage()` then returns `[data]`, not `data`. Either read index `0` of the result, or use the raw command for both directions as shown above. Do not mix the two styles in one xite.

There is no partial update: read the value, change it and store it again. Browser storage limits apply.

### wrapperGetAjaxKey

Returns the xite's `ajax_key`. When the page runs in an opaque origin (the mode used for LAN and public gateway access), the node answers the page's own `fetch` and `XMLHttpRequest` calls only when the request URL carries this key as the `ajax_key` query parameter. Scripts, styles, images, media, fonts and ES modules load without it in every mode. The origin modes are explained in [The wrapper sandbox](../build/sandbox.md).

**Permission:** none

No parameters.

**Returns:** the key, as a string.

```js
// Append the key to your own fetch URLs:
var key = await epixFrame.cmd("wrapperGetAjaxKey");
var res = await fetch("data/data.json?ajax_key=" + encodeURIComponent(key));

// Or patch XMLHttpRequest once, before the first request:
await epixFrame.monkeyPatchAjax();
```

Notes:

- `monkeyPatchAjax()` replaces `XMLHttpRequest.prototype.open` so that the key is appended to XHR URLs automatically. It also replaces `window.fetch`, but in the current EpixFrame build that wrapper forwards the original URL, so add the key to `fetch` URLs yourself. Wait for its Promise before the first request.
- On a separate content origin (EpixNet Browser, or a regular browser on the same machine) a request without the key also succeeds. Appending the key there does no harm, so patch unconditionally and your xite works in every mode.
- The key authorizes reads of this xite's files, and of another xite's files only when this xite holds `Cors:<address>` for it.
- You can avoid the question entirely by reading files with [`fileGet`](files.md#fileget).

## Permissions and consent

### wrapperPermissionAdd

Asks the visitor to grant the xite a permission. The wrapper shows a prompt with the permission's description and a **Grant** button. Only a click on that button sends the grant to the node, from the wrapper's own connection.

**Permission:** none. The visitor decides in the wrapper's dialog.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| (value) | string | yes | The permission name. Pass the string itself. |

The node accepts these names: `ADMIN`, `NOSANDBOX`, `CHANNELS`, `LOCAL_PROFILE`, `Merger:<type>` and `Channels:<app>`. The part after `Merger:` or `Channels:` must start with a letter or digit, be at most 128 characters long and contain only letters, digits, `_`, `.` and `-`. What each permission allows is described in [The wrapper sandbox](../build/sandbox.md).

**Returns:**

| Situation | Response |
| --- | --- |
| The visitor clicks **Grant** | `"ok"`. The node also pushes a `setSiteInfo` event with the new `settings.permissions`. |
| The visitor clicks **Grant**, but the node does not accept the name | `{"error": "Unknown or malformed permission: <name>"}` |
| The xite already holds the permission | No response. |
| The visitor closes the prompt | No response. |
| The node is a public gateway | `{"error": "Permissions cannot be granted on a public gateway"}`, and no prompt is shown. |

```js
async function ensurePermission(name, onReady) {
  var info = await epixFrame.siteInfo();
  if (info.settings.permissions.indexOf(name) !== -1) return onReady();
  epixFrame.cmd("wrapperPermissionAdd", name, function (result) {
    if (result === "ok") onReady();
  });
}

ensurePermission("Merger:EpixPost", startFeed);
```

Notes:

- Because two of the outcomes send no response, check `siteInfo().settings.permissions` before asking, and never block the page on the answer.
- Pass a string. The `requestPermission(permission)` helper sends `[permission]`; the grant still works, but the wrapper's "already granted" check does not recognize the array form, so the visitor is asked again.
- A page that sends the node command `permissionAdd` directly gets the same prompt: the wrapper routes it here. See [Admin commands](admin.md#permissionadd).
- Read access to another xite's files (`Cors:<address>`) is requested with [`corsPermission`](files.md#corspermission) instead.

### evxRequest

Asks the visitor for consent to run the xite's EVX programs. EVX runs sandboxed WebAssembly programs that a xite declares in its `content.json`; see [EVX programs](../build/evx.md). The wrapper inspects the declaration, shows a consent dialog that lists the programs, their capabilities and limits and any scheduled jobs, and acts on the visitor's choice.

**Permission:** none. The visitor decides in the wrapper's dialog.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `program` | string | no | The id of a program the page wants to run once. When it names a usable program that the declaration allows to run once, the dialog offers **Allow once** next to **Enable EVX for this xite** and **Deny**. |

**Returns:** an object.

| Outcome | Response |
| --- | --- |
| Denied, or the dialog was closed | `{"granted": false}` |
| Enabled | `{"granted": true, "mode": "enable"}` |
| Enable refused by the node | `{"granted": false, "mode": "enable", "error": "<reason>"}` |
| Allowed once, and the program ran | `{"granted": true, "mode": "once", "result": <program result>}` |
| Allowed once, but the run failed | `{"granted": true, "mode": "once", "result": null, "error": "<reason>"}` |
| Allow once refused by the node | `{"granted": false, "mode": "once", "error": "<reason>"}` |
| The declaration could not be inspected | `{"error": "<reason>"}`, and no dialog is shown |
| The node is a public gateway | `{"error": "EVX cannot be enabled on a public gateway"}`, and no dialog is shown |

```js
epixFrame.cmd("evxRequest", { program: "resize" }, function (answer) {
  if (answer.error && !answer.granted) return showEvxUnavailable(answer.error);
  if (!answer.granted) return showEvxDeclined();
  if (answer.mode === "once") showResult(answer.result, answer.error);
  else startUsingEvx();
});
```

Notes:

- Use the callback style. In Promise style EpixFrame rejects any result that has an `error` field, which includes the "allowed once, but the run failed" outcome.
- The dialog ignores button clicks during its first 500 milliseconds, and only **Deny** can take keyboard focus, so a key the visitor was already pressing cannot grant anything.
- Enabling also covers later signed updates of the xite from the same publisher within the capabilities and limits shown. When the declaration has usable scheduled jobs, the dialog says that enabling lets them run in the background while no page of the xite is open.
- A page cannot grant, revoke or change EVX consent itself. If a page sends `evxGrant` or `evxRunOnce`, the wrapper shows this same dialog; `evxRevoke` and `evxSetLimits` from a page are answered with an error. To read the current state without a dialog, use [`evxInspect`](xite.md#evxinspect) and [`evxStatus`](xite.md#evxstatus).

## Avatar thumbnails

Profile pictures in xID profiles are ordinary web URLs. The wrapper offers a shared thumbnail service for them: the node keeps a small cache of downscaled avatars that every xite on the node can use, and on a miss a separate sandboxed frame supplied by the node fetches and resizes the image.

The node ships a helper script for this, [`ui/media/epix-avatar.js`](https://github.com/EpixZone/EpixNet/blob/main/ui/media/epix-avatar.js), which you copy into your xite. It wraps both commands below and falls back to the original URL when the service is not available:

```js
// An <img> element, the profile's avatar URL, and the displayed size in pixels (1 to 128):
EpixAvatar.bind(document.querySelector("#avatar"), profile.avatar, 80);

// As a CSS background instead:
EpixAvatar.bind(element, profile.avatar, 48, { background: true });

// Or get the PNG data URL (or null) yourself:
var png = await EpixAvatar.get(profile.avatar, 80, epixFrame);
```

By default the helper uses a global named `Page` as the frame object. Pass your EpixFrame instance as `{ frame: epixFrame }` to `bind`, or as the third argument to `get`, if your xite does not define `Page`.

### wrapperAvatarThumbnailVersion

Detects whether the wrapper offers the avatar thumbnail service and returns the origin to post thumbnail requests to.

**Permission:** none

No parameters.

**Returns:** `{"version": 1, "origin": "<the wrapper's origin>"}`. An older wrapper that does not know the command forwards it to the node, which answers `null`.

```js
var info = await epixFrame.cmd("wrapperAvatarThumbnailVersion");
var available = !!info && info.version === 1;
```

### wrapperGetAvatarThumbnail

Requests a cached thumbnail of a public avatar image. This command does not use the normal response path: the page posts it together with one transferred `MessagePort`, and the wrapper replies on that port. The port ties the reply to the document that asked, so a navigation during the download cannot deliver the image to another page.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | The original image URL, at most 2048 characters. The helper script only sends `http` and `https` URLs without credentials. |
| `size` | integer | yes | The displayed side length in pixels, from `1` to `128`. |

**Returns:** on the transferred port, `{"thumbnail": "<PNG data URL>"}`, or `{"thumbnail": null}` when no thumbnail is available. Sent as an ordinary command without a port, the answer is always `null`.

```js
// What EpixAvatar.get does. Prefer the helper script in a xite.
var info = await epixFrame.cmd("wrapperAvatarThumbnailVersion");
var channel = new MessageChannel();
channel.port1.onmessage = function (event) {
  if (event.data && event.data.thumbnail) img.src = event.data.thumbnail;
  channel.port1.close();
};
window.parent.postMessage(
  { cmd: "wrapperGetAvatarThumbnail", id: 0, wrapper_nonce: epixFrame.wrapper_nonce,
    params: { url: profile.avatar, size: 80 } },
  info.origin,
  [channel.port2]
);
```

Notes and limits:

- The answer is `null` on a public gateway, for a URL or size outside the limits above, when the image cannot be fetched or processed in time, and when too many thumbnail requests are already pending for the page.
- The remote image must be readable across origins (a CORS-enabled response). It is fetched without credentials and without a referrer, redirects are rejected, and the input is limited to 5 MiB and 32 megapixels.
- Cached thumbnails are scoped to the selected user, expire after one day, and are shared by the xites on the node. As with any shared cache, response timing can reveal that an image was requested before.
- A `null` answer is normal. Always keep a fallback, such as showing the original URL or an initial.

## Messages from the wrapper

The wrapper also posts messages to the page on its own. EpixFrame handles the first three itself; the others arrive in `onRequest(cmd, message)` and as the `request` event.

| Message | `params` | Meaning |
| --- | --- | --- |
| `wrapperOpenedWebsocket` | none | The wrapper's connection to the node is open and the page has introduced itself. EpixFrame calls `onOpenWebsocket()`. Sent again after a reconnect, so use it as the cue to load or reload state. |
| `wrapperClosedWebsocket` | none | The connection to the node was lost for more than a moment. EpixFrame calls `onCloseWebsocket()`. The wrapper shows its own "Reconnecting" notice. |
| `ping` | none (the message has an `id`) | A probe sent to a page that has not sent `innerReady` by the time the frame loads. EpixFrame answers with [`response`](#response) and `"pong"`. |
| `wrapperPopState` | `{"href": "<wrapper URL>", "state": <stored state>}` | The visitor moved through the browser history. `state` is the value stored with [`wrapperPushState`](#wrapperpushstate) or [`wrapperReplaceState`](#wrapperreplacestate) for the entry that is now current. |
| `webNotificationClick`, `webNotificationClose` | `{"id": "<id>"}` | See [`wrapperWebNotification`](#wrapperwebnotification). |
| `response` | none (the message has `to` and `result`) | The answer to a command. EpixFrame matches it to your callback or Promise. |

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd === "wrapperPopState") {
    var state = message.params.state || {};   // the first entry of a visit has no state
    epixFrame.history_state = state;
    if (state.view === "topic") renderTopic(state.id);
    else renderHome();
  }
});
```

Messages pushed by the node, such as `setSiteInfo`, travel through the wrapper to the page in the same way. They are described in [Xite and server commands](xite.md#events-pushed-to-the-page).

## Related pages

- [API overview](index.md): message shapes, errors and the command index.
- [The wrapper sandbox](../build/sandbox.md): why the page needs the wrapper for storage, history and requests.
- [Xite anatomy](../build/anatomy.md): the page lifecycle from load to first command.
- [EpixFrame library guide](../libraries/epixframe.md): the helper methods and their exact parameters.
