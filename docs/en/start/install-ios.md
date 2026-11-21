---
description: Build the EpixNet iOS app from source with Xcode, and understand how it differs from the desktop and Android builds.
---

# Build EpixNet for iOS

This guide shows how to build and run the EpixNet iOS app from source. It is aimed at people comfortable with Xcode. There is no release download for iOS: the releases page has no iOS package, and mobile store releases are still in preparation. If you just want to try EpixNet, the [desktop guides](install.md) are much easier.

The iOS app runs the same EpixNet node as the desktop, compiled into the app and wrapped in a native shell that shows `.epix` xites in a web view. Tor and I2P are built in. Everything runs in one process, with no external server.

## What you need

- A **Mac**. The iOS app cannot be built on Windows or Linux.
- **Xcode**. Current store submissions need Xcode 26 or newer.
- **Rust** and the Apple command line tools.
- An iOS 17 or later simulator or device. Running on a physical device also needs a signing team configured in Xcode.

## 1. Install Xcode { #step-1 }

Install **Xcode** from the Mac App Store, open it once, and let it finish setting up. This also gives you the iOS build tools.

Make sure the active developer directory points at Xcode and not at the Command Line Tools:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

## 2. Install the desktop build tools { #step-2 }

Follow steps 1 and 2 of the [macOS guide](install-macos.md#build-from-source) to get **Rust**, the Apple command line tools and the protobuf compiler.

## 3. Add the iOS build targets to Rust { #step-3 }

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

The first target is for devices and the second is for the simulator.

## 4. Get the code { #step-4 }

```sh
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
```

## 5. Stage the wallet build { #step-5 }

The app bundles the Epix Wallet from the `shells/wallet-ext` directory, and the build checks that directory before it compiles anything. It must hold a wallet build that includes the mobile assets (`mobile.html`, `mobile-register.html`, `mobileProvider.bundle.js` and `epix-mobile-build.json`).

The wallet source lives in the separate [EpixZone/epix-wallet](https://github.com/EpixZone/epix-wallet) repository. `shells/wallet-ext.rev` pins the wallet commit that this EpixNet checkout expects, and building the desktop launcher downloads that pinned build into `shells/wallet-ext`:

```sh
cargo build -p epix-browser
```

Check the staged copy with the same script the Xcode build runs:

```sh
python3 scripts/check-mobile-wallet.py shells/wallet-ext
```

It prints `PASS` when the mobile assets are present, or one `FAIL` line for each problem.

!!! note "Debug and Release builds"

    A Debug build accepts a local wallet build. A Release build additionally requires the pinned, unmodified wallet source and published policy page URLs, and the check fails if they are missing.

## 6. Build and run the app { #step-6 }

Open `ios/EpixNet.xcodeproj` in Xcode, pick a simulator, and press **Run**.

Or build from the command line:

```sh
xcodebuild -project ios/EpixNet.xcodeproj -scheme EpixNet \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

The first build compiles the whole Rust workspace for iOS, which takes a few minutes. Afterwards only changed crates rebuild.

## How the build works { #how-it-works }

You do not run Cargo by hand. The Xcode target's first build phase runs `ios/build-rust.sh`, which does three things:

1. Checks the staged wallet, as in step 5.
2. Builds the `epix-ffi` crate as a static library, in release mode, for the active platform's target (`aarch64-apple-ios-sim` for the simulator, `aarch64-apple-ios` for a device).
3. Generates the Swift bindings into `ios/Generated/` with UniFFI.

The Rust build the script runs is:

```sh
cargo build -p epix-ffi --release --target "$TRIPLE" \
  --locked --no-default-features --features tor,i2p-embedded,bridges,mesh,local-discovery
```

The app target then compiles the generated Swift file alongside the shell source and links `libepix_ffi.a`. `ios/Generated/` is build output and is not committed.

To run the script outside Xcode, set the platform yourself:

```sh
PLATFORM_NAME=iphonesimulator ios/build-rust.sh
PLATFORM_NAME=iphoneos        ios/build-rust.sh
```

A few details are worth knowing:

- **Release mode is required.** Debug builds of the deep asynchronous call chains (Tor, HTTP) overflow iOS thread stacks.
- **No BitTorrent.** The iOS build leaves out the `bittorrent` feature, both the media engine and tracker discovery. The [Android build](install-android.md) includes it.
- **Offline transports are included but off.** `mesh` and `local-discovery` are the transports that work with no internet at all (a Reticulum mesh, or peer discovery over LAN broadcast). Both ship disabled: the `mesh` and `local_discovery` config keys default to off, and with them off the node spawns no task and binds no socket for either. LAN discovery additionally needs `NSLocalNetworkUsageDescription` in `Info.plist`, which is already present. Without it iOS drops the broadcasts without an error.

## Differences from desktop { #differences }

| Area | iOS behavior |
| --- | --- |
| Ports | The app binds the UI to `127.0.0.1:43210` and the peer file server to `26553`, not the desktop defaults. The iOS simulator shares the Mac's network, so the desktop defaults would collide with a desktop node on the same machine. |
| Background | Foreground only. iOS suspends the process shortly after the app goes to the background, so the node syncs and seeds only while the app is open. |
| Wallet | The web view cannot run browser extensions, so the Epix Wallet runs as a web app that the node serves inside the app. Tap the Epix button to open it. |
| Browser extensions | Xite-published browser extensions are a desktop and Android feature. |
| Secure origins | Each xite gets its own HTTPS `.epix` origin through an in-process TLS proxy. The app validates those connections against a per-install certificate authority inside its own browser views. It does not install a system root certificate. |
| Routing | Tor is enabled by the app. Routing general web requests through Tor is on by default and can be changed in the app. After changing it, relaunch the app to guarantee every existing connection uses the new route. |

The browser chrome matches the Android app: an address bar that accepts `.epix` names, `epix1...` addresses and URLs, with the Epix button beside it. A tap opens the wallet and a long-press opens the Tor and I2P panel. `epix://` links open in the app.

!!! warning "Still under test"

    Full wallet signing, permission denial and physical-device testing remain release gates for the iOS app. Simulator onboarding alone does not establish those flows. Do not treat a local build as a finished product, and read [Privacy and routing](privacy.md) before you rely on a route.

## If something goes wrong { #troubleshooting }

`FAIL: missing wallet asset` during the build
:   The wallet is not staged, or the staged copy has no mobile assets. Repeat [step 5](#step-5).

`error: unsupported PLATFORM_NAME`
:   The build script supports the iOS simulator and iOS devices only. Pick an iOS simulator or device as the run destination.

`cargo` or `rustup` not found during the Xcode build
:   The script looks for Rust in `$HOME/.cargo/bin`. Install Rust with rustup as described in the [macOS guide](install-macos.md#step-2).

Xcode builds with the wrong tools
:   Run the `xcode-select --switch` command from [step 1](#step-1) so the active developer directory is Xcode itself.

A device build fails at signing
:   Device builds need a signing team. Select your team for the EpixNet target in Xcode's **Signing & Capabilities** tab.

## More information

- [`ios/README.md`](https://github.com/EpixZone/EpixNet/blob/main/ios/README.md) in the node repository has the current build notes and known limitations.
- [`shells/README.md`](https://github.com/EpixZone/EpixNet/blob/main/shells/README.md) has contributor notes for the Android and iOS shells.
- [Contributing to EpixNet](../contributing/index.md) covers the development workflow.
