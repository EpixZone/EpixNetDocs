---
description: Every official EpixNet library, kit and template in one place, with guidance on which to use and how to vendor them into a xite.
---

# Libraries and kits

This page lists every official library, kit and template for building xites (EpixNet sites and apps), says what each one is for, and explains how to ship them inside your xite. It is for developers who want to know what already exists before writing their own plumbing.

Nothing here is required. A xite is plain HTML, CSS and JavaScript, and the node speaks a small message protocol that you can implement yourself. The libraries save you from doing that, and the official xites show how they fit together in real applications.

<div class="grid cards" markdown>

-   :material-swap-horizontal:{ .lg .middle } **EpixFrame**

    ---

    The JavaScript bridge between your page and the node. It handles the wrapper handshake and exposes the EpixFrame API as promises or callbacks.

    [:octicons-arrow-right-24: EpixFrame guide](epixframe.md)

-   :material-wallet-outline:{ .lg .middle } **EpixKit**

    ---

    A single-file wallet connector for Epix Chain. It discovers installed EVM wallets, shows a picker, switches network and hands you the provider.

    [:octicons-arrow-right-24: EpixKit reference](epixkit.md)

-   :material-react:{ .lg .middle } **React and bundlers**

    ---

    The status of `create-react-epixnet-app`, and the settings any bundler-based xite needs: relative base path, routing, storage and local assets.

    [:octicons-arrow-right-24: Frameworks and bundlers](react.md)

-   :material-file-sign:{ .lg .middle } **Smart contract kits**

    ---

    Solidity projects for tipping, airdrops, verifiable randomness and token standards, with the interfaces for the xID and VRF precompiles.

    [:octicons-arrow-right-24: Contract kits](contracts.md)

-   :material-palette-outline:{ .lg .middle } **UI kit and brand assets**

    ---

    Design tokens and component CSS with light and dark themes, plus the Epix logos, icons and app icons.

    [:octicons-arrow-right-24: UI kit](ui-kit.md)

-   :material-source-repository:{ .lg .middle } **Reference xites**

    ---

    The official xites are open source and use these libraries in production. Read them when you want a worked example.

    [:octicons-arrow-right-24: Reference implementations](#reference-implementations)

</div>

## At a glance

| Name | What it is for | Language | Footprint | How to get it | Repository |
| --- | --- | --- | --- | --- | --- |
| **EpixFrame** | Talking to the node from a xite page: commands, events, wrapper handshake | JavaScript (UMD and ES module builds), TypeScript declarations | One file, about 12 KB minified or 29 KB unminified, no dependencies | Copy a file from `dist/` at tag `v1.1.0` into your xite | [EpixZone/epixframe](https://github.com/EpixZone/epixframe) |
| **EpixKit** | Connecting an EVM wallet (Epix Wallet, MetaMask, Rabby and others) to a xite | JavaScript (one script, global `EpixKit`) | One file, about 18 KB unminified, no dependencies | Copy `epixkit.js` at a pinned commit (the repository has no tagged releases) | [EpixZone/epixkit](https://github.com/EpixZone/epixkit) |
| **create-react-epixnet-app** | Scaffolding a React xite | Bash, Create React App | Not applicable | Not usable as published, see [Frameworks and bundlers](react.md) | [EpixZone/create-react-epixnet-app](https://github.com/EpixZone/create-react-epixnet-app) |
| **epix-tipping** | Tipping content creators in native EPIX, with on-chain stats and xID lookups | Solidity 0.8.24, Foundry | 3 source files | Clone, or copy the ABI fragments you need | [EpixZone/epix-tipping](https://github.com/EpixZone/epix-tipping) |
| **epix-airdrop** | Pool-based airdrop with a boost for xID holders | Solidity, Foundry | 3 source files | Clone, or copy the ABI fragments you need | [EpixZone/epix-airdrop](https://github.com/EpixZone/epix-airdrop) |
| **vrf-contracts** | Consuming the chain's randomness beacon from a contract | Solidity 0.8.24, Foundry | 2 source files | Clone, or copy `IVRF.sol` | [EpixZone/vrf-contracts](https://github.com/EpixZone/vrf-contracts) |
| **contract_examples** | ERC-20, ERC-721 and ERC-1155 starting points | Solidity 0.8.18, Hardhat, OpenZeppelin | 3 contracts with deploy scripts, tests for two of them | Clone | [EpixZone/contract_examples](https://github.com/EpixZone/contract_examples) |
| **Epix UI kit** | Design tokens and component classes for a consistent look | CSS only | Two files, about 7 KB and 18 KB, no JavaScript | Copy `ui-kit/epix-tokens.css` and `ui-kit/epix-kit.css` | [EpixZone/assets](https://github.com/EpixZone/assets) |
| **Brand assets** | Logos, icons, app icons, patterns | SVG, PNG, ICO | Individual files | Copy the files you use | [EpixZone/assets](https://github.com/EpixZone/assets) |
| **Avatar helper** | Displaying xID profile avatars through the node's shared thumbnail cache | JavaScript (one script, global `EpixAvatar`) | One file | Copy [`ui/media/epix-avatar.js`](https://github.com/EpixZone/EpixNet/blob/main/ui/media/epix-avatar.js) from the node repository | [EpixZone/EpixNet](https://github.com/EpixZone/EpixNet) |

All of these repositories are MIT licensed according to their license file or README.

## Which one do I need?

- **Every interactive xite**: [EpixFrame](epixframe.md). You need it as soon as the page reads xite information, queries the database, writes user content or shows a notification. A purely static xite needs no library at all.
- **A xite that sends transactions or reads a wallet address**: [EpixKit](epixkit.md) for the connection, plus an EVM library of your choice for encoding calls. The official xites use ethers v6.
- **A xite with its own contract**: start from one of the [contract kits](contracts.md), then follow the [contract tutorial](../web3/contracts.md).
- **A xite that should look at home next to the official ones**: the [UI kit](ui-kit.md).
- **A React, Vue or Svelte project**: read [Frameworks and bundlers](react.md) first. The build needs a few settings to run inside the wrapper.

If you work with an AI coding agent, give it this section of the docs together with the [AGENTS.md template](../ai/agents-md.md) so it vendors the libraries instead of reaching for a package registry or a CDN.

## Vendoring: ship local copies

Vendoring means copying a library file into your xite's own folder and loading it with a relative path. Every official xite does this, and you should too.

```html title="index.html"
<script src="js/lib/epixframe.min.js"></script>
<script src="js/lib/epixkit.js"></script>
<script src="js/lib/ethers.umd.min.js"></script>
<script src="js/app.js"></script>
```

Do not load libraries, fonts or styles from a CDN. The reasons are practical:

- **Availability.** A xite is distributed by peers and can be opened with no internet connection at all, for example on a local network or a mesh link (see [Privacy and routing](../start/privacy.md)). A page that waits for a CDN does not load there.
- **Tor and I2P users.** A request to a third-party host leaves the EpixNet network. Depending on the visitor's settings it travels directly or through Tor, it can be slow or fail, and it tells that host that someone loaded your xite.
- **Integrity.** The files in your xite are listed in a signed `content.json` and verified by every peer. A script from a CDN is covered by no signature, yet it runs with everything your page is allowed to do. The Epix Airdrop xite records that the copy of EpixFrame served by a public CDN for `v1.0.0` did not match the bytes at the repository's tag, which is exactly the kind of drift signing protects you from.
- **The sandbox.** When a xite is served in the path-based fallback mode (a node reached over the LAN, or a public gateway), your page runs in an opaque origin and its requests carry `Origin: null`. Cross-origin requests made in CORS mode (ES modules, fonts, `fetch`) only succeed when the remote server accepts that origin. Loading another xite's files needs an explicit permission. See [The wrapper sandbox](../build/sandbox.md).

### A layout that works

The official xites keep third-party code in `js/lib/` and their own code beside it:

```text
my-xite/
  content.json
  index.html
  css/
    epix-tokens.css
    epix-kit.css
    app.css
  js/
    app.js
    lib/
      README.md
      epixframe.min.js
      epixframe-LICENSE.txt
      epixkit.js
      epixkit-LICENSE.txt
      ethers.umd.min.js
      ethers-LICENSE.md
```

### Record what you vendored

Keep a short `README.md` next to the vendored files that states where each one came from and its SHA-256 hash, and keep the license files. The Epix Airdrop xite does this:

```markdown title="js/lib/README.md"
| File | Source | SHA-256 |
| --- | --- | --- |
| `epixframe.min.js` | epixframe, tag v1.1.0, dist/epixframe.min.js | `<sha256>` |
| `epixkit.js` | epixkit, commit <commit>, epixkit.js | `<sha256>` |
| `ethers.umd.min.js` | ethers 6.13.4, UMD build | `<sha256>` |
```

Compute a hash with your platform's tool:

=== "Linux"

    ```sh
    sha256sum js/lib/epixframe.min.js
    ```

=== "macOS"

    ```sh
    shasum -a 256 js/lib/epixframe.min.js
    ```

=== "Windows"

    ```text
    certutil -hashfile js\lib\epixframe.min.js SHA256
    ```

### Updating a vendored library

1. Download the new file from the library's repository at a specific tag or commit, not from a branch name that moves.
2. Replace the file, update the source and hash in your `js/lib/README.md`, and read the library's changes.
3. Test the xite locally.
4. Sign and publish as usual. Signing rewrites the file list and hashes in `content.json`, so never edit those by hand. See [Signing and publishing](../build/publishing.md).

!!! tip "Third-party libraries follow the same rule"
    Anything else your xite depends on (an EVM library, a Markdown renderer, a sanitizer, fonts) should also be a local file. Prefer a single prebuilt browser file where the project offers one. Epix Talk, the xID manager and the Epix Airdrop xite all vendor the ethers v6 UMD build this way.

## Reference implementations

The official xites are the best documentation of how the pieces fit. Each repository is the xite's own folder, so the file layout you see is the layout that is published.

| Xite | Repository | Worth reading for |
| --- | --- | --- |
| Dashboard | [EpixDash-Xite](https://github.com/EpixZone/EpixDash-Xite) | A large EpixFrame application with the ADMIN permission, and `template-new/`, the page a newly created xite starts from |
| Epix Talk | [EpixTalk-Xite](https://github.com/EpixZone/EpixTalk-Xite) | The subclass pattern, user content, moderation, and tipping through EpixKit and ethers (`js/utils/Tipping.js`) |
| xID manager | [EpixNet-xAuth](https://github.com/EpixZone/EpixNet-xAuth) | Wallet state handling with EpixKit, including account and network change events (`js/wallet/Wallet.js`) |
| Epix Airdrop | [epix-airdrop-xite](https://github.com/EpixZone/epix-airdrop-xite) | The smallest complete web3 xite: one HTML file, the singleton pattern, a documented `js/lib/` folder |
| VRF Debugger | [vrf-debugger](https://github.com/EpixZone/vrf-debugger) | Calling the randomness beacon commands. Its derive panel passes a block height to `vrfDeriveRandom`, which expects a beacon value, so do not copy that call |
| Epix Mail | [EpixMail-Xite](https://github.com/EpixZone/EpixMail-Xite) | Encrypted messaging on the EpixFrame API |
| Epix Post | [EpixPost-Xite](https://github.com/EpixZone/EpixPost-Xite) | A merger xite with a hub |
| Epix Blog | [EpixBlog-Xite](https://github.com/EpixZone/EpixBlog-Xite) | A publishing xite with comments |
| Epix Wiki | [EpixWiki-Xite](https://github.com/EpixZone/EpixWiki-Xite) | Collaborative editing, a vendored Markdown renderer and sanitizer |
| Epix Sites | [EpixSites-Xite](https://github.com/EpixZone/EpixSites-Xite) | A directory and search xite |
| DeFlix | [DeFlix-Xite](https://github.com/EpixZone/DeFlix-Xite) | Peer-to-peer video streaming with optional files, and a reusable player (`js/lib/EpixPlayer.js`) |
| Epix Mesh Chat | [EpixMeshChat-Xite](https://github.com/EpixZone/EpixMeshChat-Xite) | A xite that ships its own small protocol bridge (`js/frame.js`) instead of EpixFrame |
| Epix Explorer | [epix.explorer](https://github.com/EpixZone/epix.explorer) | A Vite and Vue build adapted to the wrapper sandbox |

For what these xites do from a user's point of view, see [Featured xites](../start/apps.md).

## Versions and stability

- **EpixFrame** is at `v1.1.0`. Xites that vendor 1.0.x should update: 1.1.0 fixes helpers that did not match the node (see [Upgrading from 1.0.x](epixframe.md#upgrading-from-10x)). The package is not published to the npm registry.
- **EpixKit** has no tags. Pin the commit you copied.
- **The contract kits** are examples and starting points. Read [Contract kits](contracts.md) for which deployed addresses are published.
- **The UI kit** has no version number. Copy the two CSS files together, since the component file depends on the token file.

When a library and the node disagree, the node wins. The [EpixFrame API reference](../api/index.md) documents what the current node implements, and the [EpixFrame guide](epixframe.md#upgrading-from-10x) lists the helpers that 1.1.0 brought in line with it.
