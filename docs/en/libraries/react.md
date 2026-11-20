---
description: The status of create-react-epixnet-app and a practical guide to building xites with React, Vue or any bundler, covering base paths, routing, storage, assets and the build-and-sign workflow.
---

# Frameworks and bundlers

This page covers two things: the current state of `create-react-epixnet-app`, the official React scaffolding project, and the rules that any bundler-based xite (React, Vue, Svelte or plain modules with Vite, webpack or similar) has to follow to run inside EpixNet. It is for developers who prefer a framework and a build step over hand-written script tags.

A xite does not need a framework. Most official xites are plain JavaScript loaded with script tags. Frameworks work well too, as long as the build output is a self-contained folder of static files with relative URLs.

## create-react-epixnet-app

!!! warning "Status: not usable as published"
    At the time of writing, the public repository [EpixZone/create-react-epixnet-app](https://github.com/EpixZone/create-react-epixnet-app) contains only a short README, a license and repository housekeeping files. The generator script has not been published there, and there is no npm package of that name. Until that changes, set up your project with a bundler directly, as described in the rest of this page.

The project is a shell script that wraps Create React App. This section describes its design, which dates from August 2025, so that you know what to expect if you come across a copy and why this guide recommends a different route today.

### What it is designed to do

The script takes an empty project folder and the folder of an existing xite:

```text
create-react-epixnet-app.sh <project-dir> <xite-dir> [create-react-app options]
```

It then:

1. Runs `npx create-react-app` in the project folder.
2. Copies the xite's `content.json` into the project's `public/` folder so that every build carries it.
3. Adds a wrapper-bridge module under `src/epixnet/` with history patches for client-side routers.
4. Replaces the default `App.js` with an example that calls `siteInfo` and `serverInfo`, plus example components.
5. Sets `"homepage": "./"` in `package.json` so the build uses relative URLs.
6. Replaces the `start` and `build` scripts. `build` runs the production build and copies it into the xite folder. `start` rebuilds and synchronizes on every source change.
7. Writes the xite folder path and address to a `.env` file that is excluded from git.

### Limits

- **It predates the current libraries.** The bridge it generates is built by concatenating a file named `ZeroFrame.js` that it looks for in the xite's `js/` folder and then anywhere in the folder that contains the xite (normally the node's data folder). Current xites vendor [EpixFrame](epixframe.md) instead, and the page a new xite starts from ships no bridge file, so the script stops with an error unless some older xite in that folder still carries a `ZeroFrame.js`, in which case it builds on that legacy file.
- **It is tied to one toolchain version.** It patches files inside `node_modules/react-scripts` with regular expressions, which only works for the versions of Create React App it was written against.
- **It targets Linux.** It requires `bash`, `node`, `npx`, `perl`, `rsync` and `inotifywait`, and its error messages give Debian and Ubuntu install commands.
- **Its `start` script can delete xite data.** It synchronizes the build folder into the xite folder with `rsync --delete`, which removes every file in the xite that is not part of the build, including a `data/` folder with user content or a `dbschema.json` you added by hand.
- **It overwrites `content.json` on every build.** The copy taken when the project was generated is part of each build, so it replaces the xite's current, signed `content.json` until you sign again.
- **Its messages mention port 43110.** The current node serves on `127.0.0.1:42222` by default (see [Run a node](../start/running.md)).

## The recommended route: any bundler, five rules

Pick the bundler and framework you like, then make the build follow these rules. Epix Explorer ([EpixZone/epix.explorer](https://github.com/EpixZone/epix.explorer)), a Vite and Vue application published as a xite, is a working reference for the first four.

### 1. Use a relative base path

A xite is not always served from the root of a host. In the path-based mode, which is what a visitor gets from a node reached over the LAN or from a public gateway, its files live under `/<address>/`. In the EpixNet Browser, and when a local node is opened through `127.0.0.1` or `localhost`, they live at the root of a per-xite host. A build that references `/assets/app.js` breaks in the first case. A build that references `./assets/app.js` works in all of them.

=== "Vite"

    ```js title="vite.config.js"
    import { defineConfig } from "vite";
    import react from "@vitejs/plugin-react";

    export default defineConfig({
      base: "./",
      plugins: [react()],
    });
    ```

=== "Create React App"

    ```json title="package.json"
    {
      "homepage": "./"
    }
    ```

Check the built `index.html` afterwards. Every `src` and `href` should be relative. Watch for absolute paths you wrote by hand, such as `<link href="/style.css">` or `fetch("/data.json")`.

### 2. Route with the hash or the query string

Your page runs in an iframe. The address bar belongs to the wrapper (the trusted page the node puts around every xite), not to your application. A router that rewrites paths with the History API is therefore the wrong tool: the paths it invents are not files in your xite, and the visible address does not follow it.

Two approaches work:

- **Hash routing.** Use your router's hash mode (`createHashRouter` or `HashRouter` in React Router, `createWebHashHistory` in Vue Router). Routes live after `#` inside the frame and nothing else is needed. This is what Epix Explorer does.
- **Query-string routing through the wrapper.** Keep the route in the query string and change it with the `wrapperPushState` command, then listen for `wrapperPopState`. This puts the route in the visible address bar, so links can be shared and Back works across reloads. Epix Mail and Epix Post do this. See [History and deep links](epixframe.md#history-and-deep-links).

For links that other pages point at, remember that the wrapper passes its query string to your page on load. Epix Explorer accepts links such as `?tx=<hash>` and converts them to hash routes at startup:

```js title="src/router.js"
const params = new URLSearchParams(window.location.search);
const tx = params.get("tx");
if (tx) {
  window.location.replace("#/tx/" + tx);
}
```

When you parse the query string yourself, ignore the `wrapper_nonce` parameter. The wrapper adds it to every page load.

### 3. Do not depend on browser storage or service workers

In the path-based mode your page runs in an opaque origin. There, reading `window.localStorage` throws, and there are no cookies, no IndexedDB and no service workers. In the EpixNet Browser and through a local node's own address each xite has a real origin and these work, but your xite cannot choose how it is opened. See [The wrapper sandbox](../build/sandbox.md).

- Wrap every direct use of `localStorage`, `sessionStorage` and `navigator.serviceWorker` in `try`/`catch`. Many framework plugins (theme switchers, state persistence) read storage at import time and will stop your application before it renders.
- Store settings that must survive in every mode with `wrapperGetLocalStorage` and `wrapperSetLocalStorage`, which keep one value per xite and user. See [Wrapper commands](../api/wrapper.md).
- Turn off progressive web app plugins and generated service workers. Offline availability is already the node's job.

```js title="src/safe-storage.js"
export function readSetting(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}
```

Epix Explorer goes further. A short inline script at the top of its `index.html` detects the sandbox, speaks the wrapper protocol directly, and installs a replacement `localStorage` backed by the wrapper before the application bundle loads. That approach lets third-party code that expects `localStorage` run unchanged. Its [`index.html`](https://github.com/EpixZone/epix.explorer/blob/master/index.html) is worth reading if you need the same.

### 4. Keep every asset local

Bundle or copy everything the page needs: scripts, styles, fonts, images, translation files. Do not reference a CDN, a font service or an analytics script. The reasons are the same as for hand-written xites, see [Vendoring](index.md#vendoring-ship-local-copies).

Inside the sandbox, different kinds of request behave differently:

| Request | Works without extra steps |
| --- | --- |
| Scripts, styles, images, audio, video from your xite | Yes |
| ES modules and dynamically imported chunks from your xite | Yes |
| Fonts from your xite | Yes |
| `fetch()` or `XMLHttpRequest` for your xite's own files | Only with the xite's `ajax_key` in the URL, in the path-based mode |
| Files that belong to another xite | Only with the `Cors:<address>` permission |

Code splitting therefore works. Runtime data loading with `fetch()` needs care: use the `fileGet` command, or add the key as shown in [Fetching your own files](epixframe.md#fetching-your-own-files). Importing JSON at build time avoids the question entirely.

### 5. Build beside the xite, then copy

Bundlers empty their output folder before each build. Your xite folder holds things the bundler knows nothing about: the signed `content.json`, possibly a `dbschema.json`, and a `data/` folder with content. Never point the bundler's output directory at the xite folder.

Build into the project's own `dist/` or `build/` folder, then copy the result into the xite folder:

```sh
npm run build
cp -r dist/. "<data folder>/<address>/"
```

Two details matter:

- **Remove stale bundles.** Bundlers put a content hash in file names, so every build adds new files. Old ones left behind are signed and distributed with the xite. Delete the previous build's hashed files from the xite folder before copying, and nothing else.
- **Sign after copying.** Signing rebuilds the file list in `content.json` from what is in the folder. Sign and publish through the sidebar or the command line as described in [Signing and publishing](../build/publishing.md).

Keep the project source in its own repository, outside the xite folder, so that `node_modules` and source files are never signed into the xite. If you do keep extra files in the xite folder, exclude them with the `ignore` pattern in [content.json](../build/content-json.md).

## Use EpixFrame from a bundled app

Vendor the ES module build (`dist/epixframe.esm.js`) into your source tree and import it. Create the instance once, at module load, and expose a promise that resolves when the connection is ready.

```js title="src/epix.js"
import { epixFrame } from "./lib/epixframe.esm.js";

// One shared instance for the whole application.
export const frame = epixFrame();

// Resolves the first time the wrapper reports an open connection.
export const ready = new Promise((resolve) => {
  frame.once("openWebsocket", resolve);
});
```

Import this module before anything that might rewrite the page URL, because the library reads its nonce from the URL when the instance is created.

A React hook that loads the xite information and follows updates:

```jsx title="src/useSiteInfo.js"
import { useEffect, useState } from "react";
import { frame, ready } from "./epix.js";

export function useSiteInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let active = true;

    ready
      .then(() => frame.siteInfo())
      .then((result) => {
        if (active) setInfo(result);
      });

    function onRequest(cmd, message) {
      if (cmd === "setSiteInfo" && active) setInfo(message.params);
    }
    frame.on("request", onRequest);

    return () => {
      active = false;
      frame.off("request", onRequest);
    };
  }, []);

  return info;
}
```

```jsx title="src/App.jsx"
import { useSiteInfo } from "./useSiteInfo.js";

export default function App() {
  const info = useSiteInfo();
  if (!info) return <p>Connecting to EpixNet...</p>;

  return (
    <main>
      <h1>{info.content.title}</h1>
      <p>{info.peers} peers</p>
    </main>
  );
}
```

For TypeScript, copy the declaration file as described in [TypeScript](epixframe.md#typescript).

[EpixKit](epixkit.md) is a classic script, not a module. Load it with a script tag in `index.html` (from a local file that your build copies as a static asset) and use `window.EpixKit` from your code.

## Development workflow

A bundler's development server opens your application at its own address, outside the wrapper. There is no nonce in the URL and nobody answers the commands, so every `cmd()` promise stays pending. `frame.isEmbedded` is `false` in that situation.

You have two workable loops:

- **Build and view through the node.** Run the bundler in watch mode, copy the output into the xite folder after each build, and reload the xite in the browser that is connected to your node. This is slower than hot reloading but exercises the real sandbox, which is where most surprises come from.
- **Stub the node for interface work.** When `frame.isEmbedded` is `false`, substitute fixed data for the handful of commands your components need. Use this for layout and styling only, and test through the node before you publish.

```js title="src/epix.js (development stub)"
export async function getSiteInfo() {
  if (!frame.isEmbedded) {
    return { address: "<address>", peers: 1, content: { title: "Local preview" } };
  }
  await ready;
  return frame.siteInfo();
}
```

If you work with an AI coding agent, put these rules in the project's context file so that it does not add a history-mode router, a CDN link or a service worker. The [AGENTS.md template](../ai/agents-md.md) includes them.

## Checklist before you publish

- [ ] The built `index.html` references only relative URLs.
- [ ] No request leaves the xite for scripts, styles or fonts.
- [ ] The application starts with `localStorage` unavailable.
- [ ] No service worker is registered.
- [ ] Routing uses the hash or the wrapper history commands.
- [ ] The xite folder contains the current build only, plus `content.json` and your data.
- [ ] You opened the xite through your node, not only through the development server.
- [ ] The xite is signed after the final copy.

## Next steps

- [Anatomy of a xite](../build/anatomy.md) explains the wrapper and the page lifecycle.
- [The wrapper sandbox](../build/sandbox.md) lists exactly what a page can and cannot do.
- [EpixFrame](epixframe.md) documents the library used in the examples above.
