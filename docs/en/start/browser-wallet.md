---
description: What EpixNet Browser is, how it differs from a system browser, how the embedded Epix Wallet works, and how to install browser extensions published on xites.
---

# EpixNet Browser and Epix Wallet

This page explains the desktop and mobile apps most people use to reach EpixNet: EpixNet Browser, the Epix Wallet that ships inside it, and the extension manager that installs browser extensions published on xites. It is for users who want to know what the app does on their machine, and what it does not do. Developers who want to connect a wallet from their own xite should read [Connect a wallet with EpixKit](../web3/wallet-connect.md).

## What EpixNet Browser is

EpixNet Browser is a launcher that starts three things together: your EpixNet node, a managed copy of Firefox, and the Epix Wallet. It is a real Firefox, not an embedded web view, so pages behave as they do in a normal browser.

The launcher gives Firefox its own profile and a set of routing rules, so that xites (websites published on EpixNet) load like ordinary web pages:

- **Names in the address bar.** Type `talk.epix` and the address bar keeps reading `talk.epix`. Your node resolves the name on Epix Chain, downloads and verifies the xite if it does not have it yet, and serves it.
- **Secure origins.** The node serves `.epix` hosts over HTTPS using a certificate authority that is generated on your machine the first time the app runs, and that the bundled Firefox is set up to trust. Each xite gets its own origin, so the browser treats it as a secure context without a warning. If the certificate cannot be installed, the app falls back to plain HTTP for xites.
- **`epix://` links.** The packaged apps register the `epix://` scheme, so a link such as `epix://talk.epix/` opens in EpixNet Browser.
- **Onion and I2P sites.** `.onion` hosts are sent through the node's Tor client and `.i2p` hosts through its I2P router, when those are enabled.

The node keeps running after you close the browser window, so your machine stays a useful peer. On desktop a tray icon (the menu bar on macOS, the notification area on Windows, the status area on Linux) is how you reopen the browser or quit completely.

| Tray entry | What it does |
| --- | --- |
| **Open EpixNet** | Opens a browser window on the running node. |
| Status lines | Version, your IP and whether it is reachable, your Tor and I2P addresses when those are on, peers, connections, and data received and sent. |
| **Open at Login** | Starts the node and tray when you log in, without opening a window. |
| **Quit EpixNet** | Stops the node. This is the only way to fully quit, short of ending the process. |

Starting the app a second time does not start a second node. It opens the requested xite in the one that is already running. On a Linux desktop that has no tray host, the app falls back to running until the browser closes.

!!! note "The bundled Firefox is pinned"
    Each EpixNet release bundles a specific Firefox ESR version, so you do not need Firefox installed. Browser security updates arrive with EpixNet releases. Keep EpixNet up to date.

## EpixNet Browser versus your system browser

You can also use the node with the browser you already have. The node serves its interface on a local address, `http://127.0.0.1:42222/` by default, and any modern browser can open it. The two ways of browsing differ in ways that matter.

| | EpixNet Browser | System browser |
| --- | --- | --- |
| Address of a xite | `https://talk.epix/` | `http://127.0.0.1:42222/talk.epix/` |
| Typing a `.epix` name in the address bar | Works | Does not work. Use the local address above. |
| How pages are served | Each xite has its own HTTPS origin, such as `https://talk.epix`. | Xites are reached through the node's local address over plain HTTP, and pages run in a sandboxed frame. See [The wrapper sandbox](../build/sandbox.md). |
| Epix Wallet | Built in | Not included |
| `.onion` and `.i2p` sites | Routed through the node | Depends entirely on your browser's own setup |
| Ordinary websites | Routed directly or through Tor, your choice | Whatever your browser normally does |
| Extensions from xites | Supported on desktop and Android | Not available |

The system browser is the right choice for a headless server, a node reached over a LAN, or simple testing. EpixNet Browser needs the node's interface to listen on a loopback address, so a LAN-facing node must use a system browser or run headless.

To choose, set **Browser for standalone node startup** on the [Config page](dashboard.md#the-config-page), or use the `--browser` flag or the `EPIX_BROWSER` setting described in [Running EpixNet](running.md). EpixNet never silently switches to a different browser, and none of these choices change your operating system's default browser.

!!! warning "Node routing and browser routing are separate"
    The node's Tor setting controls the node's own connections to peers. It does not control what a system browser does with the pages you open. If you browse with a system browser, external content that a page loads travels however that browser is configured. See [Privacy and routing](privacy.md).

## How the browser routes traffic

EpixNet Browser decides where each request goes by its host name.

| Destination | Route |
| --- | --- |
| `*.epix` names and bare `epix1...` xite addresses | Your local node |
| `*.i2p` | The node's I2P router, through a local proxy |
| `*.onion` | The node's Tor client. This is independent of the clearnet setting below. |
| Loopback addresses such as `127.0.0.1` and `localhost` | Direct. These never use Tor. |
| `*.epix.zone` (the Epix Chain endpoints the wallet depends on) | Always direct |
| Every other website | Direct, or through Tor, according to the wallet's clearnet routing switch |

Two consequences are worth knowing:

- With clearnet routing through Tor switched on, ordinary websites see a Tor exit instead of your IP address, but requests to the Epix Chain endpoints under `epix.zone` still go directly from your machine. Those servers can see your IP address and the requests you make.
- A page on a `.epix` xite may call ordinary HTTPS services in either mode. The switch chooses the route for those requests. It does not block them.

These are the rules the launcher writes into the managed profile when the browser starts. Once the wallet is running, it applies changes to the clearnet switch live.

The local proxy ports are chosen at startup and can differ between runs. Do not point other software at them.

## The Epix Wallet

The Epix Wallet is a wallet for Epix Chain that ships inside EpixNet Browser. It is a fork of the Keplr wallet, rebranded, with Epix Chain built in. Its source is the public [epix-wallet](https://github.com/EpixZone/epix-wallet) repository.

You use it to:

- hold EPIX and approve transactions on Epix Chain;
- connect to xites that use the chain, for example to register a `.epix` name in the [xID manager](xid.md), tip a creator, or claim an airdrop;
- see the node's Tor and I2P status and control how the browser routes ordinary web traffic.

When a xite asks to connect, the wallet shows its own approval prompt. Xites that use the official wallet library list the built-in Epix Wallet first in their wallet picker. A xite never receives your wallet keys. It receives your address after you approve the connection, and every transaction needs a separate approval.

!!! danger "Read every approval"
    A valid xite signature proves who published a xite. It does not make the xite honest. Approve a transaction only when you understand what it does and trust the xite asking for it. An approved transaction on chain cannot be undone.

### The wallet is pinned

Each EpixNet release embeds one exact build of the wallet, identified by a commit of the wallet repository and a checksum of the published archive. A given EpixNet version always contains the same wallet. A newer wallet reaches you through a newer EpixNet release, not through a separate update channel.

### Your wallet is not your node identity

EpixNet uses two separate kinds of keys, kept in two different places.

| | Node identity | Epix Wallet |
| --- | --- | --- |
| What it is | A master seed from which the node derives a signing key per xite | Your Epix Chain account keys |
| Used for | Signing what you post on xites, and signing xites you own | Paying fees, holding EPIX, owning `.epix` names |
| Where it lives | The node's private data folder | The wallet's own storage in the browser profile |
| How to back it up | [Backup and Restore](dashboard.md#backup-and-restore) in the Dashboard | The wallet's own backup and recovery options |

!!! warning "Node backups do not include the wallet"
    The Backup and Restore wizard covers node keys, settings, xites, and onion and I2P address keys. It does not include the wallet. Moving the node's data directory also leaves browser profiles and wallet storage in their original folder. Back up the wallet from inside the wallet.

An [xID](xid.md) is what ties the two together: a `.epix` name owned by your wallet, with one or more node identities linked to it.

### Routing controls

The wallet's toolbar button doubles as a status light, and the wallet has an **Epix Network** panel that shows the node's Tor and I2P state. The same panel has a **Route clearnet through Tor** switch for ordinary web traffic and an **Open node config** link to the [Config page](dashboard.md#the-config-page).

- The switch is on by default when the node's Tor client is enabled. While it is on and Tor is ready, the panel reads **Clearnet routed through Tor**.
- On desktop and Android, a change applies to new requests without restarting. On iOS, restart the app to be sure every existing connection uses the new route.
- The choice is saved with the node's data and reused the next time the browser starts.
- The switch concerns general web traffic only. `.onion` sites always use Tor, and the node's own peer connections follow the node's Tor mode on the Config page.

The status light uses the same colors everywhere, including the badge on the Epix icon in the mobile apps: gray when Tor is off, amber while it is connecting, purple when it is ready, and green when ordinary web traffic is being routed through Tor.

If the panel says the Epix node is not reachable, the wallet is not running inside EpixNet Browser or the node is not running.

### Hardware wallets

- **Ledger** devices connect on desktop through a helper program that ships with the app and talks to the device over USB. Ledger is not available in the Android and iOS apps.
- **Keystone** devices work through their QR code mode, using the camera, on desktop and mobile.

The project notes that end-to-end signing with physical Ledger and Keystone devices is still awaiting hardware verification. As with any new setup, confirm the address on the device and test with a small amount first.

## Extensions published on xites

EpixNet Browser can install Firefox extensions that a publisher distributes through a xite, on desktop and Android. Two independent checks must both pass:

1. The extension file is listed in the xite's signed content, so it is exactly the file the publisher released.
2. The file carries Mozilla's own extension signature, which the browser engine verifies.

A xite signature alone does not grant extension privileges, and neither check replaces the browser's permission prompt.

### Install an extension

1. Open the publisher's xite at least once, so your node knows it and has verified its content.
2. Open the extension manager.

    === "Desktop"

        Open **Extensions from xites** from the browser toolbar.

    === "Android"

        Press and hold the Epix icon next to the address bar, then choose **Extensions**.

3. Enter the package address, for example `https://publisher.epix/extension.xpi`, then review and approve it.

    === "Desktop"

        Choose **Review package**. Check the publisher, the extension's identity, and the permissions it requests. Choose **Continue to Firefox confirmation**, then approve the browser's own permission prompt.

    === "Android"

        Choose **Verify and install**, then approve the permission prompt that follows.

Closing or cancelling the review installs nothing. An extension receives only the permissions shown in the browser's prompt.

### Update, disable, or remove

Installed extensions are listed in the same manager (under **Managed extensions** on desktop), where you can enable, disable, or remove each one.

Updates are manual. Choose the extension's update action and review the new package. An update must come from the same publisher and path, carry the same extension ID, and pass the same signature and permission checks as the first install. The manager does not follow an extension's own update address or swap in a copy from another source.

### Limits and what the manager refuses

- Package addresses must point at a file on a xite. Ordinary websites, local files, and unsigned entries are refused.
- A package can be at most 32 MiB, and a profile can hold up to 256 managed extensions.
- Packages that ask for native messaging, extension management, or experimental browser interfaces are rejected, as are packages that reuse an Epix extension ID.
- Third-party extensions are never connected to the wallet's private interface with the node.
- Installing extensions is not supported on iOS.

!!! warning "Extensions are powerful"
    These are ordinary browser extensions. One that you allow to read pages can read the pages you visit, including xites. Publisher verification tells you who released the file, not whether it is trustworthy. Host permissions follow the browser's normal rules and are not scoped per xite.

The manager protects against untrusted xites and ordinary extensions. It does not claim to protect against a compromised browser, a privileged extension, or another program running under your user account.

Publishers should read [Publishing browser extensions](../build/extensions.md).

## Platform availability

| | Windows, macOS, Linux | Android | iOS |
| --- | --- | --- | --- |
| Browser engine | Bundled Firefox ESR | GeckoView (the Firefox engine) | WKWebView (the system engine) |
| Epix Wallet | Browser extension in the managed profile | Built-in extension, opened from the Epix icon | A web app served by the node, opened from the Epix icon |
| Clearnet routing switch | Yes | Yes | Yes, restart recommended after changing it |
| Extensions from xites | Yes | Yes | No |
| Ledger | Yes | No | No |
| Tray and Open at Login | Yes | Not applicable | Not applicable |

Release downloads exist for Windows, macOS, Linux, and Android. The iOS app is built from source for now, and mobile store releases are in preparation. See [Install EpixNet](install.md) for the per-platform guides.

### The mobile apps

The Android and iOS apps look like a browser: an address bar with the Epix icon beside it.

- Type a name such as `talk.epix`, an `epix1...` address, a single word (treated as `word.epix`), or any web address.
- Tap the Epix icon to open the wallet. Press and hold it for more options.
- The address bar shows the xite's name rather than the local address the node serves it from.
- On Android, the controls sit at the bottom in portrait and at the top in landscape. To pin them, press and hold the Epix icon, choose **Browser controls**, and pick **Top**, **Bottom**, or **Automatic**.

A phone does not accept incoming connections from the open internet. It stays reachable to other peers through its Tor and I2P addresses when those are enabled.

## Related pages

- [Privacy and routing](privacy.md): what the node's Tor, I2P, and mesh settings do and where their limits are.
- [xID](xid.md): registering a `.epix` name with your wallet and linking your node identity to it.
- [Dashboard, sidebar, and node settings](dashboard.md): backing up node keys and changing settings.
- [EpixKit](../libraries/epixkit.md): the wallet connection library xites use.
