---
description: Reference for the EpixFrame commands that manage merger xites and their hubs, save newsfeed follows, query derived feeds and register notification counts.
---

# Merger, feed and search commands

These node commands let a xite combine data from other xites, tell the Dashboard what the visitor follows, read the derived feed layer and report unread counts. This page documents each command for xite developers. A xite is a site published on EpixNet; command names keep the older word "site" for compatibility. For how commands travel and how answers and errors are shaped, read the [API overview](index.md) first.

The concepts behind these commands are explained in the guides: [Merger xites and hubs](../build/merger-hubs.md) and [Feeds, notifications and search](../build/feeds-search.md). This page is the per-command reference.

All of these commands are forwarded by the wrapper to the node and act on the xite the page belongs to (the "bound xite"). The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance, and assume the `openWebsocket` event has fired.

| Area | Commands | Who reads the result |
| --- | --- | --- |
| [Merger xites](#merger-xites) | `mergerSiteList`, `mergerSiteAdd`, `mergerSiteDelete` | Your page |
| [Newsfeed follows](#newsfeed-follows) | `feedFollow`, `feedListFollow` | The Dashboard, through `feedQuery` |
| [Derived feeds](#derived-feeds) | `feedItemQuery`, `feedGalleryRollup`, `feedSegmentSearch` | Your page |
| [Notifications](#notifications) | `notificationSubscribe`, `notificationList`, `notificationDismissSelf` | The wrapper badge and the Dashboard, through `notificationQuery` |

The commands that read across every xite on the node (`feedQuery`, `feedSearch`, `notificationQuery` and the other notification management commands) need `ADMIN` and are documented in [Admin commands](admin.md#feeds-and-notifications-across-xites).

## Merger xites

A merger xite is an application that reads and writes data stored in other xites, called hubs. A hub declares a `merged_type` in its `content.json`, and the merger holds the matching `Merger:<type>` permission. The visitor grants that permission through [`wrapperPermissionAdd`](wrapper.md#wrapperpermissionadd).

All three commands fail with `Not a merger xite` while the bound xite holds no `Merger:<type>` permission. A page that boots while its own xite is still downloading can see this error briefly, so treat it as "not ready yet" and retry.

Once the permission is held, file commands accept paths of the form `merged-<type>/<hub address>/<inner path>`. See [File commands](files.md) and the [merger guide](../build/merger-hubs.md).

### mergerSiteList

Returns the hubs on this node that the bound xite may merge: every served xite whose `content.json` declares a `merged_type` that matches one of the bound xite's `Merger:<type>` permissions.

**Permission:** `Merger:<type>`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query_site_info` | boolean | no | Send it as the bare value or as the first element of an array. When `true`, each value in the result is the hub's full `siteInfo` object. Default: `false`. The node does not read a named-object form of this parameter. |

**Returns:** an object keyed by hub address.

- With `false`, each value is the hub's `merged_type` string: `{"<hub address>": "<type>"}`.
- With `true`, each value is the same object [`siteInfo`](xite.md#siteinfo) returns for that hub.

The object is empty when no matching hub is on the node.

```js
// Which hubs are here, and what are they called?
var hubs = await epixFrame.mergerSiteList(true);
for (var address in hubs) {
  console.log(address, hubs[address].content.title, hubs[address].peers);
}
```

Errors: `Not a merger xite`.

### mergerSiteAdd

Adds one or more hubs to the node and links them into the bound xite's merged database. The command answers at once and the download continues in the background.

**Permission:** `Merger:<type>`

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| addresses | string or array of strings | yes | One hub address as a bare string, or several as an array. The node also accepts `[[address, ...]]`, `{"addresses": [...]}` and `{"address": "..."}`. |

**Returns:** `"ok"`, as soon as the request is accepted. It does not mean a hub has arrived.

```js
epixFrame.on("request", function (cmd, message) {
  var info = message.params;
  if (cmd !== "setSiteInfo" || !info.event) return;
  if (info.event[0] === "site_done" && info.event[1] === hubAddress) {
    // The add is over, successful or not. Check what actually arrived.
    refreshHubs();
  }
});

await epixFrame.mergerSiteAdd(hubAddress);
```

Notes:

- **One address adds without asking.** With more than one address the wrapper first shows a confirmation ("Add N new xite?"). If the visitor declines or does not answer, nothing is added. The command has already answered `"ok"` by then.
- **Wait for `site_done`.** When the add is over, successful or not, the node pushes a `setSiteInfo` event with `event: ["site_done", "<address>"]` for each requested hub. It is sent after the merged database has been rebuilt, so a query made on this event sees the new rows. Use it in place of a timeout.
- **`site_done` does not mean success.** Call `mergerSiteList(true)` afterwards and inspect the hub's entry before you treat it as ready.
- **Failures are shown by the wrapper.** A hub that could not be added produces an error notification ("Adding `<address>` failed"). A successful add produces "Added N new xite" and a fresh `setSiteInfo` for the merger.
- **Repeating the call is safe.** A hub that is already on the node, or is being added by an earlier call, is not counted or announced a second time. Each call still ends with its own `site_done` event.

Errors:

- `Not a merger xite`
- `mergerSiteAdd: addresses required` when no address was found in the parameters
- `Xite commands take the epix1 address, not a name: <name>` when a `.epix` name is passed
- `Adding new xites is disabled on this node` when the operator has locked the node's xite set (the wrapper also shows this as a notification)

### mergerSiteDelete

Removes one or more hubs from the node, deletes their local files, and rebuilds the merged databases.

**Permission:** `Merger:<type>`. Each address must be a hub whose `content.json` declares a `merged_type` the calling xite holds `Merger:<type>` for.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| addresses | string or array of strings | yes | One hub address as a bare string, or several as an array. The same alternative forms as [`mergerSiteAdd`](#mergersiteadd) are accepted. |

**Returns:** `"ok"` after the hubs were removed and the databases rebuilt.

```js
await epixFrame.mergerSiteDelete(hubAddress);
```

Notes:

- Removal is local. The hub stays available on the network for as long as other peers hold it, and it can be added again later.
- Deleting a hub removes the visitor's local copy of everything in it. Anything the visitor wrote there that no other peer holds is lost. Confirm with the visitor before you call it.
- The node checks every address before it removes any, so a refused address in a list leaves the others in place too.
- An address that is not on the node, or that is not a hub of one of the caller's types, is refused. To remove any other xite, use [`siteDelete`](admin.md#sitedelete), an `ADMIN` command. (EpixNet v0.6.8 lets a merger xite remove any xite on the node, and skips an address that is not on the node.)

Errors:

- `Not a merger xite`
- `Merged type (<type>) of <address> not in [<types>]` when the target is not a hub of the caller's types (`none` for a xite that declares no type or is not on the node)
- `Xite commands take the epix1 address, not a name: <name>`
- `Deleting xites is disabled on this node` when the operator has locked the node's xite set

## Newsfeed follows

A follow is a named SQL query that the visitor has switched on for your xite. The node stores the follows and the Dashboard runs them with [`feedQuery`](admin.md#feedquery) to build the visitor's newsfeed. Your page only saves and reads its own follows.

The query rules and the shape of a feed row are described in [Feeds, notifications and search](../build/feeds-search.md). In short, a follow's query must be a single `SELECT` that returns a numeric `date_added` column, and the node skips any query that contains a statement separator, an SQL comment, or a keyword that changes data.

### feedFollow

Saves the bound xite's newsfeed follows. The object you send replaces the whole previous set.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `feeds` | object | yes | Maps a follow name to `[query, params]`. Send it as the first element of an array, or as the bare object. `query` is the SQL text. `params` is an array of values that replaces the literal text `:params` in the query, each value quoted as an SQL literal. |

**Returns:** `"ok"`.

```js
// The "New topics" follow from Epix Talk.
var NEW_TOPICS =
  "SELECT title AS title, body, added AS date_added, 'topic' AS type, " +
  "'?Topic:' || topic.topic_id || '_' || topic_creator_json.directory AS url " +
  "FROM topic " +
  "LEFT JOIN json AS topic_creator_json ON (topic_creator_json.json_id = topic.json_id) " +
  "WHERE parent_topic_uri IS NULL";

var follows = await epixFrame.feedList();
follows["New topics"] = [NEW_TOPICS, [""]];
await epixFrame.feedFollow(follows);
```

The helper sends `[feeds]`. The raw form is `epixFrame.cmd("feedFollow", [follows])`.

Notes:

- **Read, change, write.** Because the call replaces everything, start from [`feedListFollow`](#feedlistfollow) when you add or remove a single follow.
- **Unfollow by omission.** Send the set without an entry to remove it. Send `{}` to remove all follows.
- **Queries are stored as text.** A follow keeps the SQL it was saved with. When you change a query in a new release, compare the stored text with the current one on page load and save the follows again, as Epix Talk does.
- Follows are stored with the visitor's private user data on this node. They are not published.
- The node does not validate the object when it saves it. An unsafe or failing query is skipped later, when the feed is built.

### feedListFollow

Returns the follows saved for the bound xite.

**Permission:** none

No parameters.

**Returns:** the object last saved with [`feedFollow`](#feedfollow), or `{}` when nothing has been saved.

```js
var follows = await epixFrame.feedList();
var following = Object.keys(follows).length > 0;
```

The EpixFrame helper is named `feedList()`. It sends `feedListFollow`.

## Derived feeds

The derived feed layer organizes signed [merge file](../build/files.md#signed-merge-files) records into daily segments, a checkpoint of the current state, per-item counts and search filters. Everything in it is computed from the signed records, so two nodes that hold the same records compute the same hashes. The layer and its declaration format are described in [Feeds, notifications and search](../build/feeds-search.md#derived-feeds-over-signed-records).

Common behavior of the three commands:

- They are read-only and need no permission.
- They answer for the bound xite, from feed descriptors in the `feeds` object of that xite's root `content.json`.
- Each command accepts an object with the named parameters, or an array in the order shown in its table.
- An unknown feed name fails with `no feed '<name>' declared for this xite`. The same error is returned if the xite's signed content changed while the node was rebuilding the feed. Retry in that case.
- Answers come from the node's local cache. The first query after a start or after new records arrive rebuilds the cache and can take longer.

### feedItemQuery

Returns the live records attached to one target, newest first, with the target's reaction counts. For a comment feed the target is the post the comments belong to. For a top-level feed the target is the item's own id, and the result is that item.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `feed` | string | yes | The feed name (position 0). |
| `target` | string | yes | The id of the item to look up (position 1). |
| `limit` | number | no | Maximum number of records (position 2). Default and ceiling: 500. |
| `before_clock` | number | no | Return only records whose clock is below this value, in milliseconds (position 3). Use the clock of the oldest record you have to page backward. |

**Returns:** an object.

| Field | Type | Description |
| --- | --- | --- |
| `target` | string | The target you asked for. |
| `records` | array | The live records as they were signed, newest first. Edits are folded into the newest version and deleted items are left out. |
| `reactions` | object | Reaction counts for the target, as `{"<kind>": <count>}`. Empty when there are none. |
| `checkpoint_root` | string | Hash of the checkpoint the answer was read from. |
| `segment_roots` | array of strings | Hashes of the sealed segments, which a verifier can recompute from the records. |

```js
var res = await epixFrame.cmd("feedItemQuery", {
  feed: "comments",
  target: postUri,
  limit: 50
});
renderComments(res.records, res.reactions);
```

Errors: `feedItemQuery: feed required`, `feedItemQuery: target required`, and the unknown feed error described above.

### feedGalleryRollup

Returns comment counts, reaction counts and the time of the newest activity for many items in one call. It is meant for listing pages that show counters next to each item.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `feed` | string | yes | The feed name (position 0). |
| `items` | array of strings | yes | The item ids to summarize (position 1). At most 500. Entries that are not strings are ignored. |

**Returns:** an object.

| Field | Type | Description |
| --- | --- | --- |
| `items` | object | One entry per requested id: `{"comment_count": <n>, "reactions": {"<kind>": <n>}, "newest_clock": <ms>}`. An id with no activity gets zero counts. |
| `rollup_root` | string | Hash of the rollup, which a verifier can recompute. |

```js
var res = await epixFrame.cmd("feedGalleryRollup", {
  feed: "comments",
  items: posts.map(function (post) { return post.uri; })
});
posts.forEach(function (post) {
  post.commentCount = res.items[post.uri].comment_count;
});
```

Errors:

- `feedGalleryRollup: feed required`
- `feedGalleryRollup: items required`
- `feedGalleryRollup: items must be an array`
- `feedGalleryRollup: too many items (<n>, max 500)`

### feedSegmentSearch

Searches the records of a feed for terms and returns pointers to the matching records. It never returns record bodies. A caller that needs the body reads the record and can check it against the segment hash in the pointer.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `feed` | string | yes | The feed name (position 0). |
| `terms` | string or array of strings | yes | The query (position 1). At most 16 strings, each at most 256 bytes. |
| `limit` | number | no | Maximum number of pointers (position 2). Default and ceiling: 200. |

**Returns:** an object.

| Field | Type | Description |
| --- | --- | --- |
| `terms` | array of strings | The search terms after tokenizing, sorted and without duplicates. At most 16 are used. |
| `pointers` | array | One entry per matching record: `record` (the record's content hash), `segment_root`, `offset` and `len` (where the record sits in its segment), plus `id`, `target` and `clock` from the record. |
| `segments_total` | number | Sealed segments in the feed. |
| `segments_skipped` | number | Segments ruled out by their filter without being read. |
| `segments_scanned` | number | Segments that were read. |
| `spine_head` | string | Hash of the newest link in the chain of segments. |
| `unindexable_query` | boolean | Present and `true` only when no term could be searched. `pointers` is then empty. |

```js
var res = await epixFrame.cmd("feedSegmentSearch", {
  feed: "posts",
  terms: searchBox.value,
  limit: 50
});
if (res.unindexable_query) {
  showHint("Search needs at least one word of two or more letters or digits.");
} else {
  showMatches(res.pointers);
}
```

Notes:

- **A record matches when it contains every term.** There is no ranking, stemming or fuzzy matching.
- **Terms are ASCII words.** Text is lowercased and split on anything that is not an ASCII letter or digit, and terms shorter than 2 bytes or longer than 40 bytes are dropped. A query made only of non-ASCII text sets `unindexable_query`.
- **Search is local.** The node searches the records it already holds for the bound xite. It does not ask other nodes.
- The search stops once `limit` pointers are found, so the segment counters describe the work done up to that point.

Errors:

- `feedSegmentSearch: feed required`
- `feedSegmentSearch: terms required`
- `feedSegmentSearch: terms must be a string or array`
- `feedSegmentSearch: too many terms (<n>, max 16)`
- `feedSegmentSearch: term too long (<n> bytes, max 256)`

## Notifications

A notification subscription is a named SQL query that returns a count. The node runs the saved queries of every xite and sums them into the unread badge that the wrapper and the Dashboard show. Your page registers its queries and tells the node when the visitor has seen something. The node-wide side ([`notificationQuery`](admin.md#notificationquery), [`notificationCount`](admin.md#notificationcount), muting and dismissing for other xites) needs `ADMIN`.

How a subscription is evaluated, including the `{xid_directory}` and `{last_seen}` placeholders and the `notification_icons` key of `content.json`, is explained in [Feeds, notifications and search](../build/feeds-search.md#notifications).

### notificationSubscribe

Saves the bound xite's notification queries. The object you send replaces the previous set.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `subscriptions` | object | yes | Maps a notification name to `[query, params]`, or to a bare query string. Send it under the `subscriptions` key, as the first element of an array, or as the bare object. |

**Returns:** `"ok"`.

```js
var REPLIES =
  "SELECT COUNT(*) AS count FROM reply " +
  "WHERE reply.to_directory = '{xid_directory}' " +
  "AND reply.date_added * 1000 > {last_seen}";

await epixFrame.cmd("notificationSubscribe", [{ replies: [REPLIES, []] }]);
```

The `reply` table in this example stands for a table in your own schema.

Notes:

- The query must start with `SELECT` and should return one row with a `count` column. A query that does not start with `SELECT` is skipped when counts are collected.
- `params` replaces the literal text `:params` in the query, each value quoted as an SQL literal.
- Only xites that have a database are evaluated.
- Send `{}` to remove all subscriptions.
- Subscriptions are stored in the node's configuration, per xite. They are not published.

### notificationList

Returns the notification subscriptions saved for the bound xite.

**Permission:** none

No parameters.

**Returns:** the object last saved with [`notificationSubscribe`](#notificationsubscribe), or `{}` when nothing has been saved.

```js
var subscriptions = await epixFrame.cmd("notificationList");
if (!subscriptions.replies) registerNotifications();
```

### notificationDismissSelf

Records that the visitor has now seen one of the bound xite's own notifications. The node stores the current time for that name, and a query that uses `{last_seen}` counts only newer items from then on.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The notification name used in [`notificationSubscribe`](#notificationsubscribe) (position 0, or a bare string). |

**Returns:** `"ok"`.

```js
// The visitor opened the replies view.
await epixFrame.cmd("notificationDismissSelf", ["replies"]);
```

Notes:

- The stored time is in milliseconds. Compare it with a millisecond value in your query, as the example above does with `date_added * 1000`.
- A page can dismiss only its own xite's notifications. The Dashboard clears another xite's notification with [`notificationDismiss`](admin.md#notificationdismiss).
- A query that does not use `{last_seen}` is not affected by dismissing. For a count that tracks your own read state, store a baseline with `userSetSettings` instead, as described in the [feeds guide](../build/feeds-search.md#notifications).

Errors: `notificationDismissSelf: name required`.

## Related pages

- [Merger xites and hubs](../build/merger-hubs.md): the full pattern, with the merged database and merged file paths
- [Feeds, notifications and search](../build/feeds-search.md): query rules, feed rows and feed descriptors
- [Database commands](database.md): `dbQuery`, which merger xites use to read the merged database
- [File commands](files.md): reading and writing through `merged-<type>/` paths
- [Admin commands](admin.md): the node-wide feed and notification commands the Dashboard uses
- [EpixFrame library guide](../libraries/epixframe.md): the helper methods used on this page
