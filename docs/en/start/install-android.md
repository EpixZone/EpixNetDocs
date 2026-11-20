---
description: Install the EpixNet Android app from the release APK, keep it updated with Obtainium, or build it from source.
---

# Install EpixNet on Android

This guide shows how to install the EpixNet app on an Android phone or tablet, how to keep it updated, and how developers can build it from source. Most people only need the first two sections.

The Android app runs the same EpixNet node as the desktop, wrapped in an app that uses GeckoView (Firefox's engine) to show `.epix` xites. Tor and I2P are built in.

## Install the APK { #install-the-apk }

1. Download `epix-android-<version>.apk` from the [latest stable release](https://github.com/EpixZone/EpixNet/releases/latest).
2. Open the file on your phone.
3. Allow installation from that source when Android asks.

The official APK requires Android 8 or later on a 64-bit ARM device.

!!! note "Use the APK, not the AAB"

    Each release also has an `.aab` file. It is for app stores, not direct installation.

Install newer official APKs over the existing app to keep its data. Official GitHub releases use the same `zone.epix.app` package and signing key. Locally built debug APKs use a different key and cannot replace an official release in place.

## Updates with Obtainium { #obtainium }

[Obtainium](https://obtainium.imranr.dev/) can track EpixNet's GitHub releases and install APK updates:

1. Install Obtainium, then [add EpixNet to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22zone.epix.app%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FEpixZone%2FEpixNet%22%2C%22author%22%3A%22EpixZone%22%2C%22name%22%3A%22EpixNet%22%7D). You can also choose **Add App** and enter `https://github.com/EpixZone/EpixNet` as the source URL.
2. Use the **GitHub** source and leave prereleases disabled for stable updates. The releases contain one Android APK, so the default APK selection works. If you set an APK filename filter, use `^epix-android-.*\.apk$`.
3. Install or update EpixNet through Obtainium, granting Android's install permission when prompted. Keep background update checks enabled to discover new releases.

For [background installation](https://wiki.obtainium.imranr.dev/app_tracking/#silent-installation), Obtainium requires Android 12 or later, a sufficiently recent target API, an installed version that Obtainium installed, and background updates enabled both globally and for EpixNet. Its selection must resolve to one APK. Silent updates are best effort; Android may still require an installation prompt.

## Find your way around the app { #using-the-app }

The app looks like a browser. A few things differ from the desktop:

- **Address bar.** Type a name such as `talk.epix`, an `epix1...` address, a bare word (opened as `<word>.epix`), or any URL.
- **Epix button.** Tap the Epix icon beside the address bar to open the Epix Wallet. Its shield carries the Tor and I2P status and the route-clearnet toggle. Long-press the icon for the plain Tor panel, which shows the current xite, Tor status, your onion address and the **Route clearnet through Tor** switch.
- **Controls position.** Browser controls sit at the bottom in portrait and at the top in landscape. Long-press the wallet button and choose **Browser controls** to keep them at the **Top** or **Bottom**, or return to **Automatic**.
- **Links.** `epix://` links from other apps open in EpixNet.

Tor is on by default. The embedded I2P router is also on by default. It is a lightweight leaf that only carries your own traffic, so it costs about as much as Tor. You can switch it off in the app's Config screen.

!!! warning "Routing is not a guarantee of anonymity"

    The **Route clearnet through Tor** switch is on by default and sends general web requests from the app through Tor. Peer connections follow the node's own Tor setting, which is separate. Read [Privacy and routing](privacy.md) before you rely on a route.

See [Browser and wallet](browser-wallet.md) for the wallet and for installing browser extensions published by xites.

## Build from source { #build-from-source }

The steps below are for developers and require Google's Android tools in addition to Rust. You build the Android library from your normal computer.

### 1. Install the desktop build tools first { #step-1 }

Follow steps 1 and 2 of the [macOS](install-macos.md#build-from-source) or [Linux](install-linux.md#build-from-source) guide, or steps 1 to 4 of the [Windows](install-windows.md#build-from-source) guide, to get **Rust**, a **C compiler** and the protobuf compiler (`protoc`), which the mesh transport needs at build time.

### 2. Install the Android tools { #step-2 }

1. Install **Android Studio** from <https://developer.android.com/studio>.
2. Open it once and let it download the **SDK**.
3. In Android Studio, open **SDK Manager > SDK Tools**, check **NDK (Side by side)**, and install it.
4. Point Rust at the NDK by setting `ANDROID_NDK_HOME`, for example:

    ```sh
    export ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/<version>
    ```

The example paths in this guide are the macOS defaults. Use the location where Android Studio installed the SDK on your system.

### 3. Add the Android build pieces to Rust { #step-3 }

```sh
rustup target add aarch64-linux-android
cargo install cargo-ndk
```

### 4. Get the code { #step-4 }

```sh
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
```

### 5. Build the EpixNet core for Android { #step-5 }

This compiles the node into a native library the app loads. Android enables the `bittorrent` feature, which the [iOS build](install-ios.md) does not, so Android can stream open-licensed media referenced by magnet links:

```sh
cargo ndk -t arm64-v8a -o shells/android/app/src/main/jniLibs \
    build -p epix-ffi --release --features bittorrent
```

The default features add `mesh` and `local-discovery`, the transports that work with no internet at all (a Reticulum mesh, or peer discovery over LAN broadcast). Both ship disabled: the `mesh` and `local_discovery` config keys default to off, and with them off the node spawns no task and binds no socket for either. Turning LAN discovery on also makes the app hold a `WifiManager.MulticastLock`. Without it Android filters the broadcast replies and the node finds nobody.

Then generate the Kotlin code that talks to it:

```sh
cargo run -p epix-ffi --features cli --bin uniffi-bindgen -- generate \
    --library target/aarch64-linux-android/release/libepix_ffi.so \
    --language kotlin --out-dir shells/android/app/src/main/java
```

Run the first command again after any change to the Rust code. Run the second again after a change that alters the interface between the Rust core and the app. Both outputs are build artifacts and are not committed.

### 6. Build and install the app { #step-6 }

Open `shells/android/` in Android Studio and press Run, or use the command line:

```sh
cd shells/android
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

To start the installed app on a connected device or running emulator:

```sh
adb shell am start -n zone.epix.app/.MainActivity
```

!!! note "Debug builds and official releases do not mix"

    A locally built debug APK is signed with a different key from the official releases. Android will not install it over an official release. Uninstall the official app first, which removes its data, or test on a separate device or emulator.

## More information

- [Privacy and routing](privacy.md) explains Tor, I2P, LAN discovery and the Reticulum mesh.
- Full contributor notes for the Android and iOS shells are in [`shells/README.md`](https://github.com/EpixZone/EpixNet/blob/main/shells/README.md) in the node repository.
- [Contributing to EpixNet](../contributing/index.md) covers the development workflow.
