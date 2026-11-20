---
description: Map a xite's JSON files to SQL tables with dbschema.json and query them from the page.
---

# Database

A xite stores data as JSON files, but pages usually want to sort, filter and join. The node bridges the two: you describe tables and mappings in `dbschema.json`, the node loads the xite's signed JSON files into an SQLite database, and your page queries it with `dbQuery`. This page is the reference for `dbschema.json` and for how the database behaves.

## The model in one paragraph

The database is a **read-only projection of signed files**. You never insert a row. To add a record, you change a JSON file, the file is signed, and the node replaces the rows that came from that file. Every node that holds the xite builds the same database from the same files. The node keeps an ordinary xite's database in memory (a merger xite's database can be a disposable cache file in the node's private folder; see [the persistent merger index](merger-hubs.md#the-persistent-merger-index)) and can rebuild it at any time, so nothing in it needs backing up.

## A minimal example

This continues the [quickstart](quickstart.md), which has a `data/notes.json` file:

```json title="data/notes.json"
{
  "notes": [
    {"note_id": 1, "title": "Hello EpixNet", "body": "This note lives in a signed JSON file.", "date_added": 1767225600},
    {"note_id": 2, "title": "Second note", "body": "Sorted by SQL this time.", "date_added": 1767312000}
  ]
}
```

Add a schema at the xite root:

```json title="dbschema.json"
{
  "db_name": "MyXite",
  "db_file": "data/myxite.db",
  "version": 2,
  "maps": {
    "notes\\.json": {
      "to_table": [
        {"node": "notes", "table": "note"}
      ]
    }
  },
  "tables": {
    "note": {
      "cols": [
        ["note_id", "INTEGER"],
        ["title", "TEXT"],
        ["body", "TEXT"],
        ["date_added", "INTEGER"],
        ["json_id", "INTEGER REFERENCES json (json_id)"]
      ],
      "indexes": ["CREATE UNIQUE INDEX note_key ON note(json_id, note_id)"]
    }
  }
}
```

Sign the xite (the schema and data must be signed before they count, see [Only signed inputs are loaded](#only-signed-inputs-are-loaded)), then query from the page:

```js
Page.cmd("dbQuery", ["SELECT * FROM note ORDER BY date_added DESC LIMIT :limit", { limit: 20 }], (rows) => {
  if (!Array.isArray(rows)) {
    console.error("Query failed:", rows && rows.error);
    return;
  }
  rows.forEach((row) => console.log(row.note_id, row.title));
});
```

Each row is an object keyed by column name.

## dbschema.json reference

### Top-level keys

| Key | Required | Meaning |
| --- | --- | --- |
| `db_name` | No | A label for the database. |
| `db_file` | Yes | A relative path such as `data/myxite.db`. The node does not need a file there, but the **directory** part is the base that `maps` patterns and stored paths are relative to. It must be a valid relative path, or no database is built. |
| `version` | No, default `1` | Selects the layout of the `json` table (below). Use `2` for a normal xite and `3` for a merger xite. |
| `maps` | Yes | Which JSON files feed which tables. |
| `tables` | Yes | Table definitions. |
| `feeds` | No | Named queries for the newsfeed. See [Feeds, notifications and search](feeds-search.md). |

!!! note "Why db_file matters"
    With `"db_file": "data/users/forum.db"`, the file `data/users/alice.epix/data.json` is known to the database as `alice.epix/data.json`. Files outside `data/users/` are not loaded at all. Choose the directory that contains all the JSON you want to query, or use a bare file name such as `"myxite.db"` to make paths relative to the xite root.

### tables

Each key is a table name. Names of tables and columns may contain only ASCII letters, digits and underscores and may not start with a digit.

| Key | Meaning |
| --- | --- |
| `cols` | A list of `[name, SQL type]` pairs. The type text is passed to SQLite, so constraints such as `INTEGER REFERENCES json (json_id)` are allowed. |
| `indexes` | A list of `CREATE INDEX` statements for this table. Only statements that create an index on this table are permitted. |

Every table filled by `to_table` **must have a `json_id` column**. The node sets it on each row to identify the source file, and uses it to replace that file's rows when the file changes.

Two table names are reserved and created for you: `json` and `keyvalue`. Names starting with `__epix_` are reserved for the node's internal tables; a schema that uses one is rejected, and page queries cannot read them.

!!! info "schema_changed"
    Schemas written for the archived Python node carry a `schema_changed` number on each table. The current node accepts the key and ignores it. Because the database is rebuilt from files, a changed schema takes effect at the next rebuild without a migration.

### maps

Each key is a regular expression. It is tested from the start of every `.json` file's path, relative to the `db_file` directory, and a file can match several maps. Only files ending in `.json` are considered. Lookahead and backreferences are not available in these patterns.

A map can contain:

| Key | Meaning |
| --- | --- |
| `to_table` | Load arrays or objects from the file into tables. |
| `to_keyvalue` | Store selected top-level values in the `keyvalue` table. |
| `to_json_table` | Store selected top-level values as columns on the file's row in the `json` table. |
| `file_name` | Attach this file's rows and columns to a sibling file's `json` row instead of its own. |
| `fold_crdt` | For signed merge files: reduce versioned records to their current winners before loading. See [Files](files.md). |

#### to_table

Each entry is either a string or an object.

A string is shorthand: `"post"` loads the array at the top-level key `post` into the table `post`.

An object gives full control:

| Key | Meaning |
| --- | --- |
| `table` | Destination table. |
| `node` | Top-level key in the JSON file to read. Defaults to the table name. |
| `key_col` | Treat the node as an object rather than an array, and store each property name in this column. |
| `val_col` | With `key_col`: store each property value in this column. |
| `import_cols` | Only import these fields. Defaults to all of the table's columns. |

For an **array node**, each array element that is an object becomes one row. Fields with no matching column are dropped; columns with no matching field are `NULL`.

For an **object node** with `key_col`, three value shapes are supported:

```json
{
  "votes": {"post_12": 1, "post_15": 1},
  "profiles": {"alice": {"bio": "Hello", "color": "blue"}},
  "tags": {"post_12": [{"tag": "news"}, {"tag": "help"}]}
}
```

| Map entry | Result |
| --- | --- |
| `{"node": "votes", "table": "vote", "key_col": "post_uri", "val_col": "vote"}` | One row per property: `post_uri` and `vote`. |
| `{"node": "profiles", "table": "profile", "key_col": "user"}` | One row per property: the object's fields plus `user`. |
| `{"node": "tags", "table": "tag", "key_col": "post_uri"}` | One row per array element: the element's fields plus `post_uri`. |

Value conversion: strings stay text, integers and decimals stay numbers, `true` and `false` become `1` and `0`, and nested arrays or objects are stored as JSON text.

#### to_keyvalue

A list of top-level keys. Each becomes a row in the built-in `keyvalue` table with the columns `key`, `value` and `json_id`. Use it for single values per file, such as counters or a blog's title.

```json
"data\\.json": {
  "to_table": ["post"],
  "to_keyvalue": ["title", "next_post_id"]
}
```

```sql
SELECT value FROM keyvalue
LEFT JOIN json USING (json_id)
WHERE key = 'title' AND file_name = 'data.json' AND directory = ''
```

#### to_json_table and file_name

`to_json_table` lists top-level keys that become extra text columns on the `json` table, set on the row of the file they came from. That makes per-file values available in every join without a second lookup.

`file_name` redirects where they land. A user's identity lives in the user's `content.json`, but the user's rows are attached to `data.json`. This map copies the identity onto the `data.json` row:

```json
".+/content\\.json": {
  "to_json_table": ["cert_user_id"],
  "file_name": "data.json"
}
```

After that, any table can reach the author's identity with one join:

```sql
SELECT comment.*, json.cert_user_id
FROM comment LEFT JOIN json USING (json_id)
```

The same `file_name` key on a `to_table` map attaches that file's rows to the sibling's `json` row. Epix Talk uses this so that rows from `topics.json` and `comments.json` join the same per-user row as `data.json`.

### The json table

The node creates one row in `json` for every file it loads. Its shape depends on `version`:

| `version` | Columns | Use |
| --- | --- | --- |
| `1` | `json_id`, `path` | Legacy. The whole relative path in one column. |
| `2` | `json_id`, `directory`, `file_name` | Normal xites. |
| `3` | `json_id`, `site`, `directory`, `file_name` | Merger xites. `site` holds the address of the hub the file came from. See [Merger xites and hubs](merger-hubs.md). |

Plus one text column per `to_json_table` key.

`directory` is relative to the `db_file` directory and has no trailing slash. For user content it is the user's directory name, which is how queries find the author of a row:

```sql
SELECT topic.*, json.directory AS author
FROM topic LEFT JOIN json ON (json.json_id = topic.json_id)
WHERE json.directory = :author
ORDER BY topic.added DESC
```

### A real schema

This is a shortened version of the Epix Blog schema. The owner's posts live in `data/data.json`; each commenter's records live under `data/users/<name>/`.

```json title="dbschema.json"
{
  "db_name": "EpixBlog",
  "db_file": "data/epixblog.db",
  "version": 2,
  "maps": {
    "data.json": {
      "to_table": ["post"],
      "to_keyvalue": ["title", "description", "next_post_id"]
    },
    "users/.+/comments.json": {
      "to_table": [{"node": "post", "table": "comment"}],
      "file_name": "data.json",
      "fold_crdt": "post"
    },
    "users/.+/content.json": {
      "to_keyvalue": ["cert_user_id"]
    }
  },
  "tables": {
    "post": {
      "cols": [
        ["post_id", "INTEGER"],
        ["title", "TEXT"],
        ["body", "TEXT"],
        ["date_published", "INTEGER"],
        ["json_id", "INTEGER REFERENCES json (json_id)"]
      ],
      "indexes": [
        "CREATE UNIQUE INDEX post_uri ON post(json_id, post_id)",
        "CREATE INDEX post_id ON post(post_id)"
      ]
    }
  }
}
```

The `comment` table is omitted for brevity. Note that `content.json` manifests are themselves loaded as inputs, which is how `cert_user_id` becomes queryable.

## Only signed inputs are loaded

The node builds the database from what it has **verified**, not from whatever is in the folder:

1. It starts from the verified root `content.json` and every verified child manifest.
2. It collects every `.json` file those manifests declare in `files`, `files_optional` or `files_merged`, plus the manifests themselves.
3. For each declared file it reads the bytes and checks them against the signed size and hash. Merge files are checked record by record instead.
4. Only then does it apply the `maps`.

Consequences:

- `dbschema.json` must itself be listed in the root manifest. A schema you just created does nothing until you sign.
- A JSON file that is on disk but not declared in a signed manifest is not loaded.
- A declared JSON file whose bytes no longer match its signed hash is a failed input. Until the file is signed again, the database may be missing or out of date.
- Every declared `.json` file is read and checked, whether or not a map matches it. All of them must be valid JSON.
- Each JSON input may be at most 64 MiB, and `dbschema.json` at most 8 MiB.

!!! warning "Sign after editing declared JSON by hand"
    Editing JavaScript or CSS in your working copy is harmless for the database. Editing a declared `.json` file is different, and that includes `dbschema.json`, data files and `languages/*.json` dictionaries: the file stops matching its signed hash and the next rebuild cannot use it. Sign the xite after such edits, before you rely on query results.

For content written by the page, the usual pattern is to write and then sign in one flow, which is what `sitePublish` does by default:

```js
Page.cmd("fileWrite", [inner_path, btoa(unescape(encodeURIComponent(json_text)))], (res) => {
  if (res !== "ok") return Page.cmd("wrapperNotification", ["error", "File write error: " + (res.error || res)]);
  Page.cmd("sitePublish", { inner_path: inner_path }, (res) => {
    // "ok": signed, loaded into the database and offered to peers
  });
});
```

See [User content](user-content.md) for who may write where.

## When the database is built

| Trigger | What happens |
| --- | --- |
| The xite finishes downloading | Full build. |
| A data file arrives or is signed | That file's rows are replaced. Pages then receive `setSiteInfo` with `event: ["file_done", "<path>"]`. |
| Any `content.json` or `dbschema.json` changes | Full rebuild. |
| First `dbQuery` on a xite with no database yet | The database is built on demand. |
| **Rebuild database** in the sidebar's **Manage** tab, or the `dbRebuild` command (ADMIN only) | Full rebuild. |
| **Reload schema** in the sidebar's **Manage** tab, or the `dbReload` command (ADMIN only) | Re-reads `dbschema.json`. |
| `epix-server dbRebuild <address>` | Full rebuild from the command line, with the node stopped. |

A query that arrives while the database is being rebuilt is held until the database settles, then answered. Your page does not need retry logic for this, but it should not assume queries return instantly during a download.

The `file_done` event is sent after the rows are in place, so it is the right moment to re-query:

```js
onRequest(cmd, message) {
  if (cmd !== "setSiteInfo") return;
  var event = message.params.event;
  if (event && event[0] === "file_done" && event[1].endsWith(".json")) {
    this.reloadList();
  }
}
```

Content from users the visitor has muted is left out of the visitor's database.

## Querying from the page

`dbQuery` takes the SQL and optional parameters. It is available to any page for its own xite; no permission is needed.

```js
// EpixFrame helper, Promise style (Page is your EpixFrame instance)
var rows = await Page.dbQuery("SELECT * FROM note WHERE note_id = :id", { id: 2 });
```

### Queries are read-only

The node runs page-supplied SQL under a restriction that permits reading and nothing else. `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `PRAGMA`, `ATTACH` and transaction statements fail with an error. Functions and recursive common table expressions are allowed.

### Parameters

Use parameters rather than building SQL from strings. Queries cannot write, but a value spliced into the text can still change what a query returns.

=== "Named"

    ```js
    Page.cmd("dbQuery", [
      "SELECT * FROM comment WHERE topic_uri = :uri AND added > :since ORDER BY added",
      { uri: "12_alice.epix", since: 1767225600 }
    ], callback);
    ```

    An array value expands for `IN`:

    ```js
    Page.cmd("dbQuery", [
      "SELECT * FROM post WHERE post_id IN :ids",
      { ids: [1, 2, 3] }
    ], callback);
    ```

    Keys the query does not reference are ignored.

=== "Positional"

    ```js
    Page.cmd("dbQuery", [
      "SELECT * FROM comment WHERE topic_uri = ? LIMIT ?",
      ["12_alice.epix", 50]
    ], callback);
    ```

=== "Condition object"

    When the parameters are an object and the SQL contains `?`, the **last** `?` is replaced by conditions built from the object, joined with `AND`:

    ```js
    Page.cmd("dbQuery", [
      "SELECT * FROM comment WHERE ? ORDER BY added DESC",
      { topic_uri: ["12_alice.epix", "15_bob.epix"], "added>": 1767225600 }
    ], callback);
    ```

    | Key form | Condition |
    | --- | --- |
    | `name` with a scalar | `name = value` |
    | `name` with an array | `name IN (...)` |
    | `not__name` | `name != value`, or `NOT IN (...)` for an array |
    | `name__like` | `name LIKE value` |
    | `name>` and `name<` | `name > value` and `name < value` |

### Results and errors

A successful query returns an array of row objects, possibly empty. A failed query returns `{"error": "..."}`. In callback style, check with `Array.isArray(rows)` before iterating. In Promise style, EpixFrame rejects the Promise.

Binary column values are returned as a short placeholder string, not as data. Store binary content in files, not in the database.

## Inspecting the database

From a terminal, with the node stopped (the command needs the data folder lock):

```sh
epix-server dbQuery <address> "SELECT name FROM sqlite_master WHERE type = 'table'"
epix-server dbQuery <address> "SELECT * FROM json LIMIT 20"
```

Output is JSON. On Linux and macOS you can also query a running node:

```sh
epix-server siteCmd <address> dbQuery '["SELECT COUNT(*) AS n FROM note"]'
```

If a table is empty, check in this order: is `dbschema.json` signed, does the `maps` pattern match the path relative to the `db_file` directory (look at the `json` table to see which files loaded), does the table have a `json_id` column, and do the column names match the JSON field names.

## Performance tips

- **Index what you filter and join on.** Add `CREATE INDEX` statements for columns used in `WHERE`, `JOIN` and `ORDER BY`, and a unique index on the natural key together with `json_id`.
- **Keep files small and focused.** When a file changes, all of its rows are deleted and reinserted. One large file that changes often costs more than many small ones, and each JSON file is capped at 64 MiB.
- **Give every writer their own file.** Per-user files under `data/users/<name>/` let nodes replace one user's rows without touching the rest, and are required by the permission model anyway.
- **Use `LIMIT` and page through results.** Ask for what the view shows.
- **Re-query on `file_done`, not on a timer.** The event tells you exactly when data changed.
- **Change the schema freely.** There are no migrations. Edit `dbschema.json`, sign, and every node rebuilds.
- **Do not ship a database file.** If a `.db` file sits in your xite folder, exclude it with `ignore` in `content.json` so it is never signed.

## Related pages

- [Database commands](../api/database.md): the API reference for `dbQuery` and related commands.
- [User content](user-content.md): per-user files, permissions and limits.
- [Files](files.md): merge files and `fold_crdt`.
- [Merger xites and hubs](merger-hubs.md): version 3 databases across several xites.
- [Feeds, notifications and search](feeds-search.md): the `feeds` section.
