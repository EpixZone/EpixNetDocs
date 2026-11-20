---
description: Reference for dbQuery, the EpixFrame command that runs read-only SQL against a xite's database. Parameter binding forms, result types, what a query may do, timing during rebuilds, errors and common patterns.
---

# Database commands

A xite (a site published on EpixNet) can describe SQL tables in a `dbschema.json` file. The node then loads the xite's signed JSON files into an SQLite database, and the page reads it with one command: `dbQuery`. This page is the reference for that command: how to pass parameters, what comes back, what the node allows a query to do, and how queries behave while data is still arriving. It is written for xite developers. For the schema format and how the database is built, see [Database](../build/database.md). For how commands travel and how errors are shaped, see the [API overview](index.md).

## What to know first

- **The database is read-only for pages.** There is no command to insert or update a row. To change data, write a JSON file with [`fileWrite`](files.md#filewrite) and sign it. The node replaces the rows that came from that file.
- **One database per xite.** `dbQuery` reads the database of the page's own xite. A merger xite gets one database built from all of its hubs. See [Merger xites and hubs](../build/merger-hubs.md).
- **Rows come from verified files.** The node loads only JSON files that a signed manifest declares and whose contents match the signed hash. Content from authors the visitor has [muted](identity.md#muteadd) is left out.
- **No permission is needed.** Any page can query its own xite's database, including on a public gateway.

The examples use `epixFrame`, the shared [EpixFrame](../libraries/epixframe.md) instance.

## Querying

### dbQuery

Runs one SQL read query against the xite's database and returns the rows.

**Permission:** none

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | yes | One SQL statement (position 0). A bare string is also accepted as the whole parameter. |
| `params` | object or array | no | Values to bind (position 1). An array binds positionally to `?` placeholders. An object binds by name to `:name` placeholders, or builds conditions for a `?`. See [Binding parameters](#binding-parameters). |

**Returns:** an array of row objects, one per result row, keyed by column name. An empty result is an empty array.

```js
// Helper: epixFrame.dbQuery(query, params) sends ["query", params].
var topics = await epixFrame.dbQuery(
  "SELECT topic.*, json.directory AS author " +
  "FROM topic LEFT JOIN json ON (json.json_id = topic.json_id) " +
  "WHERE topic.added > :since ORDER BY topic.added DESC LIMIT :limit",
  { since: 1767225600, limit: 20 }
);
topics.forEach(function (topic) {
  console.log(topic.title, "by", topic.author);
});
```

The raw forms are equivalent:

```js
epixFrame.cmd("dbQuery", ["SELECT COUNT(*) AS n FROM topic"]);
epixFrame.cmd("dbQuery", "SELECT COUNT(*) AS n FROM topic");
epixFrame.cmd("dbQuery", { query: "SELECT * FROM topic WHERE topic_id = :id", params: { id: 7 } });
```

A failed query answers `{"error": "..."}`. With a Promise the call rejects with that object. With a callback, check before you iterate:

```js
epixFrame.cmd("dbQuery", ["SELECT * FROM topic ORDER BY added DESC"], function (rows) {
  if (!Array.isArray(rows)) {
    console.log("Query failed:", rows && rows.error);
    return;
  }
  render(rows);
});
```

## Binding parameters

Pass values as parameters instead of building them into the SQL text. A query cannot write, but a value spliced into the text can still change what the query returns, and quoting mistakes break queries on ordinary input such as an apostrophe in a title.

=== "Named"

    With an object, each `:name` placeholder is bound to the value of that key.

    ```js
    var rows = await epixFrame.dbQuery(
      "SELECT * FROM comment WHERE topic_uri = :uri AND added > :since ORDER BY added",
      { uri: "12_alice.epix", since: 1767225600 }
    );
    ```

    An array value expands a placeholder into a list, for use with `IN`:

    ```js
    var rows = await epixFrame.dbQuery(
      "SELECT * FROM post WHERE post_id IN :ids",
      { ids: [1, 2, 3] }
    );
    ```

    Keys that the query does not reference are ignored, so one parameter object can serve several queries.

=== "Positional"

    With an array, values bind to `?` placeholders in order.

    ```js
    var rows = await epixFrame.dbQuery(
      "SELECT * FROM comment WHERE topic_uri = ? ORDER BY added LIMIT ?",
      ["12_alice.epix", 50]
    );
    ```

=== "Condition object"

    When the parameters are an object and the SQL contains a `?`, the **last** `?` in the statement is replaced by conditions built from the object, joined with `AND`.

    ```js
    var rows = await epixFrame.dbQuery(
      "SELECT * FROM comment WHERE ? ORDER BY added DESC",
      { topic_uri: ["12_alice.epix", "15_bob.epix"], "added>": 1767225600 }
    );
    // WHERE topic_uri IN (?, ?) AND added > ? ...
    ```

    | Key form | Value | Condition |
    | --- | --- | --- |
    | `name` | scalar | `name = value` |
    | `name` | array | `name IN (...)` |
    | `not__name` | scalar | `name != value` |
    | `not__name` | array | `name NOT IN (...)` |
    | `name__like` | scalar | `name LIKE value` |
    | `name>` | scalar | `name > value` |
    | `name<` | scalar | `name < value` |

    An empty object produces a condition that is always true.

Rules that apply to all forms:

- **The two object forms do not mix.** If the SQL text contains a `?` anywhere, including inside a quoted string, an object is treated as a condition object and `:name` placeholders are not bound. Use either `?` with a condition object, or `:name` placeholders, in one statement.
- **Write `IN :ids` without parentheses.** The node adds them when it expands an array value.
- **Value conversion.** `true` and `false` bind as `1` and `0`. Whole numbers bind as integers, other numbers as floating point, strings as text and `null` as SQL `NULL`. A nested array or object binds as its JSON text.
- **Column names in a condition object** are taken from your keys. Keep them to plain column names, optionally qualified with a table name.

## Results and value types

Each row is an object whose keys are the column names of the result, so give computed columns a name with `AS`. Two columns with the same name collapse into one key; alias them apart when you join tables that share column names.

| SQLite value | JSON value in the row |
| --- | --- |
| `NULL` | `null` |
| Integer | number |
| Real | number |
| Text | string |
| Blob | A placeholder string of the form `<N bytes>`, not the data |

The database is meant for structured text and numbers. Keep binary content in files and store its path.

## What a query may do

`dbQuery` accepts SQL written by the page, so the node runs it under a restriction enforced by the database engine itself.

Allowed:

- `SELECT` statements, including joins, subqueries, aggregate and scalar functions, and recursive common table expressions (`WITH RECURSIVE`).
- Reading any table of the xite's database, including the `json` and `keyvalue` tables the node maintains.

Refused, each with an error:

- `INSERT`, `UPDATE` and `DELETE`.
- `CREATE`, `DROP`, `ALTER` and other schema changes.
- `PRAGMA`, `ATTACH`, `DETACH` and transaction statements.
- Reading the node's internal bookkeeping tables, whose names start with `__epix_`.

The command prepares a single statement. Send one statement per call.

## Timing during downloads and rebuilds

A query can arrive while the xite is still downloading or while the node is rebuilding the database. The node handles this so that a page's first queries return rows instead of errors:

- **A running clone or rebuild is waited out first**, for up to 45 seconds.
- **A database that does not exist yet is built on demand.** If `dbschema.json` has not arrived yet, the node waits for it for up to 30 seconds. If the root `content.json` is known and does not list a `dbschema.json`, the answer is immediate: `xite has no current database`.
- **A result is checked against the database it came from.** If the database was replaced or its inputs changed while the query ran, the node runs the query again on the current database. Transient errors, such as a locked database or a table that is briefly missing during a rebuild, are retried too. Retries stop after 60 seconds.

What this means for your page:

- You do not need retry loops around `dbQuery`.
- A query sent during a download can take many seconds. Show a loading state, and do not treat a slow first query as a failure.
- Re-run your queries when data changes. The node pushes `setSiteInfo` with `event: ["file_done", "<inner path>"]` after the rows of a new or changed file are in place. See [Events pushed to the page](xite.md#events-pushed-to-the-page).

```js
epixFrame.on("request", function (cmd, message) {
  if (cmd !== "setSiteInfo") return;
  var event = message.params.event;
  if (event && event[0] === "file_done" && /\.json$/.test(event[1])) {
    reloadList();
  }
});
```

Your own writes need one more step. A file changed with `fileWrite` is a draft that no longer matches its signed hash, and the database is built from signed content only. The change shows up in query results once the covering `content.json` is signed, which [`sitePublish`](xite.md#sitepublish) does by default. Do not wait for a `file_done` event for your own changes: the node skips the connection whose command caused the change. Query again when your `sitePublish` or `siteSign` call answers.

```js
await epixFrame.fileWrite(path, contentBase64);
await epixFrame.cmd("sitePublish", { inner_path: path });
var rows = await epixFrame.dbQuery("SELECT * FROM topic ORDER BY added DESC LIMIT 20");
```

## Errors

| Error | Cause |
| --- | --- |
| `dbQuery: missing query` | The parameters did not contain a query string. |
| `dbQuery: invalid params` | The parameters were not a string, an array or an object. |
| `xite has no current database` | The xite has no `dbschema.json`, or it did not arrive in time. |
| `no such table: ...`, `no such column: ...` | The name is not in the schema. Check `dbschema.json`, and that the schema is signed. |
| `not authorized` and similar messages from SQLite | The statement is not a read, or it touches an internal table. |
| `database authority changed while query ran` | The database kept changing for longer than the retry budget. Run the query again. |
| Other SQLite messages | Syntax errors, a wrong number of bound values and so on, passed through as text. |

Every failed command is also written to the node's log with its error, which helps when a page stalls without showing anything.

## Patterns

### Find the author of a row

The node keeps one row in the `json` table for every file it loads, and each data row carries the `json_id` of its file. Joining the two tells you where a row came from. In a normal xite (schema version 2) the columns are `directory` and `file_name`; a merger xite (version 3) adds `site`, the address of the hub.

```js
var mine = await epixFrame.dbQuery(
  "SELECT topic.* FROM topic LEFT JOIN json USING (json_id) " +
  "WHERE json.directory = :directory ORDER BY topic.added DESC",
  { directory: "alice.epix" }
);
```

How `directory` is formed depends on where the schema's `db_file` lives. See [The json table](../build/database.md#the-json-table).

### Count before you list

Ask for what the view shows. A count query and a paged list query are cheaper than loading every row.

```js
var total = (await epixFrame.dbQuery("SELECT COUNT(*) AS n FROM topic"))[0].n;
var page = await epixFrame.dbQuery(
  "SELECT * FROM topic ORDER BY added DESC LIMIT :limit OFFSET :offset",
  { limit: 20, offset: 40 }
);
```

### Look at the schema from the page

The SQLite catalog is readable, which is handy while developing:

```js
var tables = await epixFrame.dbQuery("SELECT name FROM sqlite_master WHERE type = 'table'");
var files = await epixFrame.dbQuery("SELECT * FROM json LIMIT 20");
```

If a table is empty, the `json` table shows which files were loaded. See [Inspecting the database](../build/database.md#inspecting-the-database) for the full checklist.

## Related commands

These commands touch the database but are documented elsewhere:

| Command | What it does | Reference |
| --- | --- | --- |
| `dbRebuild`, `dbReload` | Rebuild the database from the xite's files, or re-read `dbschema.json`. Both need `ADMIN`; visitors reach the same actions in the xite sidebar. | [Admin commands](admin.md) |
| `fileQuery` | Read rows straight from JSON files, without a schema. | [File commands](files.md#filequery) |
| `feedItemQuery` and the other feed commands | Read the derived feed data of merger xites. | [Merger, feed and search commands](merger.md) |

## Related pages

- [Database](../build/database.md): the `dbschema.json` reference, how and when the database is built, and performance tips.
- [User-generated content](../build/user-content.md): the per-user files most queries read.
- [Merger xites and hubs](../build/merger-hubs.md): one database across several xites.
- [File commands](files.md): write the JSON files the database is built from.
- [Xite and server commands](xite.md): `siteInfo`, signing, publishing and the `setSiteInfo` event.
