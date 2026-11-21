# Improve these docs

This page explains how the documentation is organized, how to preview a change on your own machine, the writing rules that keep it consistent, and how a build is published as a xite. It is for anyone who wants to fix a typo, document a new feature, or maintain the docs xite.

## Where the docs live

The source is the [EpixZone/EpixNetDocs](https://github.com/EpixZone/EpixNetDocs) repository. It is a [MkDocs](https://www.mkdocs.org/) project that uses the Material theme.

| Path | Contents |
| --- | --- |
| `mkdocs.yml` | Site configuration and the navigation tree |
| `docs/en/` | The pages, written in Markdown |
| `docs/en/img/screenshots/` | Screenshots embedded in the pages |
| `docs/en/img/diagrams/` | Diagrams, as SVG files |
| `docs/en/assets/` | Fonts, brand files, the stylesheet, and downloadable files such as the AGENTS.md template |
| `docs/overrides/` | Theme overrides: the home page template and the wrapper bridge script |
| `scripts/build-xite.sh` | Builds the site and copies it into a xite folder |

Every page has an **edit** button (the pencil next to the title) that opens the matching file on GitHub.

## Preview a change locally

You need Python 3.9 or newer.

```sh
git clone https://github.com/EpixZone/EpixNetDocs.git
cd EpixNetDocs
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

Open `http://127.0.0.1:8000/`. The page reloads when you save a file.

Before you open a pull request, run a strict build. It fails on broken internal links, missing anchors and pages that are not in the navigation:

```sh
mkdocs build --strict
```

## Writing rules

The docs describe the current Rust node. The goal is that a reader can trust every command, parameter and default on the page.

- **Check the source.** Verify behavior against the code or the repository docs in [EpixZone/EpixNet](https://github.com/EpixZone/EpixNet) before you write it down. If you cannot verify a claim, leave it out.
- **Use the current vocabulary.** Write *xite*, not site, except in literal command names such as `siteInfo`. The [glossary](../reference/glossary.md) lists the terms.
- **Be precise about privacy.** Tor and I2P support does not guarantee anonymity, a valid signature does not make content safe or lawful, and availability depends on reachable peers. Do not promise more than the software does.
- **Write plainly.** Second person, short paragraphs, sentence case headings, American English, no marketing language.
- **Start each page the same way.** One H1 title, then a paragraph that says what the page covers and who it is for.
- **Keep it self-contained.** The docs are also a xite that must work offline. Do not embed images, scripts, fonts or frames from other hosts. Ordinary links to external pages are fine.
- **Link instead of repeating.** Use relative links to other pages, for example `../build/database.md`.

### Formatting you can use

````markdown
!!! warning "Back up your keys"
    Text of the callout, indented four spaces.

=== "Linux"

    Content for the first tab, indented four spaces.

=== "Windows"

    Content for the second tab.

```js title="js/app.js"
const info = await epixFrame.siteInfo();
```
````

Callout types are `note`, `tip`, `info`, `warning`, `danger` and `example`. Use `???` instead of `!!!` to make a callout collapsible.

### API reference pages

Each command in the [API reference](../api/index.md) is a level 3 heading that is exactly the command name, followed by a description, the required permission, a parameter table, the return value and an example. Keep that shape so that links such as `api/files.md#fileget` stay stable.

### Screenshots and diagrams

Screenshots are PNG files at 1440 by 900 pixels, taken from a node with a fresh profile so that no personal data appears. Put them in `docs/en/img/screenshots/` and give every image descriptive alt text. Diagrams are hand-written SVG files in `docs/en/img/diagrams/` that use `currentColor` and the theme variables, so they follow light and dark mode.

## How the docs work as a xite

The same build is served in three ways, and the page cannot assume which one it is in:

| How it is opened | Page origin | What differs |
| --- | --- | --- |
| A regular web server | The server's origin | Nothing. The bridge script does nothing. |
| A node on loopback, or a `.epix` address in EpixNet Browser | A content origin that belongs to the xite | Storage and requests work normally. Links navigate the inner frame only. |
| A node reached through a LAN address or a public gateway | An opaque origin | No `localStorage`, same-host requests need the xite's `ajax_key`, workers cannot load from a URL. |

`docs/overrides/partials/xite-bridge.js` is inlined into every page and handles the last two cases. It introduces the page to the wrapper, sets the tab title, mirrors the current page and fragment into the address bar, and in the opaque case supplies in-memory storage, adds the `ajax_key` to the search index request, and starts the search worker from a blob. The [sandbox guide](../build/sandbox.md) explains the underlying rules, which apply to any xite.

Two theme behaviors are deliberately switched off because they contact other hosts: web fonts from a font service (the fonts ship in `docs/en/assets/fonts/`) and the live repository statistics in the header (`docs/overrides/partials/source.html`). Keep it that way. A reader on Tor or on an offline mesh must be able to use every page.

## Publish a build to the docs xite

Only a holder of the docs xite's owner key can publish. Everyone else can still run the first two steps to preview their change inside a real wrapper.

1. Build and copy the site into the xite folder inside your node's [data directory](../internals/data-directory.md):

    ```sh
    scripts/build-xite.sh "<data folder>/data/<docs xite address>"
    ```

    The script runs a strict build, then mirrors `site/` into the folder. It keeps `content.json`, and it leaves out source maps, sitemaps and unused search language files.

2. Open the xite in your node and click through it. Your node serves the files in that folder as they are, so you see the new build immediately, before anything is signed.

3. Open the [sidebar](../start/dashboard.md) and choose **Sign & Publish**. Signing rewrites the file list in `content.json`, and publishing announces the new version to peers. See [Sign and publish](../build/publishing.md).

!!! tip "Check both modes before you sign"
    Open the xite once through `http://127.0.0.1:42222/` and once through a LAN address of the same machine. The second route uses the opaque sandbox, which is where a broken search box or a missing font shows up first.
