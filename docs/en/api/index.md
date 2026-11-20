---
description: Overview of the EpixFrame API. How a xite page sends commands to the wrapper and the node, request and response shapes, errors, pushed events, the permission model, and an index of every command.
---

# EpixFrame API reference

The EpixFrame API is the set of commands a xite page can send to EpixNet: read and write files, query the database, sign and publish content, work with the visitor's xID identity, show dialogs, and more. This page explains how commands travel, how to call them, what answers and errors look like, which messages arrive without being asked for, and how permissions limit the command set. It ends with an index of every command. It is written for xite developers. A xite is a site published on EpixNet; see the [glossary](../reference/glossary.md) for other terms.

If you have not built a xite yet, start with the [quickstart](../build/quickstart.md) and [Xite anatomy](../build/anatomy.md), then come back here when you need the details of a command.

## Two layers of commands

Your page never talks to the node directly. It runs in an iframe inside the wrapper, the trusted page the node serves around every xite. The page posts messages to the wrapper with `postMessage`, and the wrapper decides what happens next.

| Layer | Handled by | Examples | Reference |
| --- | --- | --- | --- |
| Wrapper commands | JavaScript in the wrapper page, inside the browser. Nothing is sent to the node, except where a command says so. | `wrapperNotification`, `wrapperConfirm`, `wrapperPushState`, `wrapperGetLocalStorage` | [Wrapper commands](wrapper.md) |
| Node commands | The EpixNet node. The wrapper forwards the message unchanged over its WebSocket and relays the answer back. | `siteInfo`, `fileGet`, `dbQuery`, `sitePublish` | Every other page of this reference |

Three consequences are worth keeping in mind:

- **One connection is shared.** The wrapper and your page use the same WebSocket to the node. Event subscriptions the wrapper makes on that connection also deliver events to your page.
- **The connection is bound to one xite.** Node commands act on the xite the wrapper was opened for. A few commands accept another address, and say what permission that needs.
- **A page cannot bypass the wrapper.** The node refuses WebSocket connections opened from xite content, and the secret that gives the wrapper its authority is never given to the page. See [The wrapper sandbox](../build/sandbox.md).

## Calling a command

The examples in this reference use [EpixFrame](../libraries/epixframe.md), the official JavaScript library, loaded from a local copy in the xite with a script tag. That build defines `window.epixFrame`, a shared instance that is created the first time you read it. If you import the ES module build, `epixFrame` is a function instead: call `epixFrame()` to get the instance.

```html title="index.html"
<script src="js/lib/epixframe.min.js"></script>
<script src="js/app.js"></script>
```

Wait for the `openWebsocket` event before sending node commands. It fires when the wrapper's connection to the node is ready, and again after every reconnect.

```js title="js/app.js"
epixFrame.on("openWebsocket", async function () {
  var info = await epixFrame.cmd("siteInfo");
  document.querySelector("h1").textContent = info.content.title;
});
```

### Promises and callbacks

`cmd(name, params, callback)` has two styles, and they treat errors differently.

=== "Promise"

    Leave out the callback and `cmd` returns a Promise. A result that carries an `error` field rejects it.

    ```js
    try {
      var rows = await epixFrame.cmd("dbQuery", ["SELECT * FROM topic LIMIT 10"]);
      render(rows);
    } catch (result) {
      epixFrame.cmd("wrapperNotification", ["error", result.error]);
    }
    ```

=== "Callback"

    Pass a function as the last argument. It receives the result as is, so you check for the error yourself.

    ```js
    epixFrame.cmd("dbQuery", ["SELECT * FROM topic LIMIT 10"], function (rows) {
      if (rows && rows.error) {
        epixFrame.cmd("wrapperNotification", ["error", rows.error]);
        return;
      }
      render(rows);
    });
    ```

!!! warning "Some commands never answer"
    Several wrapper commands send no response (for example `wrapperNotification` and `wrapperSetTitle`), and a dialog the visitor dismisses never answers either. A Promise for such a command stays pending forever. Do not `await` a command that the reference marks as "no response", and do not make your page's progress depend on a dialog being answered.

### Convenience methods

EpixFrame wraps the most common commands in named methods, for example `epixFrame.siteInfo()`, `epixFrame.fileGet(path)`, `epixFrame.dbQuery(sql, params)` and `epixFrame.notify(type, message)`. Each command in this reference names its helper when one exists. Every helper returns a Promise and sends exactly one command, so `cmd` and the helpers can be mixed freely.

A few helpers send parameters in a different shape than you might expect, and the reference points these out where they matter (see `wrapperSetLocalStorage`, `wrapperPrompt` and `wrapperPermissionAdd`). The full list of helpers is in the [EpixFrame library guide](../libraries/epixframe.md).

### Parameter forms

`params` can be an array, an object, a single string or a number, depending on the command.

- **Wrapper commands** read their parameters exactly as documented, most often as an array.
- **Node commands** usually accept both a positional array and an object with named keys. `["content.json", true]` and `{"inner_path": "content.json", "required": true}` are typically equivalent. The parameter tables in this reference give the name of each parameter and, where the handler reads one, its position in the array form.
- Some options are read only from the object form. The reference says so in the parameter's description.

When you call `cmd` with no parameters, EpixFrame sends an empty object.

## Messages on the wire

You do not need this section to use EpixFrame, but it helps when you debug with the browser console or write your own transport.

**Request**, posted by the page to `window.parent`:

```json
{ "cmd": "fileGet", "params": { "inner_path": "data/data.json" }, "id": 7, "wrapper_nonce": "<nonce from the page URL>" }
```

| Field | Meaning |
| --- | --- |
| `cmd` | The command name. Names are case sensitive. |
| `params` | The parameters, in the form the command expects. |
| `id` | A number you choose, counting up from 1. The answer refers to it. Numbers from 1000000 up are reserved for the wrapper's own commands, and the wrapper does not forward a page message that uses one. |
| `wrapper_nonce` | The value of the `wrapper_nonce` parameter in the page URL. The wrapper requires it only when the xite sets `postmessage_nonce_security` in `content.json`. EpixFrame always sends it. |

**Response**, posted back to the page:

```json
{ "cmd": "response", "to": 7, "result": "{\"posts\": []}" }
```

`to` repeats the request `id`. `result` is whatever the command returns: a string such as `"ok"`, a number, an object, an array or `null`.

**Error**, which is an ordinary response whose result is an object with an `error` string:

```json
{ "cmd": "response", "to": 7, "result": { "error": "You don't have permission to run siteList" } }
```

Rules that follow from this shape:

- **Errors are results.** There is no separate error channel. Some commands also return `{"error": "..."}` as a normal outcome, for example when a name is not found. To your code both look the same.
- **An unknown command returns `null`.** The node logs the name and answers `null` instead of failing, so a misspelled command looks like an empty result. Check the spelling first when a command "returns nothing".
- **A command of a disabled plugin returns `null`** in the same way. `serverInfo().plugins` lists the plugins that are enabled.
- **Each command runs on its own task.** A slow command, such as one waiting for a file or for the visitor to answer a dialog, does not hold up the commands you send after it. Answers can arrive in a different order than the requests.

## Events pushed to the page

Besides answers, your page receives messages it did not ask for. EpixFrame delivers the connection messages through `onOpenWebsocket()` and `onCloseWebsocket()` (events `openWebsocket` and `closeWebsocket`), and everything else through `onRequest(cmd, message)` (event `request`), where the payload is `message.params`.

| Message | Sent by | Meaning | Details |
| --- | --- | --- | --- |
| `wrapperOpenedWebsocket` | Wrapper | The connection to the node is open. Sent once per page load and again after a reconnect. | [Messages from the wrapper](wrapper.md#messages-from-the-wrapper) |
| `wrapperClosedWebsocket` | Wrapper | The connection to the node was lost. | [Messages from the wrapper](wrapper.md#messages-from-the-wrapper) |
| `wrapperPopState` | Wrapper | The visitor used the browser's back or forward button. | [Messages from the wrapper](wrapper.md#messages-from-the-wrapper) |
| `webNotificationClick`, `webNotificationClose` | Wrapper | The visitor clicked or closed a notification raised with `wrapperWebNotification`. | [wrapperWebNotification](wrapper.md#wrapperwebnotification) |
| `setSiteInfo` | Node | Something about a xite changed: a file arrived, peers were found, content was signed, the identity changed. | [Events pushed to the page](xite.md#events-pushed-to-the-page) |
| `setServerInfo` | Node | Node state changed. | [Events pushed to the page](xite.md#events-pushed-to-the-page) |
| `setAnnouncerInfo` | Node | Tracker announce progress changed. Needs the `announcerChanged` channel. | [Events pushed to the page](xite.md#events-pushed-to-the-page) |
| `setServerErrors` | Node | The node logged an error. Meant for the Dashboard; other xites can ignore it. | [Events pushed to the page](xite.md#events-pushed-to-the-page) |

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd === "setSiteInfo" && message.params.event && message.params.event[0] === "file_done") {
    reloadData(message.params.event[1]);
  }
});
```

Other commands push their own messages once you use them, such as `channelEvent` after `channelSubscribe` ([Messaging commands](messaging.md)) and `logLineAdd` after `consoleLogStream` ([Admin commands](admin.md)). The wrapper forwards any pushed message it does not handle itself to your page.

Some pushed messages are consumed by the wrapper and never reach the page: node notifications, progress toasts, confirmation and prompt dialogs raised by the node, and redirects. The node accepts an answer to one of its dialogs only from the wrapper, so a page cannot confirm a dialog on the visitor's behalf.

## Permissions in brief

A xite starts with no permissions. What a command needs is stated on its **Permission** line.

| Permission line | Meaning |
| --- | --- |
| none | Any page can call it. Node commands act on the page's own xite. |
| none, with a condition | No permission to request, but something must be true: the visitor confirms a dialog, an xID identity is selected, or the node holds the xite's key. |
| `ADMIN` | Node administration. Refused with `You don't have permission to run <command>` unless the visitor granted the xite `ADMIN`. The Dashboard is the xite that normally holds it. |
| `Merger:<type>`, `CHANNELS`, `Channels:<app>`, `LOCAL_PROFILE` | A specific permission the visitor grants to the xite. |
| wrapper only | Sent by the wrapper itself after the visitor acted in a wrapper dialog (or by the node operator's local admin socket). A page cannot run it, with or without `ADMIN`. |

How a xite gets a permission:

1. The page asks with [`wrapperPermissionAdd`](wrapper.md#wrapperpermissionadd) (or [`corsPermission`](files.md#corspermission) for another xite's files).
2. The wrapper shows a prompt that the page cannot script. Only a real click on **Grant** sends the grant to the node, from the wrapper's own command range.
3. The node stores the permission, and it appears in `siteInfo().settings.permissions`.

On a public gateway (a node running in restricted mode, visible as `serverInfo().ui_restrict`) the rules are tighter: no permission can be granted, commands that write or sign need the gateway itself to own the xite, and only a read-only subset of the `ADMIN` commands answers.

The full model, including what the sandbox prevents and how origins work, is in [The wrapper sandbox](../build/sandbox.md).

## Naming

EpixNet calls a published site a xite, and these docs do too. The API keeps older names so existing xites continue to work:

- Command names use `site`, as in `siteInfo`, `sitePublish` and `mergerSiteAdd`. So do pushed messages (`setSiteInfo`) and the `siteChanged` event channel.
- Identity commands and fields use `cert`, as in `certXid` and `cert_user_id`. They refer to the visitor's [xID](../start/xid.md) identity. Provider-issued certificates no longer exist.
- A few commands exist under two spellings (`optionalHelp` and `OptionalHelp`, for example). Both are listed in the index.

Use the names exactly as written in this reference.

## Reference pages

<div class="grid cards" markdown>

-   :material-window-maximize:{ .lg .middle } **[Wrapper commands](wrapper.md)**

    ---

    Notifications, dialogs, title, history, storage, permission requests and other commands the wrapper handles in the browser.

-   :material-information-outline:{ .lg .middle } **[Xite and server commands](xite.md)**

    ---

    `siteInfo`, `serverInfo`, updating, cloning, signing, publishing, and the events the node pushes.

-   :material-file-outline:{ .lg .middle } **[File commands](files.md)**

    ---

    Reading, writing and listing files, optional files and big files.

-   :material-database-outline:{ .lg .middle } **[Database commands](database.md)**

    ---

    Querying the SQL database the node builds from the xite's JSON files.

-   :material-account-key-outline:{ .lg .middle } **[Identity and cryptography commands](identity.md)**

    ---

    xID identities, name resolution, per-user settings, encryption, signatures and the chain randomness beacon.

-   :material-source-merge:{ .lg .middle } **[Merger, feed and search commands](merger.md)**

    ---

    Merger xites, newsfeed follows, derived feeds and notifications.

-   :material-message-lock-outline:{ .lg .middle } **[Messaging commands](messaging.md)**

    ---

    Channels for private messaging, and local profiles for public posts and private groups.

-   :material-shield-crown-outline:{ .lg .middle } **[Admin commands](admin.md)**

    ---

    Commands that need `ADMIN` or wrapper authority: node configuration, xite management, logs and more.

</div>

## Command index

Every command, in alphabetical order. The **Permission** column is a summary; the linked entry has the exact rule.

| Label | Meaning |
| --- | --- |
| None | No permission needed. |
| None (user confirms) | The wrapper asks the visitor before anything happens. |
| None (signing key needed), None (identity needed), None (owner or valid signer) | No permission to request, but the node needs a key or a selected xID identity to do the work. |
| None (browser permission) | The browser asks the visitor for its own notification permission. |
| None for the bound xite | Free for the page's own xite. Naming another xite needs `ADMIN` or the permission given in the entry. |
| `ADMIN` and other names in code style | The visitor must have granted the xite that permission. |
| Wrapper only | A page cannot run it. |

| Command | Purpose | Permission | Reference |
| --- | --- | --- | --- |
| `aesDecrypt` | Decrypt AES ciphertext. | None | [Identity](identity.md#aesdecrypt) |
| `aesEncrypt` | Encrypt text with AES. | None | [Identity](identity.md#aesencrypt) |
| `announcerInfo` | Tracker announce statistics for the bound xite. | None | [Xite](xite.md#announcerinfo) |
| `announcerStats` | Per-tracker announce status for the whole node. | `ADMIN` | [Admin](admin.md#announcerstats) |
| `as` | Run a command in the context of another xite. | None for the bound xite | [Admin](admin.md#as) |
| `avatarCacheGet` | Read the node's avatar thumbnail cache. | Wrapper only | [Admin](admin.md#avatarcacheget) |
| `avatarCachePut` | Store a processed avatar thumbnail. | Wrapper only | [Admin](admin.md#avatarcacheput) |
| `badCert` | Mark a certificate signature as bad. | None | [Identity](identity.md#badcert) |
| `bigfileUploadInit` | Start a big file upload and get the upload URL. | None (owner or valid signer) | [Files](files.md#bigfileuploadinit) |
| `certAdd` | Deprecated; always returns an error. | None | [Identity](identity.md#certadd) |
| `certList` | Legacy: list identities as certificate rows. | `ADMIN` | [Admin](admin.md#certlist) |
| `certSelect` | Legacy entry point to the identity picker. | None | [Identity](identity.md#certselect) |
| `certSet` | Legacy: browse anonymously or inherit the default identity. | `ADMIN` | [Admin](admin.md#certset) |
| `certXid` | Run the xID identity picker or select a named identity. | None | [Identity](identity.md#certxid) |
| `channelContacts` | List the peers the identity has threads with. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelcontacts) |
| `channelConversation` | Read the messages of one conversation. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelconversation) |
| `channelDeleteLocal` | Delete a conversation from this node only. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channeldeletelocal) |
| `channelIdentitySetEnabled` | Turn channels on or off for an identity. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelidentitysetenabled) |
| `channelIdentitySetup` | Run the channel setup job for an identity. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelidentitysetup) |
| `channelIdentityStatus` | Read the channel status of the identity in scope. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelidentitystatus) |
| `channelJoin` | Subscribe the connection to pushed event channels. | None | [Xite](xite.md#channeljoin) |
| `channelJoinAllsite` | Subscribe to event channels for every xite. | `ADMIN` | [Admin](admin.md#channeljoinallsite) |
| `channelKeyBundlePublish` | Build and publish the identity's channel key bundle. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelkeybundlepublish) |
| `channelKeyLookup` | Check whether xIDs have a usable published key bundle. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelkeylookup) |
| `channelMarkRead` | Mark a conversation read or unread. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelmarkread) |
| `channelMigrateLegacy` | Import pre-channel Epix Mail messages. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelmigratelegacy) |
| `channelRlnStatus` | Read the anonymous rate-limit status. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelrlnstatus) |
| `channelSearch` | Search the identity's private message index. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsearch) |
| `channelSend` | Seal and queue a private message. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsend) |
| `channelSent` | List the identity's own sent messages. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsent) |
| `channelSessionInfo` | Read the channel session state for the calling xite. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsessioninfo) |
| `channelSetConvState` | Star or archive a conversation. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsetconvstate) |
| `channelSubscribe` | Receive `channelEvent` pushes for the acting identity. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelsubscribe) |
| `channelThreads` | List conversation threads. | `CHANNELS` or `Channels:<app>` | [Messaging](messaging.md#channelthreads) |
| `chartDbQuery` | Query the node's network statistics database. | `ADMIN` | [Admin](admin.md#chartdbquery) |
| `chartGetPeerLocations` | Geolocated peer positions for the world map. | `ADMIN` | [Admin](admin.md#chartgetpeerlocations) |
| `configList` | List the editable node configuration keys. | `ADMIN` | [Admin](admin.md#configlist) |
| `configSet` | Change one node configuration value. | `ADMIN` | [Admin](admin.md#configset) |
| `consoleLogRead` | Read recent formatted log lines. | `ADMIN` | [Admin](admin.md#consolelogread) |
| `consoleLogStream` | Open a live log stream. | `ADMIN` | [Admin](admin.md#consolelogstream) |
| `consoleLogStreamRemove` | Close a live log stream. | `ADMIN` | [Admin](admin.md#consolelogstreamremove) |
| `corsPermission` | Ask the user for read access to another xite's files. | None (user confirms) | [Files](files.md#corspermission) |
| `dbQuery` | Run a read query against the xite's database. | None | [Database](database.md#dbquery) |
| `dbRebuild` | Rebuild a xite's database from its files. | `ADMIN` | [Admin](admin.md#dbrebuild) |
| `dbReload` | Reload a xite's database schema. | `ADMIN` | [Admin](admin.md#dbreload) |
| `dirList` | List one directory, optionally with size and type. | None | [Files](files.md#dirlist) |
| `eccPrivToPub` | Convert a private key to its public key. | None | [Identity](identity.md#eccprivtopub) |
| `eccPubToAddr` | Convert a public key to its `epix1` address. | None | [Identity](identity.md#eccpubtoaddr) |
| `ecdsaSign` | Sign data with a given key or the xite identity key. | None | [Identity](identity.md#ecdsasign) |
| `ecdsaVerify` | Verify a signature against an address. | None | [Identity](identity.md#ecdsaverify) |
| `eciesDecrypt` | Decrypt ECIES ciphertext with the user's per-xite key. | None | [Identity](identity.md#eciesdecrypt) |
| `eciesEncrypt` | Encrypt text to a public key (ECIES). | None | [Identity](identity.md#eciesencrypt) |
| `evxGrant` | Record EVX consent or mint a run-once token. | Wrapper only | [Admin](admin.md#evxgrant) |
| `evxInspect` | Read the xite's EVX declaration and grant state without running anything. | None | [Xite](xite.md#evxinspect) |
| `evxJobPause` | Pause an EVX scheduled job. | Wrapper only | [Admin](admin.md#evxjobpause) |
| `evxJobResume` | Resume an EVX scheduled job. | Wrapper only | [Admin](admin.md#evxjobresume) |
| `evxRecoverWorkspace` | Reconcile interrupted EVX workspace writes. | Wrapper only | [Admin](admin.md#evxrecoverworkspace) |
| `evxRequest` | Ask the user to enable EVX programs for the xite, or to run one once. | None (user confirms) | [Wrapper](wrapper.md#evxrequest) |
| `evxRevoke` | Disable a xite's EVX grant. | Wrapper only | [Admin](admin.md#evxrevoke) |
| `evxRunJob` | Run an EVX job's current occurrence now. | Wrapper only | [Admin](admin.md#evxrunjob) |
| `evxRunOnce` | Run one EVX program now. | Wrapper only | [Admin](admin.md#evxrunonce) |
| `evxSetLimits` | Adjust the limits of an EVX grant. | Wrapper only | [Admin](admin.md#evxsetlimits) |
| `evxStatus` | Read the xite's EVX grant, recent runs, jobs and scheduler state. | None | [Xite](xite.md#evxstatus) |
| `feedFollow` | Save the xite's newsfeed queries. | None | [Merger and feeds](merger.md#feedfollow) |
| `feedGalleryRollup` | Read comment and reaction counts for many items at once. | None | [Merger and feeds](merger.md#feedgalleryrollup) |
| `feedItemQuery` | Read the records and reaction counts attached to a feed target. | None | [Merger and feeds](merger.md#feeditemquery) |
| `feedListFollow` | Read the xite's saved newsfeed queries. | None | [Merger and feeds](merger.md#feedlistfollow) |
| `feedQuery` | Run every followed xite's feed queries. | `ADMIN` | [Admin](admin.md#feedquery) |
| `feedSearch` | Search the feeds of every served xite. | `ADMIN` | [Admin](admin.md#feedsearch) |
| `feedSegmentSearch` | Search a derived feed's sealed segments. | None | [Merger and feeds](merger.md#feedsegmentsearch) |
| `fileDelete` | Delete a file. | None | [Files](files.md#filedelete) |
| `fileGet` | Read a file as text or base64. | None | [Files](files.md#fileget) |
| `fileList` | Recursively list the files under a directory. | None | [Files](files.md#filelist) |
| `fileNeed` | Download a required or optional file on demand. | None | [Files](files.md#fileneed) |
| `fileQuery` | Query rows from JSON files in a directory. | None | [Files](files.md#filequery) |
| `fileRules` | Read the signing and size rules that apply to a path. | None | [Files](files.md#filerules) |
| `fileTransferStats` | Live per-peer transfer statistics for a file being fetched. | None | [Files](files.md#filetransferstats) |
| `fileWrite` | Write a file from base64 content. | None | [Files](files.md#filewrite) |
| `fileWriteSign` | Atomically replace a file and sign its `content.json`. | None (signing key needed) | [Files](files.md#filewritesign) |
| `FilterIncludeList` | Compatibility stub; always returns an empty array. | None | [Identity](identity.md#filterincludelist) |
| `filterIncludeList` | Alias of `FilterIncludeList`. | None | [Identity](identity.md#filterincludelist) |
| `getTrackers` | List the trackers the node announces to. | None | [Xite](xite.md#gettrackers) |
| `identityDiscover` | Find xID names the chain links to the user's addresses. | None | [Identity](identity.md#identitydiscover) |
| `identityLinkComplete` | Record an identity once the chain shows it linked. | None | [Identity](identity.md#identitylinkcomplete) |
| `identityLinkStart` | Begin linking a new identity address to an xID name. | None | [Identity](identity.md#identitylinkstart) |
| `identityList` | List the linked xID identities and this xite's selection. | None | [Identity](identity.md#identitylist) |
| `identityRemove` | Forget a linked identity. | `ADMIN` | [Admin](admin.md#identityremove) |
| `identitySelect` | Choose the identity the xite acts as. | None | [Identity](identity.md#identityselect) |
| `identitySetDefault` | Set the node-wide default identity. | `ADMIN` | [Admin](admin.md#identitysetdefault) |
| `innerLoaded` | Legacy name of `wrapperInnerLoaded`. | None | [Wrapper](wrapper.md#innerloaded) |
| `innerLoadState` | Internal: the node's waiting placeholder reports that the xite is still downloading. | None | [Wrapper](wrapper.md#innerloadstate) |
| `innerReady` | Handshake that tells the wrapper the page's frame library is listening. | None | [Wrapper](wrapper.md#innerready) |
| `localProfileCreate` | Create or update the local profile. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofilecreate) |
| `localProfileGroupCreate` | Create a private group. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofilegroupcreate) |
| `localProfileInfo` | Read the state of the xite's local profile. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofileinfo) |
| `localProfileLinkXid` | Link the local profile to the selected xID identity. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofilelinkxid) |
| `localProfileList` | List verified profiles, messages and groups. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofilelist) |
| `localProfileOpen` | Decrypt and verify one sealed envelope. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofileopen) |
| `localProfilePublicPost` | Publish a signed public message. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofilepublicpost) |
| `localProfileSeal` | Encrypt and publish a private group message. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofileseal) |
| `localProfileVerify` | Verify one signed record. | `LOCAL_PROFILE` | [Messaging](messaging.md#localprofileverify) |
| `mergerSiteAdd` | Add xites to the node and merge them into this merger. | `Merger:<type>` | [Merger and feeds](merger.md#mergersiteadd) |
| `mergerSiteDelete` | Remove merged xites from the node. | `Merger:<type>` | [Merger and feeds](merger.md#mergersitedelete) |
| `mergerSiteList` | List the xites merged into this merger xite. | `Merger:<type>` | [Merger and feeds](merger.md#mergersitelist) |
| `muteAdd` | Add an author to the node-wide mute list. | None | [Identity](identity.md#muteadd) |
| `muteList` | Read the node-wide list of muted authors. | `ADMIN` | [Admin](admin.md#mutelist) |
| `muteRemove` | Remove an author from the node-wide mute list. | None | [Identity](identity.md#muteremove) |
| `networkRetry` | Retry work that is waiting on the network. | None for the bound xite | [Admin](admin.md#networkretry) |
| `notificationCount` | Aggregate unread notification total. | `ADMIN` | [Admin](admin.md#notificationcount) |
| `notificationDismiss` | Mark a notification of any xite as seen. | `ADMIN` | [Admin](admin.md#notificationdismiss) |
| `notificationDismissSelf` | Mark one of the xite's own notifications as seen. | None | [Merger and feeds](merger.md#notificationdismissself) |
| `notificationList` | Read the xite's saved notification queries. | None | [Merger and feeds](merger.md#notificationlist) |
| `notificationMute` | Mute or unmute notifications. | `ADMIN` | [Admin](admin.md#notificationmute) |
| `notificationMuteStatus` | Read the notification mute state. | `ADMIN` | [Admin](admin.md#notificationmutestatus) |
| `notificationQuery` | Notification counts across subscribed xites. | `ADMIN` | [Admin](admin.md#notificationquery) |
| `notificationSubscribe` | Save the xite's notification queries. | None | [Merger and feeds](merger.md#notificationsubscribe) |
| `optionalFileDelete` | Delete a downloaded optional file from local storage. | None for the bound xite | [Files](files.md#optionalfiledelete) |
| `optionalFileInfo` | Read the record of one optional file. | None | [Files](files.md#optionalfileinfo) |
| `optionalFileList` | List optional files with filters and ordering. | None for the bound xite | [Files](files.md#optionalfilelist) |
| `optionalFilePin` | Pin optional files so cleanup never removes them. | None for the bound xite | [Files](files.md#optionalfilepin) |
| `optionalFileUnpin` | Remove the pin from optional files. | None for the bound xite | [Files](files.md#optionalfileunpin) |
| `OptionalHelp` | Alias of `optionalHelp`. | None for the bound xite | [Files](files.md#optionalhelp) |
| `optionalHelp` | Help distribute the optional files under a directory. | None for the bound xite | [Files](files.md#optionalhelp) |
| `OptionalHelpAll` | Alias of `optionalHelpAll`. | None for the bound xite | [Files](files.md#optionalhelpall) |
| `optionalHelpAll` | Turn automatic download of all new optional files on or off. | None for the bound xite | [Files](files.md#optionalhelpall) |
| `OptionalHelpList` | Alias of `optionalHelpList`. | None for the bound xite | [Files](files.md#optionalhelplist) |
| `optionalHelpList` | List the directories being helped. | None for the bound xite | [Files](files.md#optionalhelplist) |
| `OptionalHelpRemove` | Alias of `optionalHelpRemove`. | None for the bound xite | [Files](files.md#optionalhelpremove) |
| `optionalHelpRemove` | Stop helping distribute a directory. | None for the bound xite | [Files](files.md#optionalhelpremove) |
| `optionalLimitSet` | Set the node-wide optional file storage cap. | `ADMIN` | [Admin](admin.md#optionallimitset) |
| `optionalLimitStats` | Read node-wide optional file storage usage. | `ADMIN` | [Admin](admin.md#optionallimitstats) |
| `peerAdd` | Add a peer to a xite manually. | `ADMIN` | [Admin](admin.md#peeradd) |
| `permissionAdd` | Grant a permission to the bound xite. | Wrapper only | [Admin](admin.md#permissionadd) |
| `permissionDetails` | Get the description shown in the permission prompt. | `ADMIN` | [Admin](admin.md#permissiondetails) |
| `permissionRemove` | Revoke a permission from the bound xite. | `ADMIN` | [Admin](admin.md#permissionremove) |
| `ping` | Liveness check; returns `"Pong!"`. | None | [Xite](xite.md#ping) |
| `pluginConfigSet` | Enable or disable a plugin. | `ADMIN` | [Admin](admin.md#pluginconfigset) |
| `pluginList` | List plugins and their state. | `ADMIN` | [Admin](admin.md#pluginlist) |
| `recordSign` | Sign one merge-file record with the user's identity key. | None (identity needed) | [Identity](identity.md#recordsign) |
| `resolveStatus` | Progress of an on-demand `.epix` name lookup. | None | [Xite](xite.md#resolvestatus) |
| `response` | Reply frame; from a page it only answers the wrapper's `ping` probe. | None | [Wrapper](wrapper.md#response) |
| `serverErrors` | Read recent node log lines. | `ADMIN` | [Admin](admin.md#servererrors) |
| `serverGetWrapperNonce` | Issue a single-use wrapper nonce. | `ADMIN` | [Admin](admin.md#servergetwrappernonce) |
| `serverInfo` | Node version, platform, network status, settings and chain endpoints. | None | [Xite](xite.md#serverinfo) |
| `serverPortcheck` | Check whether the file server port is reachable. | `ADMIN` | [Admin](admin.md#serverportcheck) |
| `serverShowdirectory` | Open a data folder in the system file manager. | `ADMIN` | [Admin](admin.md#servershowdirectory) |
| `serverShutdown` | Stop or restart the node. | `ADMIN` | [Admin](admin.md#servershutdown) |
| `serverUpdate` | Explains that the node updates through its installer. | `ADMIN` | [Admin](admin.md#serverupdate) |
| `sidebarGetHtmlTag` | Render the sidebar panel for the bound xite. | `ADMIN` | [Admin](admin.md#sidebargethtmltag) |
| `sidebarGetPeers` | Peer positions for the sidebar globe. | `ADMIN` | [Admin](admin.md#sidebargetpeers) |
| `siteAdd` | Start serving and downloading a xite by address. | `ADMIN` | [Admin](admin.md#siteadd) |
| `siteBadFiles` | List files that are still missing or failed to download. | None | [Xite](xite.md#sitebadfiles) |
| `siteblockAdd` | Add a xite address to the blocklist. | `ADMIN` | [Admin](admin.md#siteblockadd) |
| `siteblockGet` | Read the blocklist entry for one address. | `ADMIN` | [Admin](admin.md#siteblockget) |
| `siteblockIgnoreAddSite` | Unblock a xite address so it can be added. | `ADMIN` | [Admin](admin.md#siteblockignoreaddsite) |
| `siteblockList` | Read the xite blocklist. | `ADMIN` | [Admin](admin.md#siteblocklist) |
| `siteblockRemove` | Remove a xite address from the blocklist. | `ADMIN` | [Admin](admin.md#siteblockremove) |
| `siteClone` | Create a new xite from a served xite's template, or upgrade an existing clone. | None | [Xite](xite.md#siteclone) |
| `siteDelete` | Remove a xite and delete its files. | `ADMIN` | [Admin](admin.md#sitedelete) |
| `siteDownloadOptionalPrevious` | Download the currently missing optional files once. | `ADMIN` | [Admin](admin.md#sitedownloadoptionalprevious) |
| `siteFavourite` | Mark a xite as a favourite. | `ADMIN` | [Admin](admin.md#sitefavourite) |
| `siteInfo` | Everything the node knows about the bound xite, including the current identity. | None | [Xite](xite.md#siteinfo) |
| `siteList` | List every xite the node serves. | `ADMIN` | [Admin](admin.md#sitelist) |
| `siteListModifiedFiles` | List files that differ from the signed `content.json`. | None | [Xite](xite.md#sitelistmodifiedfiles) |
| `sitePause` | Pause a xite. | `ADMIN` | [Admin](admin.md#sitepause) |
| `sitePublish` | Sign (optionally) and push a `content.json` to peers. | None (signing key needed) | [Xite](xite.md#sitepublish) |
| `siteRecoverPrivatekey` | Recover the xite's private key from the master seed. | `ADMIN` | [Admin](admin.md#siterecoverprivatekey) |
| `siteReload` | Re-check the bound xite for a newer `content.json`. | `ADMIN` | [Admin](admin.md#sitereload) |
| `siteResume` | Resume a paused xite. | `ADMIN` | [Admin](admin.md#siteresume) |
| `siteSetAutodownloadBigfileLimit` | Set the largest big file downloaded automatically. | `ADMIN` | [Admin](admin.md#sitesetautodownloadbigfilelimit) |
| `siteSetAutodownloadoptional` | Turn automatic download of new optional files on or off. | `ADMIN` | [Admin](admin.md#sitesetautodownloadoptional) |
| `siteSetDownloadoptional` | Allow or disallow on-demand optional file fetching. | `ADMIN` | [Admin](admin.md#sitesetdownloadoptional) |
| `siteSetLimit` | Set the bound xite's size limit. | `ADMIN` | [Admin](admin.md#sitesetlimit) |
| `siteSetOwned` | Claim or relinquish ownership of the bound xite. | `ADMIN` | [Admin](admin.md#sitesetowned) |
| `siteSetSettingsValue` | Set a whitelisted per-xite setting. | `ADMIN` | [Admin](admin.md#sitesetsettingsvalue) |
| `siteSign` | Sign the `content.json` that governs a path. | None (signing key needed) | [Xite](xite.md#sitesign) |
| `siteSignMessage` | Sign a message with the xite's own key. | `ADMIN` | [Admin](admin.md#sitesignmessage) |
| `siteUnfavourite` | Clear a xite's favourite mark. | `ADMIN` | [Admin](admin.md#siteunfavourite) |
| `siteUpdate` | Start a background check for a newer version of a xite. | None | [Xite](xite.md#siteupdate) |
| `userGetGlobalSettings` | Read the user's node-wide UI settings. | None | [Identity](identity.md#usergetglobalsettings) |
| `userGetSettings` | Read the xite's private per-user settings. | None | [Identity](identity.md#usergetsettings) |
| `userList` | List known users (Multiuser plugin). | `ADMIN` | [Admin](admin.md#userlist) |
| `userLogin` | Add or select a user from a master seed (Multiuser plugin). | `ADMIN` | [Admin](admin.md#userlogin) |
| `userLogout` | Revert to the primary user (Multiuser plugin). | `ADMIN` | [Admin](admin.md#userlogout) |
| `userPublickey` | Get the user's per-xite encryption public key. | None | [Identity](identity.md#userpublickey) |
| `userSet` | Switch the active user (Multiuser plugin). | `ADMIN` | [Admin](admin.md#userset) |
| `userSetGlobalSettings` | Store the user's node-wide UI settings. | `ADMIN` | [Admin](admin.md#usersetglobalsettings) |
| `userSetSettings` | Store the xite's private per-user settings. | None | [Identity](identity.md#usersetsettings) |
| `userSetSitePrivatekey` | Save a private key as the xite's signing key. | `ADMIN` | [Admin](admin.md#usersetsiteprivatekey) |
| `userShowMasterSeed` | Reveal the active user's master seed (Multiuser plugin). | `ADMIN` | [Admin](admin.md#usershowmasterseed) |
| `vrfDeriveRandom` | Derive deterministic values from a beacon and a seed. | None | [Identity and crypto](identity.md#vrfderiverandom) |
| `vrfGetBeacon` | Read the chain randomness beacon at a block height. | None | [Identity and crypto](identity.md#vrfgetbeacon) |
| `vrfInvalidateCache` | Compatibility no-op; returns `"ok"`. | None | [Identity and crypto](identity.md#vrfinvalidatecache) |
| `vrfLatestBeacon` | Read the randomness beacon one block below the latest height. | None | [Identity and crypto](identity.md#vrflatestbeacon) |
| `vrfMultiBlockBeacon` | Combine randomness over a window of blocks. | None | [Identity and crypto](identity.md#vrfmultiblockbeacon) |
| `wrapperAvatarThumbnailVersion` | Detect the wrapper's avatar thumbnail service. | None | [Wrapper](wrapper.md#wrapperavatarthumbnailversion) |
| `wrapperCloseWebNotification` | Close a notification opened with `wrapperWebNotification`. | None | [Wrapper](wrapper.md#wrapperclosewebnotification) |
| `wrapperConfirm` | Show a confirmation dialog and return the button the user chose. | None | [Wrapper](wrapper.md#wrapperconfirm) |
| `wrapperGetAjaxKey` | Get the key that lets the sandboxed page fetch its own files. | None | [Wrapper](wrapper.md#wrappergetajaxkey) |
| `wrapperGetAvatarThumbnail` | Get a cached thumbnail of a public avatar image. | None | [Wrapper](wrapper.md#wrappergetavatarthumbnail) |
| `wrapperGetLocalStorage` | Read the xite's per-identity storage kept by the wrapper. | None | [Wrapper](wrapper.md#wrappergetlocalstorage) |
| `wrapperGetState` | Read the current browser history state. | None | [Wrapper](wrapper.md#wrappergetstate) |
| `wrapperInnerLoaded` | Applies the wrapper URL's `#hash` to the page so anchors work. | None | [Wrapper](wrapper.md#wrapperinnerloaded) |
| `wrapperNotification` | Show a notification toast in the wrapper. | None | [Wrapper](wrapper.md#wrappernotification) |
| `wrapperOpenWindow` | Open a URL in a new browser window or tab. | None | [Wrapper](wrapper.md#wrapperopenwindow) |
| `wrapperPermissionAdd` | Ask the user to grant the xite a permission. | None (user confirms) | [Wrapper](wrapper.md#wrapperpermissionadd) |
| `wrapperProgress` | Show or update a progress toast. | None | [Wrapper](wrapper.md#wrapperprogress) |
| `wrapperPrompt` | Show an input dialog and return the typed value. | None | [Wrapper](wrapper.md#wrapperprompt) |
| `wrapperPushState` | Push a browser history entry and update the address bar. | None | [Wrapper](wrapper.md#wrapperpushstate) |
| `wrapperReload` | Reload the whole wrapper page. | None | [Wrapper](wrapper.md#wrapperreload) |
| `wrapperReplaceState` | Replace the current browser history entry. | None | [Wrapper](wrapper.md#wrapperreplacestate) |
| `wrapperRequestFullscreen` | Put the xite frame in browser fullscreen. | None | [Wrapper](wrapper.md#wrapperrequestfullscreen) |
| `wrapperSetLocalStorage` | Write the xite's per-identity storage kept by the wrapper. | None | [Wrapper](wrapper.md#wrappersetlocalstorage) |
| `wrapperSetTitle` | Set the browser tab title. | None | [Wrapper](wrapper.md#wrappersettitle) |
| `wrapperSetViewport` | Set the viewport meta tag of the top-level page. | None | [Wrapper](wrapper.md#wrappersetviewport) |
| `wrapperWebNotification` | Show an operating system notification. | None (browser permission) | [Wrapper](wrapper.md#wrapperwebnotification) |
| `xidClearCache` | Clear every xID resolution cache. | `ADMIN` | [Admin](admin.md#xidclearcache) |
| `xidInvalidateCache` | Drop the cached lookup for one address. | None | [Identity](identity.md#xidinvalidatecache) |
| `xidResolve` | Resolve an identity address or a name to its xID record. | None | [Identity](identity.md#xidresolve) |
| `xidResolveBatch` | Resolve up to 50 addresses or names in one call. | None | [Identity](identity.md#xidresolvebatch) |
| `xidResolveIdentity` | Alias of `xidResolve`. | None | [Identity](identity.md#xidresolveidentity) |
| `xidResolveName` | Resolve a chain name to its verified owner, identities and records. | None | [Identity](identity.md#xidresolvename) |
