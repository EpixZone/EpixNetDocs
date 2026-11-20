---
description: Install EpixNet on macOS from the disk image, or build the standalone node and the full desktop app from source.
---

# Install EpixNet on macOS

This guide covers two ways to get EpixNet on a Mac: the disk image, which needs no build tools, and a source build, which gives you the standalone `epix-server` node. It is written for a fresh Mac with nothing installed. Most people only need the first section.

## Install from the disk image { #disk-image }

1. Download `Epix-<version>.dmg` from the [latest stable release](https://github.com/EpixZone/EpixNet/releases/latest).
2. Open the disk image and drag **EpixNet** onto the **Applications** folder shown beside it.
3. Eject the disk image, then start **EpixNet** from your Applications folder.

The app contains EpixNet Browser (a managed Firefox ESR), the Epix Wallet and the node, so you do not need Rust or a separate Firefox installation. It requires macOS 11 or later.

!!! warning "Run EpixNet from Applications, not from the disk image"

    Copy the app to `/Applications` before you start it. The bundled Firefox does not run cleanly from a read-only disk image: it can ask "Open existing Firefox application?", and if your own Firefox opens instead, `https://*.epix` pages show a certificate error.

The app registers the `epix://` scheme, so `epix://` links can open it. The install does not change your default web browser.

To upgrade, choose **Quit EpixNet** from the menu bar icon, then replace the app in Applications with the one from the newer disk image. To remove EpixNet, quit it and move the app to the Trash. Your profiles, keys, wallets and xites stay in your data folder (see [Where your data lives](#data)).

### What the app does not include

The app does not ship the standalone `epix-server` binary. If you want a headless node, the system browser mode, or the [command line actions](running.md#command-line-actions), build from source as described below.

## Build from source { #build-from-source }

Follow the steps in order. You only do steps 1 to 3 once. After that, building again is just steps 4 and 5.

You will type the commands into the **Terminal** app (press ++cmd+space++, type `Terminal`, press ++enter++).

For the full desktop, complete steps 1 to 3 and follow [Full desktop app from source](#full-desktop). Steps 4 and 5 build the standalone node and explicitly use your system browser.

### 1. Install the Apple build tools { #step-1 }

These give you `git` (to download the code) and a C compiler (to build it). Run:

```sh
xcode-select --install
```

A window pops up. Click **Install** and wait for it to finish.

!!! note "The protobuf compiler"

    The mesh transport needs the protobuf compiler, `protoc`, at build time. The project's own macOS builds install it with [Homebrew](https://brew.sh/):

    ```sh
    brew install protobuf
    ```

    Check that `protoc --version` prints a version before you build.

### 2. Install Rust { #step-2 }

Rust is the language EpixNet is written in. This command installs it:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Press Enter to accept the default when it asks. When it is done, either close and reopen Terminal, or run:

```sh
source "$HOME/.cargo/env"
```

Check it worked:

```sh
rustc --version
```

You should see a version number.

### 3. Download EpixNet { #step-3 }

```sh
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
```

### 4. Build it { #step-4 }

```sh
cargo build --release -p epix-server
```

The first build downloads a lot and can take several minutes. That is normal. It is finished when you see `Finished`.

### 5. Run it { #step-5 }

```sh
./target/release/epix-server --browser system
```

Your system browser opens the EpixNet Dashboard. If it does not open on its own, go to `http://127.0.0.1:42222/`. If that port was taken, use the selected port saved in `ui_port` inside your data folder instead.

To open a specific xite, add its name:

```sh
./target/release/epix-server --browser system talk.epix
```

!!! note "Releases v0.6.4 and earlier"

    For v0.6.4 and earlier, omit `--browser system`. Those releases already use the system browser and do not support this flag.

The default choice is EpixNet Browser, launched through the `epix-browser` executable beside `epix-server`. The standalone build above does not include it. Use the desktop setup below or explicitly select the system browser.

Save your choice under **Browser for standalone node startup** on the Config page. `--browser epix|system` overrides `EPIX_BROWSER=epix|system`, then the saved choice. Turning off browser opening on startup or setting `EPIX_HEADLESS=1` disables automatic browser opening. This does not change macOS's default browser.

EpixNet Browser requires a loopback UI address. For a LAN-facing bind such as `EPIX_UI_ADDR=0.0.0.0:42222`, use `--browser system` or `EPIX_HEADLESS=1`.

[Run a node](running.md) describes every run mode, setting and port in detail.

## Run headless (no browser window) { #headless }

For a Mac you leave running as a server, start it without opening any browser:

```sh
EPIX_HEADLESS=1 ./target/release/epix-server
```

Then visit `http://127.0.0.1:42222/` from any browser when you want the Dashboard.

## Full desktop app from source (managed Firefox) { #full-desktop }

EpixNet Browser runs the node, managed Firefox and wallet together. A source build needs a matching Firefox ESR runtime that you prepare yourself, including the extension adapter that belongs to your checkout. An unrelated system Firefox installation does not satisfy the launcher's startup check.

1. Get a copy of the supported Firefox ESR app in a development folder you own. `packaging/fetch-firefox-esr.sh osx` downloads the pinned ESR to `packaging/firefox-esr/Firefox.app`.
2. From the EpixNet checkout, stage the extension adapter into that copy's `Contents/Resources` directory:

    ```sh
    python3 packaging/firefox-addons/install.py /absolute/path/to/Firefox.app/Contents/Resources
    ```

3. Start the full desktop with `EPIX_FIREFOX` pointing at that copy's executable:

    ```sh
    EPIX_FIREFOX="/absolute/path/to/Firefox.app/Contents/MacOS/firefox" ./scripts/run-browser.sh
    ```

The helper script builds the native messaging host and the EVX worker, then runs the launcher. To open a specific xite, add its name, for example `./scripts/run-browser.sh talk.epix`.

Restage the adapter and rebuild after you update the checkout, because the launcher checks the staged files against its compiled resources. The background is in the node repository's [local desktop builds](https://github.com/EpixZone/EpixNet/blob/main/docs/xite-extensions.md#local-desktop-builds) notes.

## Where your data lives { #data }

EpixNet keeps your xites, keys, and settings in:

```text
~/Library/Application Support/EpixNet
```

In Finder, choose **Go > Go to Folder** and paste that path to open it. See [Run a node](running.md#data-folder) for how to move it.

## If something goes wrong { #troubleshooting }

`xcrun: error` or `cc` not found
:   Step 1 did not finish. Run `xcode-select --install` again.

`cargo: command not found`
:   Close and reopen Terminal, or run `source "$HOME/.cargo/env"`.

An error mentioning `protoc`
:   The protobuf compiler is missing. Install it as shown in the note under [step 1](#step-1), open a new Terminal window, and build again.

Port already in use
:   If dashboard port `42222` is taken, EpixNet tries `42223`, `42224`, and so on until one is available. The selected port is saved in `ui_port` inside your data folder. The file server does the same from its configured port, `26552` by default; use the selected port from the node log for port forwarding. You can also pick your own:

    ```sh
    EPIX_UI_ADDR=127.0.0.1:9000 ./target/release/epix-server --browser system
    ```

    A non-default dashboard port must be available or startup fails.

`Cannot launch EpixNet Browser`
:   You started `epix-server` without a browser choice and there is no `epix-browser` executable beside it. Add `--browser system`, set `EPIX_HEADLESS=1`, or use the [full desktop setup](#full-desktop).

Certificate errors on `.epix` pages in the installed app
:   Quit EpixNet, move the app to the Applications folder if it is not already there, and start it from Applications rather than from the mounted disk image.
