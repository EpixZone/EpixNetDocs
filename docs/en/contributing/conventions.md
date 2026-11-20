---
description: The coding conventions visible in the EpixNet Rust workspace and in the official xites, covering formatting, lints, unsafe code, errors, tests, dependencies, vendored patches, commits and pull requests.
---

# Coding conventions

This page describes how code in the EpixNet node repository and in the official xites is written today, so that your change looks like it belongs. It is for contributors who are about to open a pull request. For the workflow around the code (building, testing, CI and releases), see [Contribute to EpixNet](index.md).

Everything here is drawn from the repositories themselves: the manifests, the CI configuration, the source and the commit history. Where the repositories do not show a clear convention, this page says nothing. The rule that covers every remaining case comes from the [organization contributing guidelines](https://github.com/EpixZone/.github/blob/main/CONTRIBUTING.md): match the style and conventions of the surrounding code.

## Rust workspace

The node is a Cargo workspace in [EpixZone/EpixNet](https://github.com/EpixZone/EpixNet). [Architecture](../internals/architecture.md) explains what each crate does. This section covers how the crates are written.

### Layout and naming

- Every workspace crate lives in `crates/<name>/` and is listed in the `members` array of the root `Cargo.toml`.
- Node crates are named `epix-*` (`epix-core`, `epix-crypt`, `epix-ui`). The crates of the EVX sandboxed runtime are named `evx-*` (`evx-api`, `evx-worker`, `evx-supervisor`). A crate that only binds a native library ends in `-sys` (`iptproxy-sys`).
- All crates use `edition = "2021"`. Dependencies between workspace crates are path dependencies:

    ```toml title="crates/epix-core/Cargo.toml (excerpt)"
    [package]
    name = "epix-core"
    version = "0.1.0"
    edition = "2021"
    description = "EpixNet core domain types + the UI-agnostic Emitter trait. No platform/UI deps."

    [dependencies]
    epix-crypt = { path = "../epix-crypt" }
    serde = { version = "1", features = ["derive"] }
    thiserror = "2"
    ```

- A crate's `lib.rs` opens with a `//!` comment that says what the crate owns and where its boundaries are. Give a new crate the same header.
- Scripts that support the build and CI live in `scripts/`, installer code in `packaging/`, and design notes and validation records in `docs/`.

### Toolchain and the lockfile

- CI builds and tests with the current stable Rust toolchain. There is no `rust-toolchain` file. The fuzz targets are the exception and need a pinned nightly.
- `Cargo.lock` is committed, and CI passes `--locked` to its workspace build and test commands. If you change a dependency, commit the updated lockfile in the same pull request, or those commands fail.
- `fuzz/` is a separate workspace with its own lockfile. CI checks that the versions it shares with the main lockfile stay aligned (`scripts/check-evx-fuzz-lock.py`), so a dependency bump that affects the EVX crates has to update both.

### Formatting

The repository has no `rustfmt.toml`, so the rustfmt defaults apply, and the organization guidelines ask for code that is clean under `cargo fmt`. Format the code you write or change.

CI does not run a formatting check, and the workspace is not uniformly formatted: a validation record in the repository notes that `cargo fmt --all -- --check` reports differences in many files that the change under review did not touch, and that the review deliberately did not reformat the whole workspace. Do the same. Keep unrelated formatting changes out of your diff so that it stays reviewable.

### Warnings and lints

- **Warnings are errors in CI.** The main build job sets `RUSTFLAGS="-D warnings"` and compiles with `--all-targets`, so a warning in a test or an example fails the build as well. Cargo caps lints in dependencies, so this only gates the workspace's own crates. Reproduce it locally before you push:

    ```sh
    RUSTFLAGS="-D warnings" cargo build --workspace --all-targets --locked
    ```

- **Fix a warning at its cause.** Do not silence it. When the vendored Reticulum code tripped a deprecation warning, the code was changed to an equivalent call, and its patch note records that this keeps the build compatible with warnings as errors "without suppressing lints".
- **Clippy.** There is no `clippy.toml` and no workspace lint table, and the organization guidelines ask for code that is clean under `cargo clippy`. Where the source opts out of a Clippy lint, it names that one lint in an `#[allow(clippy::...)]` attribute, most often `too_many_arguments` on a single function. There is no blanket allow.
- **Complexity and duplication.** SonarCloud analyzes `crates/` on every pull request. Production code is expected to stay under its cognitive complexity limit. The project configuration states that functions which used to be exceptions have been split, and that a future exception should be accepted on that one function, never by waiving a file. Test code is exempt from the complexity rule.
- **Documentation lints.** Several EVX crates enable `#![warn(missing_docs)]`. In those crates, every public item needs a doc comment.

### Unsafe code

Most crates contain no `unsafe` at all, and the ones with security-critical parsing or storage logic say so in the compiler's terms.

| Attribute | Used by | Meaning for you |
| --- | --- | --- |
| `#![forbid(unsafe_code)]` | `epix-blob`, `epix-edx`, `epix-feed`, `epix-search`, `epix-selfenc`, `epix-evx`, `evx-declaration`, `evx-activation`, `evx-state` | No `unsafe` in this crate, and no way to allow it locally. |
| `#![deny(unsafe_code)]` | `evx-workspace` | No `unsafe` except in a module that explicitly allows it, such as its Windows system layer. |
| `#![deny(unsafe_op_in_unsafe_fn)]` | `evx-android`, `evx-windows`, `evx-windows-native` | These crates call platform APIs. Every unsafe operation needs its own `unsafe` block, even inside an `unsafe fn`. |

Where `unsafe` is necessary (FFI bindings and operating system calls), keep each block as small as the call it wraps and put a `// SAFETY:` comment directly above it that states why the call is sound:

```rust title="crates/iptproxy-sys/src/lib.rs"
pub fn snowflake_port() -> u16 {
    // SAFETY: no arguments; returns the listener port (0 until it binds).
    u16::try_from(unsafe { EpixSnowflakePort() }).unwrap_or(0)
}
```

Do not add `unsafe` to a crate that currently has none without discussing it in an issue first, and never remove a `forbid` attribute to make a change compile.

### Error handling

Three patterns are in use, each with its own place.

**Library crates define a typed error with `thiserror`.** `epix-core` is the model: one `Error` enum, `#[from]` conversions for the errors it wraps, and a `Result` alias.

```rust title="crates/epix-core/src/error.rs (excerpt)"
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("invalid address: {0}")]
    InvalidAddress(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, Error>;
```

**Command and service layers return `Result<T, String>`.** The code that answers a xite's API call or drives the node (most of `epix-ui`, and parts of `epix-plugins`, `epix-evx`, `epix-browser` and `epix-node`) returns a message string as its error. The command layer passes that string back to the caller as the `error` field of the response, so a xite developer or a user may read it. Write the message for that reader.

**`anyhow` is not a workspace convention.** It appears only in `epix-mirror`, a command line tool. Do not introduce it into library crates.

Whichever pattern applies, follow the one the crate you are editing already uses.

### Tests

**Where tests live**

| Kind | Location | Notes |
| --- | --- | --- |
| Unit tests | A `#[cfg(test)] mod tests { ... }` block at the end of the source file | The default for small modules. |
| Larger unit test modules | `src/tests.rs` (or `src/<topic>_tests.rs`), declared with `#[cfg(test)] mod tests;` | Preferred when tests need fixed keys or salts. See below. |
| Integration tests | `crates/<crate>/tests/*.rs`, one file per behavior, for example `crates/epix-ui/tests/first_load.rs` | Fixtures such as `crates/epix-crypt/tests/vectors.json` sit beside them. |
| Diagnostics and benchmarks | `crates/<crate>/examples/` | Tools that never ship. CI compiles them through `--all-targets`. |
| Vendored crate tests | Inside `vendor/<crate>/` | Run by manifest path. The crates are excluded from the workspace. |
| Wrapper and launcher JavaScript | `ui/tests/*.test.cjs`, `crates/epix-browser/tests/*.test.cjs` | Run with `node --test`. |
| Build, packaging and shell checks | `scripts/test_*.py`, `packaging/**/test-*.py`, `shells/*/tests/` | Plain Python and Node.js runners. |

**Keep test-only secrets out of production files.** Code scanning ignores `**/tests/**`, `**/benches/**`, `**/examples/**` and `**/src/tests.rs`, because a known-answer test has to pin a key or a salt and that is not a leaked secret. A unit test written inline in a production file cannot be excluded by path. If your test needs a fixed cryptographic value, put it in `src/tests.rs` or an integration test. The secret scanner applies the same idea: paths under `tests`, `fixtures` and `examples` are allowlisted.

**Name a test for the behavior it protects.** Test names are full snake case statements that still make sense in a failure log months later:

```text
untrusted_schema_index_cannot_attach_an_external_database
failed_schema_upgrade_preserves_existing_data
diff_parser_rejects_non_string_insertions
```

**Write the failing test first for a bug fix.** The repository's validation records list each confirmed issue next to the regression test that reproduced it against the original code. Follow the same practice: add a regression test that fails without your fix.

**Stay on loopback.** The CI configuration notes that the runtime, UI and wire suites bind loopback addresses only. Keep it that way. A test that needs the network, a lab environment or minutes of real time is marked ignored with the reason in the attribute, so that it is skipped by default and self-explanatory when someone runs it on purpose:

```rust
#[ignore = "takes 310s: waits out the real IDLE_TIMEOUT"]
```

**Do not weaken compatibility tests.** Some suites are contracts with data that already exists on the network: the `epix-crypt` vectors generated from the Python implementation, and the frozen EDX slice format golden vectors. If your change makes one of them fail, treat that as a sign that it breaks compatibility with existing nodes or data, and discuss it in an issue before you go further. See [Python interoperability](../internals/python-interop.md) and [EDX](../internals/edx.md).

**Remember platform-specific code.** Filesystem transactions, clock handling and confinement behave differently per operating system, and CI has separate Windows, macOS, Android and iOS jobs for them. If you change such code, say in the pull request which platforms you tested on.

### Dependencies and advisories

- **Justify every accepted advisory.** `deny.toml` and `osv-scanner.toml` list each ignored advisory with the reason it does not apply or cannot be fixed yet, and the condition for dropping it. `cargo audit` in the security workflow carries a matching list of `--ignore` flags. If an exception is truly needed, add it in all of the places that apply, with the same reasoning.
- **Prefer a fix to an ignore.** When upstream has a fix that has not been released, the repository backports it as a vendored patch. One patch note states it outright: "Do not replace it with an advisory ignore."
- **Mind the platform profiles.** The mobile builds select features explicitly, and CI asserts the boundaries. For example, the iOS profile must not include BitTorrent, and targets that cannot run EVX must not link its runtime (`scripts/check-platform-features.py`, `scripts/check-evx-platforms.py`). Put a new platform-specific dependency behind a feature and check that both scripts still pass.
- **Respect the crate boundaries that CI asserts.** The native messaging host `epix-nmh` must not depend on `epix-chain` or resolve xID names itself. It has to ask the node. CI fails the build if that boundary is crossed.
- **Sources.** Dependencies come from crates.io. The few git sources (the embedded I2P router and the Reticulum mesh stack) are pinned to exact revisions.

### Vendored patches

When a dependency needs a change that upstream has not released, a patched copy lives under `vendor/<crate>/`. At the time of writing these are `ark-relations`, `askama_derive`, `emissary-util`, `rdrand`, `reticulum`, `rln`, `rusqlite` and `saturating-time`. The pattern has four parts.

1. **A minimal copy.** The upstream source with the smallest change that solves the problem. Upstream license files are kept, and so is the original manifest as `Cargo.toml.orig` where the manifest was normalized.
2. **An `EPIXNET_PATCH.md` file** in the crate folder that records:
    - the exact upstream version, repository and commit, and the SHA-256 of the registry archive
    - why the patch exists, with links to the advisory or upstream issue
    - precisely what changed, and what was left untouched
    - how to validate it, including the test command
    - when to remove it (for example, when upstream publishes a compatible release)
3. **Exclusion from the workspace.** The crate is listed in the `exclude` array of the root `Cargo.toml`, so that it keeps its own dependency graph and tests.
4. **A `[patch]` entry with a comment** in the root `Cargo.toml` that summarizes the reason and points at the patch note:

    ```toml title="Cargo.toml"
    [patch.crates-io]
    # Keep Arti and r2d2 on their compatible rusqlite API while using patched SQLite.
    # See vendor/rusqlite/EPIXNET_PATCH.md.
    rusqlite = { path = "vendor/rusqlite" }
    ```

If you change a vendored crate, update its `EPIXNET_PATCH.md` in the same commit and run its tests by manifest path:

```sh
cargo test --manifest-path vendor/saturating-time/Cargo.toml
```

Keep a vendored patch narrow. The existing notes repeatedly state what was not changed (wire formats, cryptographic primitives, public APIs), and a reviewer will look for the same statement in yours.

### Comments and documentation

- **Explain why.** Comments in the workspace record the reason for a decision: the bug that forced it, the constraint it respects, the condition under which it can be removed. A comment that restates the code adds nothing.
- **Mark frozen contracts.** Constants and formats that other nodes depend on carry a doc comment that says so, such as the EDX chunk group size, which "can never change without re-rooting every object on the network".
- **Write a design note for a subsystem.** Larger features have a Markdown document in the repository's `docs/` folder (for example `docs/channels.md`, `docs/evx.md`, `docs/wrapper-sandbox.md`). Update it when you change the behavior it describes. Those notes use the same restrained tone as these docs: they state what was verified, and what a test does not prove.

### CI workflow files

If your change touches `.github/workflows`, follow what the existing files do:

- The workflows that run on pull requests start from `permissions: {}` at the workflow level and grant each job only what it needs, usually `contents: read`.
- Those workflows pin third-party actions to a full commit SHA with the version in a trailing comment.
- Build and test jobs set a `timeout-minutes` value well below the platform default, so that a stalled runner fails fast.
- Non-obvious steps carry a comment with the reason they exist.

## Commits, branches and pull requests

**Branches** are named for the kind of change and a short description, separated by a slash: `fix/tor-status-lock-deadlock`, `feat/transfer-chunk-map`, `docs/headless-data-dir-ownership`, `ci/build-on-prerelease`.

**Commit subjects** are plain imperative sentences that describe the effect, with a capital first letter and no trailing period:

```text
Keep the file-server port from being shared on Windows (#750)
Fix serverInfo deadlock between Tor status reads and writes (#749)
Preserve owner-key recovery metadata for new xites (#723)
```

Recent pull requests are squash merged, so the pull request title becomes the subject on `main` and GitHub appends the number. Write the title with that in mind. Two exceptions are visible in the history: Dependabot uses `build(deps): bump <crate> from <old> to <new>`, and commits before October 2026 often carry a conventional prefix such as `fix:` or `feat(scope):`. Either form is understood, but new work follows the plain style.

**Commit bodies** explain the cause and the fix in short sentences, wrapped at about 72 columns: what the user saw, why it happened, what the code does now, and anything deliberately left out. The organization guidelines put it as explaining why, not only what.

**Pull request descriptions** fill in the organization template: a description, related issues such as `Closes #123`, the type of change, how it was tested, and the checklist. For a bug fix, recent descriptions in the node repository use headings such as **Problem**, **Cause**, **Fix** and **Tests**, which is a good shape to copy. State exactly what you ran, and say what you could not test, such as a platform you do not have.

**Scope.** Keep a pull request focused on one change. Add or update tests with it, and update the documentation it affects.

## Official xites

The official xites written for EpixNet (Dashboard, Epix Talk, Epix Mail, Epix Post, Epix Blog, Epix Wiki, Epix Sites, DeFlix and the xID manager) share a deliberately simple style. It keeps each xite readable by anyone with a text editor, and it means the JavaScript a peer receives is the same source you read in the repository. The [repository list](index.md#official-xites) has the links.

Epix Explorer is the exception. It is a fork of the ping-pub explorer with its own Vue and TypeScript toolchain, and it follows that project's conventions. If you are building your own xite, you are also free to use any framework. See [React and bundlers](../libraries/react.md).

### Plain JavaScript, no build step

The xites are written in plain ES6 JavaScript and CSS. There is no compiler, bundler or package install between the repository and the running page. The repository folder is the xite: you edit a file, reload, and see the result.

- Do not add a build step, a transpiled language or a runtime dependency on a package registry.
- Do not make the page depend on scripts, styles or fonts from other hosts. A xite should keep working for a reader whose node has no route to the wider internet. See [The wrapper sandbox](../build/sandbox.md).

Epix Wiki has a `package.json`, but only for development: it installs the browser used by the tests, and none of it is part of the published xite.

### One class per file, wrapped in a function

Each file under `js/` defines one class or one module of helpers, and the whole file is wrapped in an immediately invoked function expression (IIFE). The file publishes exactly one name by assigning it to `window`. The examples in this section are shortened from Epix Talk:

```js title="js/utils/Time.js"
(function() {
class Time {
  since(time) {
    var now = Date.now() / 1000;
    var secs = now - time;
    var back;
    if (secs < 60) {
      back = "Just now";
    } else if (secs < 60 * 60) {
      back = Math.round(secs / 60) + " minutes ago";
    } else {
      back = Math.round(secs / 60 / 60) + " hours ago";
    }
    return back;
  }
}

window.Time = new Time();
})();
```

The wrapper matters because every file is loaded as a classic script, and classic scripts share one global scope. Without it, a top-level `class`, `let` or `const` in one file collides with the same name in another file, and every helper variable becomes a global that any other script can overwrite. With it, the only thing a file adds to the global scope is the name it assigns on purpose.

The same shape is used for components and for the application object:

```js title="js/TopicList.js"
(function() {
class TopicList {
  constructor() {
    this.parent_topic_uri = undefined;
    this.limit = 31;
  }
}

Object.assign(TopicList.prototype, LogMixin);
window.TopicList = new TopicList();
})();
```

```js title="js/EpixTalk.js"
(function() {
var EpixFrame = window.EpixFrame;

class EpixTalk extends EpixFrame {
  constructor() {
    super();
    this.MIN_VERSION = "0.0.2";
  }
}

window.Page = new EpixTalk();
})();
```

Conventions to keep when you add a file:

- Name the file after the class it defines, in PascalCase: `TopicList.js` defines `TopicList`.
- Put application code directly in `js/`, shared helpers in `js/utils/`, and third-party code in `js/lib/`.
- The main application class extends [EpixFrame](../libraries/epixframe.md) and is published as `window.Page`. Other files reach the node through `Page.cmd(...)`.
- Classes that do not extend EpixFrame get logging by mixing in `LogMixin`, as `TopicList` does above. `js/utils/LogMixin.js` is the one file that declares a plain global on purpose.
- A file can read what it depends on from `window` at the top of the wrapper, as `EpixTalk.js` does with `EpixFrame`.

### Script order in index.html

Because there is no bundler, `index.html` lists every script in dependency order with individual `<script>` tags: vendored libraries first, then utilities, then the components and the application class.

```html title="index.html"
<script src="js/lib/marked.min.js"></script>
<script src="js/lib/epixframe.js"></script>
<script src="js/lib/epixkit.js"></script>

<script src="js/utils/LogMixin.js"></script>
<script src="js/utils/Text.js"></script>
<script src="js/utils/Time.js"></script>

<script src="js/TopicList.js"></script>
<script src="js/TopicShow.js"></script>
<script src="js/User.js"></script>
<script src="js/EpixTalk.js"></script>
```

A new file does nothing until you add its tag in the right place. A file that is used before it loads fails with a reference error at startup.

### Vendored libraries

Third-party libraries are committed to the repository under `js/lib/` (or a top-level folder for a large one, such as the Dashboard's `chartjs/`). That includes the project's own libraries: a xite carries its own copy of `epixframe.js`, and of `epixkit.js` if it connects a wallet.

- Vendored dependencies keep their own licenses.
- EpixFrame and EpixKit are maintained in their own repositories. See [Libraries](../libraries/index.md).

### content.json and signing belong to the owner

`content.json` is checked into each xite repository, but its signed file list and signatures describe the last version the owner published. They are not something a contributor can produce.

- Do not hand-edit the file hashes or signatures in `content.json`, and do not try to sign a xite you do not own.
- Do not reuse the checked-in signed metadata as a signature for changed source. After a merge, the owner signs again from a node that holds the owner key, which regenerates the file list and signatures, and then publishes.
- Until the owner signs and publishes, a merged change exists only in the repository. Source changes alone do not update the signed content that peers already hold.
- Settings that live in `content.json`, such as moderation or trust parameters, are also changed by the owner signing a new version. Propose such a change in the pull request text and leave the decision to the owner.

[content.json reference](../build/content-json.md) describes the file, and [Publishing](../build/publishing.md) describes what the owner does.

### Tests

Where a xite has tests, they live in `tests/` and run on the Node.js built-in test runner, with nothing to install:

```sh
node --test tests/*.test.cjs
```

The IIFE style is what makes this work. A test loads the real page script into a `node:vm` context with stand-ins for the browser globals, then reads the class back from `window`. This example is shortened from the Dashboard's test suite:

```js title="tests/site-list-order.test.cjs"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const now = Date.parse("2026-10-06T12:00:00Z") / 1000;
const day = 24 * 60 * 60;

function siteList(orderby, sites) {
  const context = {
    LogMixin: {},
    Time: { timestamp: () => now },
    Page: { settings: { sites_orderby: orderby } },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/SiteList.js"), "utf8"), context, {
    filename: "js/SiteList.js"
  });
  // Skip the constructor: it wires timers and Page promises.
  const list = Object.create(context.SiteList.prototype);
  Object.assign(list, { sites: sites, filtering: "", limit: 100 });
  return list;
}

function site(address, settings) {
  return {
    favorite: false,
    row: {
      address, peers: 0,
      settings: Object.assign({ size: 0, peers: 0, downloaded: now - 30 * day }, settings),
      size_limit: 10,
      content: { title: address },
    },
  };
}

test("xites sort newest first when ordered by date", () => {
  const list = siteList("modified", [
    site("post", { modified: now - 9 * day }),
    site("dash", { modified: now - 1 * day }),
    site("talk", { modified: now - 3 * day }),
  ]);
  const order = list.sortRows(list.sites).map(site => site.row.address);
  assert.deepEqual(order, ["dash", "talk", "post"]);
});
```

Test the shipped file, not a copy of its logic. Other patterns you will find:

| File name pattern | What it is | What it needs |
| --- | --- | --- |
| `tests/*.test.cjs` | Dependency-free regression tests | Node.js only. Check the README for the minimum version: Epix Talk and Epix Wiki need Node.js 22.13 or newer. |
| `tests/*-browser.cjs`, `tests/*.browser.cjs` | Browser checks that drive the real page in Chromium with controlled EpixFrame responses | Playwright, installed outside the xite folder and pointed to with an environment variable named in the README |
| `tests/*.native.cjs` | Checks against a running node | An isolated test profile. Never your everyday data folder. |
| `tests/*.html` | Manual browser fixtures | A local HTTP server and a person following the steps |

Several xite repositories run the dependency-free suite in a **Tests** workflow on every pull request. Epix Post's also runs `node --check` on every script, which is a quick way to catch a syntax error before you reload:

```sh
for file in js/*.js js/utils/*.js; do node --check "$file"; done
```

When you fix a bug, add a test that fails without the fix, as in the node repository.

### Translations

User-visible strings are English in the source and are translated through `languages/<code>.json` files, where each key is the English string. When you add or change a string, keep the English text stable where you can, because it is the lookup key for every existing translation. [Translating a xite](../build/i18n.md) covers the mechanism, and [Contribute a translation](index.md#contribute-a-translation) covers how to submit one.

### README

Each xite's README follows the same outline: what the xite does, its features, the file structure, the database tables if it has a database, the tech stack and the license. When your change adds a file, a table or a test command, update the README in the same pull request.
