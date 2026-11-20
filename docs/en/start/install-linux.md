---
description: Install EpixNet on Linux from a .deb, .rpm, AppImage or tarball, build it from source, or run it as a headless systemd service.
---

# Install EpixNet on Linux

This guide covers every way to run EpixNet on Linux: the desktop packages, a source build, the full desktop launched from a checkout, and a headless node that runs as a systemd service. It is for desktop users and for server operators. If you only want the desktop app, the first section is all you need.

| You want | Go to |
| --- | --- |
| The desktop app, no build tools | [Desktop packages](#desktop-packages) |
| A node built from source | [Build from source](#build-from-source) |
| EpixNet Browser and the wallet from a checkout | [Full desktop app from source](#full-desktop) |
| A server node from a release download | [Headless node from a release](#headless-release) |
| A server node from your own build | [Start the source-built node at boot](#source-service) |

## Desktop packages { #desktop-packages }

Download the package for your system from [EpixNet releases](https://github.com/EpixZone/EpixNet/releases). The desktop packages include Firefox ESR and the Epix Wallet, so you do not need Rust or a separate Firefox installation. These packages target 64-bit Intel/AMD PCs. See the release notes for the platforms validated for a particular build.

| Your system | Package |
| --- | --- |
| Ubuntu 22.04+, Zorin 17/18, Mint 21/22, Pop!_OS 22.04+, Debian 12+ | `.deb` |
| Current Fedora | `.rpm` |
| openSUSE, Arch, Manjaro, EndeavourOS and other current glibc desktops | `.AppImage` |

=== "Ubuntu, Zorin, Mint, Pop!_OS, Debian"

    Open the downloaded `.deb` with your software installer, or install it from the download folder:

    ```sh
    sudo apt install ./epixnet_*.deb
    ```

    APT installs any missing desktop libraries automatically.

=== "Fedora"

    Install the downloaded `.rpm` from the download folder:

    ```sh
    sudo dnf install ./epixnet-*.rpm
    ```

=== "AppImage"

    Mark `EpixNet-*-x86_64.AppImage` executable in your file manager, or from a terminal:

    ```sh
    chmod +x EpixNet-*-x86_64.AppImage
    ```

    Then open it. Keep the file in a permanent folder. If your desktop cannot mount AppImages, run it with `--appimage-extract-and-run`.

    This format requires glibc 2.35 or newer. Alpine Linux's musl C library is not supported.

After installation, choose **EpixNet** from the applications menu. `epix://` links can open it directly. The install does not change your default web browser.

The native packages install the application in `/opt/epixnet` and add the `epix-browser`, `epix-nmh` and `epix-server` commands to `/usr/bin`. Installing a package does not enable any service or login autostart.

### Manage the AppImage with Gear Lever

We recommend [Gear Lever](https://gearlever.mijorus.it/) for managing the AppImage. It can keep AppImages in one folder and add EpixNet to your applications menu. Install Gear Lever using its official instructions, then open the downloaded EpixNet AppImage with it to integrate the app.

### Browser sandbox permission on Ubuntu 24.04 and newer { #appimage-sandbox }

On Ubuntu 24.04 and newer, the AppImage asks for administrator approval on first launch if the browser sandbox needs permission. Approve the system password prompt and EpixNet continues automatically. Later launches reuse that permission. No separate script or restart is needed.

Native packages set this up during installation. Removing the permission, or changing the AppImage's name or temporary folder, may require approval again.

??? info "What the prompt changes"

    Ubuntu restricts unprivileged user namespaces, which Firefox's own sandbox uses. EpixNet installs an AppArmor rule that permits this for its bundled Firefox paths only and leaves the system-wide restriction enabled. The same helper is published with each release as `enable-epixnet-sandbox.sh` for recovery.

### Upgrade and remove

Before upgrading, choose **Quit EpixNet** in the tray menu. Then install the new package or replace the AppImage file. The native packages refuse to upgrade while EpixNet is still running from `/opt/epixnet`; they do not stop it for you.

To remove EpixNet:

=== "Ubuntu, Zorin, Mint, Pop!_OS, Debian"

    ```sh
    sudo apt remove epixnet
    ```

=== "Fedora"

    ```sh
    sudo dnf remove epixnet
    ```

=== "AppImage"

    Delete the AppImage file.

You can also use your software manager. Profiles, keys, wallets and xites remain in your user data directory. Uninstalling does not erase them.

### Older releases with only a tarball

If a release only has the older `.tar.gz`, extract the entire archive into a permanent folder and run its `install.sh`. Keep the `firefox` folder alongside `epix-browser`. Moving or deleting the extracted tree breaks its menu shortcut; run `install.sh` again after moving it.

## Build from source { #build-from-source }

Install the tools and clone the source once. Keep that checkout for [updates from GitHub](#update-with-git).

For the full desktop with EpixNet Browser and its wallet, complete steps 1 to 3, then follow [Full desktop app from source](#full-desktop). Steps 4 and 5 below build the standalone node and explicitly select your system browser.

Type the commands into your terminal.

### 1. Install the build tools { #step-1 }

EpixNet needs Git, a C compiler and build tools. The update commands below use curl and Python 3 to read the release tag from GitHub.

=== "Debian or Ubuntu"

    ```sh
    sudo apt update
    sudo apt install -y build-essential pkg-config git curl python3 protobuf-compiler
    ```

=== "Fedora"

    ```sh
    sudo dnf install -y gcc gcc-c++ make pkgconf-pkg-config git curl python3 protobuf-compiler
    ```

=== "Arch"

    ```sh
    sudo pacman -S --needed base-devel git curl python protobuf
    ```

### 2. Install Rust { #step-2 }

Rust is the language EpixNet is written in. This command installs it:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Press Enter to accept the default when it asks. When it is done, load it into your current terminal:

```sh
source "$HOME/.cargo/env"
```

Check it worked:

```sh
rustc --version
```

You should see a version number.

### 3. Download EpixNet { #step-3 }

Use your normal login account. These commands look up the [latest stable release](https://github.com/EpixZone/EpixNet/releases/latest) and make a shallow clone of that tag. The final command prints the selected version.

```sh
cd "$HOME" &&
tag=$(curl -fsSL https://api.github.com/repos/EpixZone/EpixNet/releases/latest |
  python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])') &&
git clone --depth 1 --no-tags --branch "$tag" https://github.com/EpixZone/EpixNet.git &&
cd EpixNet &&
git describe --tags --exact-match
```

### 4. Build it { #step-4 }

```sh
cargo build --release --locked -p epix-server -p evx-worker &&
./target/release/epix-server --version
```

The first build downloads dependencies and can take a while. Cargo prints `Finished` when the executables are ready. The version should match the tag you chose.

These two packages build the node and the worker it launches for EVX modules (sandboxed WebAssembly programs published by xites, see [EVX](../build/evx.md)).

??? note "Building the whole workspace needs the udev development package"

    Building the whole workspace (`cargo build --release`, with no `-p`) also builds the Ledger hardware wallet bridge. That bridge talks to the device over HID, which on Linux goes through udev. You then need the udev development package as well. Having `libudev.so.1` already on your system is not enough.

    === "Debian or Ubuntu"

        ```sh
        sudo apt install -y libudev-dev
        ```

    === "Fedora"

        ```sh
        sudo dnf install -y systemd-devel
        ```

    === "Arch"

        ```sh
        sudo pacman -S --needed systemd-libs
        ```

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

The default browser choice is EpixNet Browser. Starting `epix-server` without an override hands the launch to the `epix-browser` executable beside it before starting the node. The standalone build above does not include that launcher. Use the [full desktop setup](#full-desktop) to prepare it.

You can save **Browser for standalone node startup** as **EpixNet Browser** or **System browser** on the Config page. `--browser epix|system` takes precedence over `EPIX_BROWSER=epix|system`, then the saved choice. The startup checkbox and `EPIX_HEADLESS=1` can disable browser opening. These settings do not change the operating system's default browser.

EpixNet Browser requires a loopback UI address. If you configure a LAN-facing bind such as `EPIX_UI_ADDR=0.0.0.0:42222`, use `--browser system` or `EPIX_HEADLESS=1`.

[Run a node](running.md) describes every run mode, setting and port in detail.

### 6. Update an existing installation { #step-6 }

Keep the checkout from step 3. To update the node you launched in step 5, stop it with ++ctrl+c++.

In that same checkout, use the [Git update commands](#update-with-git) for the latest stable release. If the checkout already tracks `main` and you want its latest changes, run `git pull --ff-only origin main` instead.

Then repeat [build it](#step-4) and [run it](#step-5). Use the same login account and any custom data directory settings so the node continues to use your existing xites, keys and settings.

Git reuses source objects already in the checkout. Keeping Cargo's cache and `target/` also lets builds reuse downloaded dependencies and compiled files. The amount downloaded depends on what changed; new dependency versions can still require downloads.

### 7. Optional: start the source-built node at boot { #source-service }

On Ubuntu or Debian with systemd, stop the node you started in step 5 with ++ctrl+c++, then install both built executables at the service's fixed paths. Run these commands from the checkout:

```sh
sudo install -d /opt/epix &&
sudo install -m 0755 target/release/epix-server target/release/evx-worker /opt/epix/
```

Continue with [create the service user](#service-user), [set up the service](#service-unit), and [start it and check it](#service-start) below. The same unit works for source builds and release binaries because both install `epix-server` and its matching `evx-worker` in `/opt/epix`.

The service runs as the separate `epix` account and uses `/var/lib/epix/.local/share/EpixNet`. It does not use the xites, settings or identities from your login account's node. [Reach its dashboard](#service-dashboard) after starting it.

For later releases, [update this source checkout with Git](#update-with-git), then follow [update the headless service](#update-service). Keep the checkout so Git and Cargo can reuse the files they already downloaded.

## Headless node from a release (Ubuntu server) { #headless-release }

The prebuilt Linux tarball contains the headless node, the desktop launcher and Firefox. The headless service runs without Firefox, but downloading the archive transfers the whole bundle. For smaller update downloads, you can [build from source](#build-from-source) and keep the Git checkout.

Tarball users can skip the source build steps above. The service setup below assumes Ubuntu or Debian.

### 1. Download the latest release and extract it { #service-download }

The release is one `epix-linux-<version>.tar.gz` file. This finds the latest one and unpacks it into `/opt/epix`:

```sh
cd /tmp
url=$(curl -fsSL https://api.github.com/repos/EpixZone/EpixNet/releases/latest \
  | grep -o 'https://[^"]*epix-linux-[^"]*\.tar\.gz' | head -1)
curl -fL -o epix-linux.tar.gz "$url"

sudo mkdir -p /opt/epix
sudo tar xzf epix-linux.tar.gz -C /opt/epix --strip-components=1
```

For a new service built from source, use [source step 7](#source-service) to install the executables, then continue with step 2 below.

### 2. Create a user to run it { #service-user }

A dedicated system user keeps the node off your login account and gives it a home for its data:

```sh
sudo useradd --system --create-home --home-dir /var/lib/epix epix
sudo chown -R epix:epix /opt/epix
```

The node keeps its data in that user's home, at `/var/lib/epix/.local/share/EpixNet`.

!!! warning "Run it only as the `epix` user"

    If you ever launch `epix-server` as `root`, for example to test it by hand, it creates `root`-owned files in that data directory. The service runs as `epix`, so it can no longer write there. The node takes a lock on a `lock.pid` file in the data root at startup, and when it cannot, startup fails with a data directory error even though no other node is running.

    If you hit that, fix the ownership:

    ```sh
    sudo systemctl stop epix
    sudo chown -R epix:epix /var/lib/epix/.local/share/EpixNet
    sudo systemctl start epix
    ```

### 3. Set up the service { #service-unit }

Create the systemd unit, pointing `ExecStart` at the extracted directory:

```sh
sudo tee /etc/systemd/system/epix.service >/dev/null <<'UNIT'
[Unit]
Description=EpixNet node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=epix
WorkingDirectory=/opt/epix
ExecStart=/opt/epix/epix-server
Environment=EPIX_HEADLESS=1
Environment=EPIX_UI_ADDR=127.0.0.1:42222
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
```

What the settings do:

| Setting | Purpose |
| --- | --- |
| `EPIX_HEADLESS=1` | Stops the node from trying to open a browser. |
| `EPIX_UI_ADDR` | Sets the address the dashboard listens on. The default port `42222` increases one at a time if taken; a non-default port must be available. |
| `LimitNOFILE=65536` | Gives the node room for many peer connections. The default limit is low enough that a busy public node can hit it. |
| `Restart=on-failure` | Lets the dashboard restart the node, as described below. |

Keep `Restart=on-failure` in this unit. With systemd 248 or newer, the dashboard's **Restart EpixNet** button exits the service with status `75`, and systemd starts it again. **Quit** exits successfully and leaves the service stopped. `ExecStart` should invoke `epix-server` directly; a custom wrapper must use `exec` so the server remains the process systemd supervises.

### 4. Start it and check it { #service-start }

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now epix
systemctl status epix
journalctl -u epix -f
```

You can also ask the node itself. `/StatsJson` is exempt from the origin check, so it answers a plain request. If the dashboard selected another port, replace `42222` with the port saved in `/var/lib/epix/.local/share/EpixNet/ui_port`:

```sh
curl -s http://127.0.0.1:42222/StatsJson
```

### 5. Reach the dashboard { #service-dashboard }

The node listens on `127.0.0.1:42222` on the server itself by default. If it selected another port, use that port for the remote end of the tunnel and any reverse proxy below. From your own machine, open an SSH tunnel and then visit `http://127.0.0.1:42222/` in a browser:

```sh
ssh -L 42222:127.0.0.1:42222 you@server
```

Open it in a real browser. The node has a DNS-rebinding guard that blocks untraceable requests to a xite path, so a bare `curl http://127.0.0.1:42222/<xite>/` returns `403 Cross-origin request blocked`. That is expected. Browser page loads carry a `Sec-Fetch-Mode: navigate` header and are always allowed. Use `/StatsJson` (above) when you want a scripted health check.

To serve it publicly instead, put a reverse proxy (for example nginx) in front and point it at `127.0.0.1:42222`. If you reach it by a hostname rather than an IP, add that hostname to the `ui_host` config key so the node accepts the `Host` header (see [Run a node](running.md#headless)).

!!! warning "A public dashboard is a public control surface"

    Anyone who can reach the dashboard address can reach your node's web interface. Prefer the SSH tunnel for administration, and read [Privacy and routing](privacy.md) before you publish a node through a reverse proxy.

### Update to a new release { #service-update }

For an existing service, you can [switch to Git-based updates](#update-with-git) and keep the same service and data directory.

To stay with prebuilt releases, stop the service, repeat the download and extraction from step 1, then start it again. The service keeps its existing data directory.

```sh
sudo systemctl stop epix
# repeat the curl + tar commands from step 1
sudo chown -R epix:epix /opt/epix
sudo systemctl start epix
```

## Run headless from a source build { #headless-source }

If you built from source (steps 1 to 5 above), the server binary runs headless directly. It serves the network but never tries to open a browser:

```sh
EPIX_HEADLESS=1 ./target/release/epix-server
```

Then visit `http://127.0.0.1:42222/` from a browser. Use an SSH tunnel if the server is remote:

```sh
ssh -L 42222:127.0.0.1:42222 you@server
```

## Update a source checkout with Git { #update-with-git }

Reuse the checkout from step 3. If you installed the tarball and have no checkout yet, follow [source steps 1 to 3](#build-from-source) once. Git fetches source objects your checkout is missing. Keeping the checkout, Cargo's cache and `target/` lets later builds reuse downloaded dependencies and compiled files. New dependencies can still require downloads. Prebuilt Linux release packages are still full downloads.

Run this from your login account. It looks up the [latest stable release](https://github.com/EpixZone/EpixNet/releases/latest) on GitHub, fetches that tag into your existing clean checkout, and prints the selected version.

```sh
cd "$HOME/EpixNet" &&
tag=$(curl -fsSL https://api.github.com/repos/EpixZone/EpixNet/releases/latest |
  python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])') &&
git fetch --no-tags origin tag "$tag" &&
git switch --detach "refs/tags/$tag" &&
git describe --tags --exact-match
```

If you intentionally track development builds and your checkout is already on `main`, use `git pull --ff-only origin main` in place of the fetch and switch commands. `main` can include changes beyond the latest release.

For a desktop, quit EpixNet from the tray, update the checkout, then [run the desktop launcher](#full-desktop) again.

### Update the headless service { #update-service }

For the `epix.service` above, build the node and its matching worker in the updated checkout. Leave the old node running during the build.

```sh
cargo build --release --locked -p epix-server -p evx-worker &&
./target/release/epix-server --version
```

Check the printed version, then stage both executables before stopping the service.

```sh
sudo install -d /opt/epix-stage &&
sudo install -m 0755 target/release/epix-server target/release/evx-worker /opt/epix-stage/ &&
sudo systemctl stop epix &&
sudo mv /opt/epix-stage/epix-server /opt/epix-stage/evx-worker /opt/epix/ &&
sudo systemctl start epix &&
systemctl status epix
```

The service continues to use the same `epix` account and its existing identities and xites in `/var/lib/epix/.local/share/EpixNet`. If you run the node directly, stop the old process and start the newly built server with the same account and data directory.

## Full desktop app from source (managed Firefox) { #full-desktop }

From a graphical Linux session, one command opens the managed Firefox window, starts the embedded EpixNet node and connects the wallet through its native messaging host. Use your normal desktop account. Complete [source steps 1 to 3](#build-from-source) and install the desktop dependencies for your distribution once.

=== "Debian or Ubuntu"

    ```sh
    sudo apt install -y libgtk-3-dev libxdo-dev libayatana-appindicator3-dev libudev-dev xz-utils util-linux
    ```

=== "Fedora"

    ```sh
    sudo dnf install -y gtk3-devel libxdo-devel libappindicator-gtk3-devel systemd-devel xz util-linux
    ```

=== "Arch"

    ```sh
    sudo pacman -S --needed gtk3 xdotool libayatana-appindicator systemd-libs xz util-linux
    ```

From the checkout, launch the full desktop:

```sh
./scripts/run-browser.sh
```

The helper prepares a private copy of the release's supported Firefox ESR, stages the trusted extension resources, and builds the launcher, native messaging host and EVX worker. The launcher opens the Dashboard with the bundled Epix Wallet. To open a specific xite, run `./scripts/run-browser.sh talk.epix`.

The first launch can take a while. Later launches reuse the Firefox download while the pin, architecture and language match. Cargo also reuses its build output, and the wallet build reuses the staged extension while its pin matches. After [updating the Git checkout](#update-with-git), run the same launch command. Select **Quit EpixNet** in the tray to stop the desktop node.

??? note "On the v0.6.3 tag"

    The older helper on the v0.6.3 tag expects you to prepare Firefox and the worker first. From the checkout, run these setup commands once:

    ```sh
    packaging/fetch-firefox-esr.sh linux &&
    python3 packaging/firefox-addons/install.py packaging/firefox-esr/firefox &&
    cargo build --release --locked -p evx-worker
    ```

    Then start that release with one command:

    ```sh
    EPIX_FIREFOX="$PWD/packaging/firefox-esr/firefox/firefox" ./scripts/run-browser.sh
    ```

## Where your data lives { #data }

EpixNet keeps your xites, keys, and settings in:

```text
~/.local/share/EpixNet
```

If you set `XDG_DATA_HOME`, the folder is `$XDG_DATA_HOME/EpixNet` instead. See [Run a node](running.md#data-folder) for how to move it and [Data directory layout](../internals/data-directory.md) for what is inside.

## If something goes wrong { #troubleshooting }

`cc` or `linker` not found
:   Step 1 did not finish. Run the install command for your distribution again.

`cargo: command not found`
:   Run `source "$HOME/.cargo/env"`, or open a new terminal.

The build stops asking for a library
:   Install its development package (for example `sudo apt install -y zlib1g-dev`) and build again.

`unable to find library -lxdo`
:   You are building the desktop app, which needs the desktop development libraries listed under [Full desktop app from source](#full-desktop). The node itself needs none of them.

`Unable to find libudev` or `Package 'libudev' was not found`
:   You are building the whole workspace, which includes the `hidapi` crate behind the Ledger bridge. It needs the udev development package: having `libudev.so.1` is not enough, the build wants the headers and the `libudev.pc` file. Install it as shown under [step 4](#step-4), or build just what you need instead, for example `cargo build --release -p epix-server`, which does not depend on `hidapi` at all.

Port already in use
:   If dashboard port `42222` is taken, EpixNet tries `42223`, `42224`, and so on until one is available. The selected port is saved in `ui_port` inside your data folder. The file server does the same from its configured port, `26552` by default; use the selected port from the node log for port forwarding. You can also pick your own:

    ```sh
    EPIX_UI_ADDR=127.0.0.1:9000 ./target/release/epix-server --browser system
    ```

    A non-default dashboard port must be available or startup fails.

`Cannot launch EpixNet Browser`
:   You started `epix-server` without a browser choice and there is no `epix-browser` executable beside it. Add `--browser system`, set `EPIX_HEADLESS=1`, or use the [full desktop setup](#full-desktop). EpixNet does not silently switch to a different browser.
