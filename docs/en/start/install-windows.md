---
description: Install EpixNet on Windows with the installer, or build the standalone node and the full desktop app from source.
---

# Install EpixNet on Windows

This guide covers two ways to get EpixNet on a Windows PC: the installer, which needs no build tools, and a source build, which gives you the standalone `epix-server` node. It is written for a fresh Windows machine with nothing installed. Most people only need the first section.

## Install with the installer { #installer }

1. Download `Epix-Setup-<version>.exe` from the [latest stable release](https://github.com/EpixZone/EpixNet/releases/latest).
2. Run it and follow the wizard. The installer works for the current Windows user and does not ask for administrator rights.
3. Leave **Launch EpixNet** checked on the last page, or start **EpixNet** later from the Start menu or the desktop shortcut.

The installer contains EpixNet Browser (a managed Firefox ESR), the Epix Wallet and the node, so you do not need Rust or a separate Firefox installation. It targets 64-bit Intel/AMD PCs.

What the installer does:

| Item | Detail |
| --- | --- |
| Install folder | `%LOCALAPPDATA%\Epix` |
| Shortcuts | **EpixNet** in the Start menu and on the desktop |
| Links | Registers the `epix://` scheme for the current user, so `epix://` links open EpixNet |
| Uninstall | Adds **EpixNet** to the installed apps list in Windows Settings |

The install does not change your default web browser.

!!! note "Windows SmartScreen"

    Windows SmartScreen judges downloads by reputation as well as by signature, so a recently published installer can show a "Windows protected your PC" prompt. Check that you downloaded the file from the official [EpixZone/EpixNet releases page](https://github.com/EpixZone/EpixNet/releases) before you choose to run it.

### Upgrade

Run the newer installer over the existing installation. EpixNet keeps running in the system tray after you close the browser window, so the installer checks for a running copy and asks to close it before it replaces any files. If something from the install folder is still running afterwards, the installer offers **Retry** or **Cancel** instead of continuing with a partial copy.

### Uninstall

Remove **EpixNet** from the installed apps list in Windows Settings. The uninstaller removes the install folder, the shortcuts and the `epix://` registration. Your profiles, keys, wallets and xites stay in `%APPDATA%\EpixNet` (see [Where your data lives](#data)).

### What the installer does not include

The installer does not ship the standalone `epix-server.exe`. If you want a headless node, the system browser mode, or the [command line actions](running.md#command-line-actions), build from source as described below.

## Build from source { #build-from-source }

Follow the steps in order. You only do steps 1 to 5 once. After that, building again is just steps 6 and 7.

You will use **PowerShell**. To open it, press the Start button, type `PowerShell`, and click it.

For the full desktop, complete steps 1 to 5 and follow [Full desktop app from source](#full-desktop). Steps 6 and 7 build the standalone node and explicitly use your system browser.

### 1. Install the C++ build tools { #step-1 }

EpixNet needs Microsoft's C++ compiler to build.

1. Download **Build Tools for Visual Studio** from <https://visualstudio.microsoft.com/downloads/>. Scroll down to "Tools for Visual Studio" and pick "Build Tools for Visual Studio".
2. Run the installer.
3. On the **Workloads** screen, check **Desktop development with C++**.
4. Click **Install** and wait for it to finish.

!!! note "Already have Visual Studio installed?"

    Visual Studio does not automatically include the C++ tools. A C#-only install will not build EpixNet. Open **Visual Studio Installer**, click **Modify**, and check **Desktop development with C++**, or install the standalone Build Tools with winget:

    ```powershell
    winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    ```

### 2. Install Git { #step-2 }

Download and install **Git for Windows** from <https://git-scm.com/download/win>. Click Next through the installer; the defaults are fine.

### 3. Install Rust { #step-3 }

Rust is the language EpixNet is written in.

1. Download **rustup-init.exe** from <https://rustup.rs>.
2. Run it. A black window opens.
3. Type `1` and press Enter to choose the standard install.

Close PowerShell and open a **new** PowerShell window so it picks up Rust. Check it worked:

```powershell
rustc --version
```

You should see a version number.

### 4. Install the protobuf compiler { #step-4 }

The mesh transport needs `protoc` to build:

```powershell
winget install Google.Protobuf
```

Close PowerShell and open a new one, then check that `protoc --version` prints a version.

??? note "No winget?"

    Download the `protoc-<version>-win64.zip` file from <https://github.com/protocolbuffers/protobuf/releases/latest>, extract it, and add its `bin` folder to your PATH.

### 5. Download EpixNet { #step-5 }

```powershell
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
```

### 6. Build it { #step-6 }

```powershell
cargo build --release -p epix-server
```

The first build downloads a lot and can take several minutes. That is normal. It is finished when you see `Finished`.

### 7. Run it { #step-7 }

```powershell
.\target\release\epix-server.exe --browser system
```

Your system browser opens the EpixNet Dashboard. If it does not open on its own, go to `http://127.0.0.1:42222/`. If that port was taken, use the selected port saved in `ui_port` inside your data folder instead.

To open a specific xite, add its name:

```powershell
.\target\release\epix-server.exe --browser system talk.epix
```

!!! note "Releases v0.6.4 and earlier"

    For v0.6.4 and earlier, omit `--browser system`. Those releases already use the system browser and do not support this flag.

The default choice is EpixNet Browser, launched through `epix-browser.exe` beside `epix-server.exe`. The standalone build above does not include it. Use the desktop setup below or explicitly select the system browser.

Save your choice under **Browser for standalone node startup** on the Config page. `--browser epix|system` overrides `$env:EPIX_BROWSER`, then the saved choice. Turning off browser opening on startup or setting `$env:EPIX_HEADLESS` to `"1"` disables automatic browser opening. This does not change Windows's default browser.

EpixNet Browser requires a loopback UI address. For a LAN-facing bind such as `$env:EPIX_UI_ADDR = "0.0.0.0:42222"`, use `--browser system` or set `$env:EPIX_HEADLESS` to `"1"`.

[Run a node](running.md) describes every run mode, setting and port in detail.

## Run headless (no browser window) { #headless }

To run EpixNet as a background server without opening a browser:

```powershell
$env:EPIX_HEADLESS = "1"
.\target\release\epix-server.exe
```

Then visit `http://127.0.0.1:42222/` from any browser.

## Full desktop app from source (managed Firefox) { #full-desktop }

EpixNet Browser runs the node, managed Firefox and wallet together. A source build needs a matching Firefox ESR runtime that you prepare yourself, including the extension adapter that belongs to your checkout. An unrelated system Firefox installation does not satisfy the launcher's startup check.

1. Extract or copy the supported Firefox ESR into a development folder you own. From Git Bash, with `7z` on your PATH, `packaging/fetch-firefox-esr.sh win64` downloads the pinned ESR and extracts it into `packaging\firefox-esr\firefox`.
2. From the EpixNet checkout, stage the extension adapter into that copy. This step needs Python 3:

    ```powershell
    python packaging\firefox-addons\install.py C:\path\to\prepared\firefox
    ```

3. Point `EPIX_FIREFOX` at that copy's `firefox.exe`, then build the helpers and run the launcher:

    ```powershell
    $env:EPIX_FIREFOX = "C:\path\to\prepared\firefox\firefox.exe"
    cargo build --release --locked -p epix-nmh -p evx-worker
    cargo run --release --locked -p epix-browser
    ```

Restage the adapter and rebuild after you update the checkout, because the launcher checks the staged files against its compiled resources. The background is in the node repository's [local desktop builds](https://github.com/EpixZone/EpixNet/blob/main/docs/xite-extensions.md#local-desktop-builds) notes.

The desktop app opens no terminal window of its own. Run it from a terminal, as above, to see live output. Started from a shortcut instead, it writes its log to `%APPDATA%\EpixNet\log\epix-browser.log`.

## Where your data lives { #data }

EpixNet keeps your xites, keys, and settings in:

```text
%APPDATA%\EpixNet
```

Paste that into the File Explorer address bar to open it.

To store node data on another drive, open **Config > Storage** in the Dashboard, enter an absolute path, save, and restart. Windows destinations must support persistent access permissions, such as NTFS. [Run a node](running.md#data-folder) explains what moves and what stays.

## If something goes wrong { #troubleshooting }

`link.exe` not found, or a C++ error
:   Step 1 did not finish. Open the Visual Studio Build Tools installer again and make sure **Desktop development with C++** is checked.

An error mentioning `protoc` or "Could not find protoc"
:   Step 4 did not finish, or PowerShell has not picked it up yet. Open a new window and check `protoc --version`.

`cargo` or `git` not recognized
:   Close PowerShell and open a new one so it picks up the new programs.

Port already in use
:   If dashboard port `42222` is taken, EpixNet tries `42223`, `42224`, and so on until one is available. The selected port is saved in `ui_port` inside your data folder. The file server does the same from its configured port, `26552` by default; use the selected port from the node log for port forwarding. You can also pick your own before running:

    ```powershell
    $env:EPIX_UI_ADDR = "127.0.0.1:9000"
    ```

    A non-default dashboard port must be available or startup fails.

The installed app says the browser closed during startup
:   An upgrade that was interrupted while EpixNet was still running can leave a partial copy of the bundled browser. Quit EpixNet from the tray and run the latest installer again. Current installers close EpixNet first and refuse to continue with a partial copy.

`Cannot launch EpixNet Browser`
:   You started `epix-server.exe` without a browser choice and there is no `epix-browser.exe` beside it. Add `--browser system`, set `$env:EPIX_HEADLESS = "1"`, or use the [full desktop setup](#full-desktop).
