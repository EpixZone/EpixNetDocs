---
description: How to contribute to EpixNet, covering the repositories, bug reports, building and testing the Rust workspace, the checks that run on a pull request, releases, security reports, xites and translations.
---

# Contribute to EpixNet

This page is the starting point for anyone who wants to improve EpixNet: the Rust node, EpixNet Browser, the mobile shells, the official xites (EpixNet's word for the websites and apps it hosts), the libraries, or these docs. It tells you which repository holds what, how to report a problem, how to build and test a change, which automated checks run on a pull request, and how releases are cut. Read it once before your first pull request, then keep [Coding conventions](conventions.md) open while you work.

## Where the work happens

All source lives in the [EpixZone](https://github.com/EpixZone) organization on GitHub. The node is one repository. Every official xite and library has its own.

### Node, browser and wallet

| Repository | Language | What it is for |
| --- | --- | --- |
| [EpixNet](https://github.com/EpixZone/EpixNet) | Rust | The node: a Cargo workspace under `crates/`, the wrapper UI under `ui/`, the mobile and browser shells under `shells/` and `ios/`, installers under `packaging/`, and design notes under `docs/`. Most contributions land here. See [Architecture](../internals/architecture.md). |
| [epix-wallet](https://github.com/EpixZone/epix-wallet) | TypeScript | Epix Wallet, a fork of Keplr with Epix Chain built in. Its default branch is `epix`. The node repository does not contain wallet source. It embeds a prebuilt wallet release pinned by commit. |
| [epix-iptproxy](https://github.com/EpixZone/epix-iptproxy) | Go | The in-process Snowflake pluggable transport that the node loads through the `iptproxy-sys` crate. |
| [emissary](https://github.com/EpixZone/emissary) | Rust | A fork of emissary, a Rust implementation of the I2P protocol stack. |
| [ArchivedEpixNet](https://github.com/EpixZone/ArchivedEpixNet) | Python | The archived Python implementation. It is read-only. See [Python interoperability](../internals/python-interop.md). |

### Official xites

Each xite repository is the xite's own folder: `index.html`, `content.json`, `js/`, `css/` and so on. [Featured xites](../start/apps.md) describes what each one does.

| Repository | Xite |
| --- | --- |
| [EpixDash-Xite](https://github.com/EpixZone/EpixDash-Xite) | Dashboard, the node control panel. It also carries `template-new/`, the starting page of a newly created xite. |
| [EpixTalk-Xite](https://github.com/EpixZone/EpixTalk-Xite) | Epix Talk, a forum with xID identity |
| [EpixMail-Xite](https://github.com/EpixZone/EpixMail-Xite) | Epix Mail, end-to-end encrypted messaging |
| [EpixPost-Xite](https://github.com/EpixZone/EpixPost-Xite) | Epix Post, a social feed |
| [EpixBlog-Xite](https://github.com/EpixZone/EpixBlog-Xite) | Epix Blog |
| [EpixWiki-Xite](https://github.com/EpixZone/EpixWiki-Xite) | Epix Wiki |
| [EpixSites-Xite](https://github.com/EpixZone/EpixSites-Xite) | Epix Sites, the xite directory and search |
| [EpixNet-xAuth](https://github.com/EpixZone/EpixNet-xAuth) | The xID name and profile manager |
| [EpixMeshChat-Xite](https://github.com/EpixZone/EpixMeshChat-Xite) | Epix Mesh Chat, public rooms and encrypted private groups on local profiles |
| [DeFlix-Xite](https://github.com/EpixZone/DeFlix-Xite) | DeFlix, video streaming |
| [epix.explorer](https://github.com/EpixZone/epix.explorer) | Epix Explorer, a block explorer for Epix Chain |
| [epix-airdrop-xite](https://github.com/EpixZone/epix-airdrop-xite) | A simple airdrop claim xite |
| [vrf-debugger](https://github.com/EpixZone/vrf-debugger) | An example and debugging page for the verifiable random function beacon |

### Libraries, kits and contracts

| Repository | What it is for | Documented in |
| --- | --- | --- |
| [epixframe](https://github.com/EpixZone/epixframe) | EpixFrame, the JavaScript library a xite page uses to talk to the node | [EpixFrame](../libraries/epixframe.md) |
| [epixkit](https://github.com/EpixZone/epixkit) | EpixKit, the wallet connection library for Epix Chain | [EpixKit](../libraries/epixkit.md) |
| [create-react-epixnet-app](https://github.com/EpixZone/create-react-epixnet-app) | A starter for React based xites | [React and bundlers](../libraries/react.md) |
| [assets](https://github.com/EpixZone/assets) | Brand assets and the Epix UI kit | [UI kit and brand assets](../libraries/ui-kit.md) |
| [epix-tipping](https://github.com/EpixZone/epix-tipping), [epix-airdrop](https://github.com/EpixZone/epix-airdrop), [vrf-contracts](https://github.com/EpixZone/vrf-contracts), [contract_examples](https://github.com/EpixZone/contract_examples) | Solidity contracts and deployment examples | [Smart contract kits](../libraries/contracts.md) |

### Chain, docs and organization files

| Repository | What it is for |
| --- | --- |
| [EpixChain](https://github.com/EpixZone/EpixChain) | Epix Chain, the blockchain that holds `.epix` names and xID records. It is a separate Go project with its own contribution rules. [Epix Chain for xite developers](../web3/index.md) covers what a xite author needs. |
| [EpixNetDocs](https://github.com/EpixZone/EpixNetDocs) | These docs. See [Improve these docs](docs.md). |
| [.github](https://github.com/EpixZone/.github) | Organization-wide files: the contributing guidelines, security policy, support guide, code of conduct, and the issue and pull request templates. They apply to every repository that does not provide its own. |

The organization also hosts chain tooling and upstream forks that are outside the scope of these docs.

## Before you start

The [organization contributing guidelines](https://github.com/EpixZone/.github/blob/main/CONTRIBUTING.md) ask three things of every contributor:

1. Check the existing issues and pull requests so that you do not duplicate work.
2. For a large change, open an issue first and agree on the approach before you invest time in it.
3. Never report a security vulnerability in public. See [Report a security issue](#report-a-security-issue).

Participation is covered by the [code of conduct](https://github.com/EpixZone/.github/blob/main/CODE_OF_CONDUCT.md). By contributing you agree that your contribution is licensed under the license of the repository you contribute to. The node repository is MIT licensed, each xite and library states its license in its own repository, and vendored third-party code keeps its upstream license.

## Report a bug or propose a change

Open an issue in the repository that owns the problem:

| Problem area | Where to open the issue |
| --- | --- |
| Node, browser, network, dashboard | [EpixNet issues](https://github.com/EpixZone/EpixNet/issues) |
| Epix Wallet | [epix-wallet issues](https://github.com/EpixZone/epix-wallet/issues) |
| One specific app, such as Talk, Mail, Post, Blog, Wiki or Sites | That xite's repository |
| Chain, RPC endpoints, precompiles | [EpixChain issues](https://github.com/EpixZone/EpixChain/issues) |
| A mistake in these docs | [EpixNetDocs issues](https://github.com/EpixZone/EpixNetDocs/issues) |

The bug report template asks for:

- **What happened**, **steps to reproduce** and **expected behavior**. These three are required, and so is a safety checkbox confirming that you have not pasted a seed phrase or private key.
- **Version or commit.** Open the Dashboard menu (☰). The **Settings** panel shows the version at the bottom, for example `EpixNet v0.6.8`, and `epix-server --version` prints it too. For a source build, give the output of `git rev-parse HEAD`.
- **Platform**: operating system and architecture.
- **Relevant logs or output.** Remove anything private before you paste.

The feature request template asks what problem the change solves, the solution you propose, and any alternatives you considered. For open-ended ideas the template suggests starting a conversation on the community [Discord](https://discord.gg/bF2GKHgrfv) first.

!!! warning "Never post a seed phrase or private key"
    Scam accounts watch public issue trackers for words such as "wallet" and "seed" and reply while posing as support. Maintainers will never ask for your seed phrase, recovery phrase or private key, and will never send you to a "recovery" or "validation" site or ask you to continue in a private message. On GitHub, real maintainers show a **Member**, **Owner** or **Collaborator** badge. The same applies to the node's `private` folder: do not attach `users.json` or any key file to an issue.

## Report a security issue

Do not report a vulnerability through a public issue, a discussion, a public chat channel or social media. The organization [security policy](https://github.com/EpixZone/.github/blob/main/SECURITY.md) names two private channels:

1. **GitHub private vulnerability reporting** (preferred). On the affected repository, open **Security** and choose **Report a vulnerability**. This creates a private advisory that only maintainers can see.
2. **A private message on Discord.** Contact a core team member privately on the official [Discord](https://discord.gg/bF2GKHgrfv) server and ask for a secure channel. Message only people who hold a team role on that server, and do not post details in a public channel. The team never sends the first direct message, and never asks for seed phrases or private keys.

Include as much as you can of the following:

- The affected repository, component, and version or commit
- A description of the vulnerability and its potential impact
- Step-by-step reproduction instructions or a proof of concept
- Any mitigation or fix you can suggest

For EpixNet, the policy lists content signing and verification, the peer protocol, the Tor and I2P integration, and sandbox escapes in the xite wrapper as areas of particular interest. It also covers the smart contract kits, Epix Wallet and xID.

The policy commits to acknowledging a report within 72 hours and to keeping you informed while the issue is validated and fixed. It asks for a reasonable window to ship a fix before public disclosure, and offers credit in the advisory with your permission. Only the latest release and the default branch of each repository receive security fixes unless a repository says otherwise.

## Build the workspace from source

The install guides already cover a source build from a machine with nothing installed. Follow the one for your platform, then come back here:

- [Linux](../start/install-linux.md#build-from-source)
- [Windows](../start/install-windows.md#build-from-source)
- [macOS](../start/install-macos.md#build-from-source)
- [Android](../start/install-android.md#build-from-source)
- [iOS](../start/install-ios.md)

Three things differ when you build in order to contribute.

**Clone the development branch.** The install guides make a shallow clone of the latest release tag. For development, fork the repository and clone `main` with its history:

```sh
git clone https://github.com/<your account>/EpixNet.git
cd EpixNet
git remote add upstream https://github.com/EpixZone/EpixNet.git
```

**Build every target.** The install guides build only the node (`-p epix-server`). CI compiles the whole workspace, including tests and examples, with warnings treated as errors:

```sh
RUSTFLAGS="-D warnings" cargo build --workspace --all-targets --locked
```

On Debian or Ubuntu the whole workspace needs a few development packages beyond the basic build tools, because it includes the Ledger hardware wallet bridge and the system tray:

```sh
sudo apt install -y protobuf-compiler libudev-dev pkg-config libgtk-3-dev \
    libayatana-appindicator3-dev libxdo-dev
```

**Know how the wallet is staged.** The first time you compile `epix-browser`, its build script downloads the wallet release pinned in `shells/wallet-ext.rev` and checks it against `shells/wallet-ext.sha256`. Later builds reuse the staged copy without network access. Two environment variables change this:

| Variable | Effect |
| --- | --- |
| `EPIX_WALLET_SKIP=1` | Build without the wallet extension. Use it for offline builds. The browser then launches without the wallet. |
| `EPIX_WALLET_DIST=<path>` | Copy a local wallet build (`apps/extension/build/firefox` in an epix-wallet checkout) instead of downloading. Use it while you work on the wallet itself. |

To run what you built, use one of the documented [run modes](../start/running.md):

```sh
./scripts/run-browser.sh                           # node, managed Firefox and wallet together
cargo run -p epix-server -- --browser system       # standalone node, your system browser
EPIX_HEADLESS=1 cargo run -p epix-server           # no browser at all
```

Use `scripts/run-browser.sh` and not a bare `cargo run -p epix-browser`. The script also builds the native messaging host (`epix-nmh`), which the browser extension needs for name resolution and the Tor status icon. The managed browser needs a one-time desktop setup, described under "Full desktop app from source" in the [Linux](../start/install-linux.md#full-desktop), [Windows](../start/install-windows.md#full-desktop) and [macOS](../start/install-macos.md#full-desktop) guides.

!!! tip "Keep development away from your real profile"
    A source build uses the same default data folder as an installed release. Set `EPIX_DATA_DIR` to a separate folder while you develop, so that an experimental build never touches your own xites and keys. The managed EpixNet Browser allows one active profile at a time, so run a second node with `EPIX_HEADLESS=1` or `--browser system`.

Cargo keeps every old build artifact, and the `target` folder grows by tens of gigabytes after repeated release builds. `scripts/clean-build-cache.sh` prunes it safely, `--dry-run` shows what it would remove, and `--deep` runs a full `cargo clean`.

The mobile shells need platform toolchains (the Android NDK and Gradle, or Xcode). [`shells/README.md`](https://github.com/EpixZone/EpixNet/blob/main/shells/README.md) is the contributor guide for them.

## Run the tests

Run the suites that cover what you changed before you push. All of the commands below come from the CI configuration or the repository docs, and all run from the repository root.

### Rust

Test the crates you touched:

```sh
cargo test -p epix-content -p epix-db --locked
```

To run everything in one pass:

```sh
EPIX_WALLET_SKIP=1 cargo test --workspace --all-targets --locked --no-fail-fast
```

CI does not use that single command. It runs the suites in named groups so that a failure points at a subsystem, and some groups enable features that the default command leaves off:

| Group | Command |
| --- | --- |
| Browser startup and wallet staging | `cargo test -p epix-browser --locked` |
| Crypto byte compatibility (fixed vectors, Python interoperability) | `cargo test -p epix-crypt --locked` |
| EDX crates and database ingestion | `cargo test -p epix-blob -p epix-selfenc -p epix-edx -p epix-feed -p epix-search -p epix-xite -p epix-content -p epix-db --locked` |
| Node runtime, UI server and wire crates | `cargo test -p epix-runtime -p epix-ui -p epix-dht-net -p epix-reticulum --features epix-runtime/i2p --locked` |
| Isolated xite origins with password and streaming | `cargo test -p epix-ui --features ui-password,bittorrent --test loopback_content --test discovery_wait --locked` |
| Channels, identity resolution and RLN | `cargo test -p epix-chain -p epix-envelope -p epix-channel -p epix-pairwise-engine -p epix-group-engine -p epix-rln -p epix-plugins -p epix-node -p epix-nmh -p epix-ffi --locked` |
| EVX validator, workspace, state and service | `EVX_REQUIRE_LINUX_CONFINEMENT=1 cargo test -p evx-api -p evx-declaration -p evx-runtime -p evx-workspace -p evx-activation -p evx-state -p evx-worker -p evx-supervisor -p evx-host -p epix-evx --locked` |
| Tracker discovery with and without BitTorrent | `cargo test -p epix-discovery -p epix-xite --locked`, then again with `--features epix-xite/bittorrent` |

The EVX suites exercise real operating system confinement. `EVX_REQUIRE_LINUX_CONFINEMENT=1` makes a machine without it fail the run, and Linux acceptance needs a kernel with Landlock ABI 3 or newer. See [EVX](../build/evx.md) for background.

Some tests are marked `#[ignore]` with a stated reason, because they need the public network, a lab environment, or several minutes of wall clock time. Run one deliberately when your change touches that area, for example the in-process Tor bootstrap:

```sh
cargo test -p epix-tor -- --ignored
```

### JavaScript

The wrapper, the browser launcher and the bundled Firefox add-ons have Node.js tests that use the built-in test runner:

```sh
node --test ui/tests/*.test.cjs
node --test crates/epix-browser/tests/pac-routing.test.cjs
node --test crates/epix-browser/tests/urlbar.test.cjs
node --test packaging/firefox-addons/tests/*.test.mjs
```

On a fresh machine, set `EPIX_TEST_FETCH_DEPS=1` for the `pac-routing` test so that it downloads its locked test dependencies first.

### Python

Build, packaging and policy checks are Python scripts with no framework to install:

```sh
python3 scripts/test_data_relocation.py     # data folder moves, interrupted copy recovery
python3 scripts/test_android_native.py
python3 scripts/test_mobile_wallet.py
python3 scripts/check-platform-features.py  # for example, iOS must not link BitTorrent
python3 scripts/check-evx-platforms.py      # unsupported targets must not link the EVX runtime
```

### Mobile shells

The Android and iOS shells have regression runners that compile the production methods straight from the shell sources and run them against test doubles. Some need only a JDK and Kotlin, some need a running emulator, and some are manual checklists on a device. [`shells/tests.md`](https://github.com/EpixZone/EpixNet/blob/main/shells/tests.md) lists each runner, its prerequisites and what it does and does not prove. Two starting points:

```sh
python3 shells/ios/tests/run-regressions.py                    # macOS with Command Line Tools
python3 shells/android/tests/run-addon-policy-regressions.py   # JDK and Kotlin
```

### Vendored crates

The patched crates under `vendor/` are excluded from the workspace, so `cargo test --workspace` does not run their tests. If you touch one, run its own suite by manifest path. Each crate's `EPIXNET_PATCH.md` gives the exact command, for example:

```sh
cargo test --manifest-path vendor/saturating-time/Cargo.toml
```

### Fuzzing

`fuzz/` is a separate Cargo workspace with six libFuzzer targets for the EVX boundaries: declaration parsing, signed activation, IPC framing, the WebAssembly profile validator, durable state sequences and lifecycle metadata. It needs a pinned nightly toolchain and a pinned `cargo-fuzz`:

```sh
rustup toolchain install nightly-2026-10-03 --profile minimal
cargo install cargo-fuzz --version 0.13.2 --locked
cargo +nightly-2026-10-03 fetch --locked --manifest-path fuzz/Cargo.toml
CARGO_NET_OFFLINE=true cargo +nightly-2026-10-03 fuzz run declaration --fuzz-dir fuzz \
    --codegen-units 16 -- -max_total_time=45 -timeout=5 -rss_limit_mb=768 -max_len=65536
```

[`fuzz/README.md`](https://github.com/EpixZone/EpixNet/blob/main/fuzz/README.md) has the command for every target and is careful about what a short campaign shows: it samples inputs, and it does not establish the absence of vulnerabilities. If a campaign finds a crash, keep the reproducer and add a regression test with the fix.

## Checks that run on a pull request

Changes reach `main` only through pull requests. A branch ruleset blocks direct pushes, force pushes and deletion of `main`. The workflows below live in [`.github/workflows`](https://github.com/EpixZone/EpixNet/tree/main/.github/workflows) and start automatically when you open or update a pull request against `main`.

### Always

| Workflow | Jobs | What a failure usually means |
| --- | --- | --- |
| **CI** | Build & test, SQLite wrapper regressions, Android shell regressions, Linux packaging (Ubuntu 22.04 and 24.04), Windows filesystem and time regressions, Apple filesystem regressions, Mobile feature profiles, iOS bridge authorization regressions, EVX sandbox (macOS), EVX Pulley library (iOS) | The workspace does not compile with `--locked` and `-D warnings`, a test group failed, or a dependency leaked into a platform profile that must not have it |
| **Security scan** | cargo audit, cargo deny, osv-scanner, semgrep, gitleaks, EVX boundary fuzz smoke | A dependency has a new advisory, a secret-like string was committed, or a fuzz target crashed |
| **CodeQL** | Analyze (Rust) | A new code scanning alert |
| **SonarCloud** | native-coverage, browser-coverage, sonarcloud | The SonarCloud quality gate on new code, for example duplication or cognitive complexity |
| **EVX platform acceptance** | Linux native confinement (x86-64 and arm64), Windows portable core, Windows native EVX | EVX confinement or its portable core regressed on a platform |

Security scan and CodeQL also run weekly on a schedule, so a new advisory against a pinned dependency can turn a check red without any change on your side. The semgrep job uploads its findings to GitHub code scanning, where they appear as alerts.

### Only when matching files change

| Workflow | Runs when you touch |
| --- | --- |
| **Package mirror compatibility** | `crates/epix-mirror`, `packaging/mirrors`, `Cargo.toml` or `Cargo.lock`. Runs on Linux, Windows and macOS. |
| **EVX mobile fixture compilation** | The Android and iOS EVX fixtures or `crates/evx-android` |
| **EVX Windows native fixture** | `crates/evx-windows`, `crates/evx-windows-native`, `crates/evx-api`, `crates/evx-runtime`, `Cargo.toml` or `Cargo.lock` |
| **Startup UI** | The mobile shell startup sources, `crates/epix-ffi/src` or the launcher's startup code. Renders the iOS startup widgets in a simulator. |

### Dependency policy

Three scanners read the same lockfile, and each has its own list of accepted advisories:

| Scanner | Configuration |
| --- | --- |
| `cargo deny check advisories bans sources` | [`deny.toml`](https://github.com/EpixZone/EpixNet/blob/main/deny.toml) |
| `osv-scanner` on `Cargo.lock` | [`osv-scanner.toml`](https://github.com/EpixZone/EpixNet/blob/main/osv-scanner.toml) |
| `cargo audit` | The `--ignore` flags in [`security.yml`](https://github.com/EpixZone/EpixNet/blob/main/.github/workflows/security.yml) |

A green run means that no new advisory has appeared. Every accepted advisory carries a written reason: why it is not reachable or cannot be fixed yet, and when to drop the exception. If your change adds a dependency that trips a scanner, prefer a patched version. Do not add an ignore without the same kind of justification, and expect a reviewer to ask whether a vendored patch is the better answer. See [vendored patches](conventions.md#vendored-patches).

`gitleaks` scans the working tree with [`.gitleaks.toml`](https://github.com/EpixZone/EpixNet/blob/main/.gitleaks.toml), which allowlists test vectors and fixtures. Put test keys under a `tests`, `fixtures` or `examples` path and they will not be flagged.

Dependabot opens weekly pull requests for Cargo and GitHub Actions. Routine minor and patch bumps are switched off, and security updates are grouped.

## Open a pull request

1. Fork the repository and create a branch from `main`, named for the change:

    ```sh
    git checkout -b fix/short-description
    ```

2. Make the change. Match the style of the surrounding code and follow [Coding conventions](conventions.md).
3. Add or update tests, and run the suites that cover your change.
4. Keep commits focused, with messages that explain why and not only what.
5. Open the pull request against `main` and fill in the template: a description, related issues (for example `Closes #123`), the type of change, how you tested it, and the checklist.
6. Respond to review. Maintainers may ask for changes before they merge.

A pull request that changes user-visible behavior should update the matching documentation. Design notes and validation records live in the node repository's [`docs/`](https://github.com/EpixZone/EpixNet/tree/main/docs) folder, and user and developer documentation lives [here](docs.md).

## How releases are made

Maintainers cut releases. You do not need any of this to contribute, but it helps to know how a merged change reaches users. The full procedure is in [`packaging/RELEASING.md`](https://github.com/EpixZone/EpixNet/blob/main/packaging/RELEASING.md).

- **A version tag starts a release.** Pushing a tag that starts with `v`, such as `v0.6.8`, runs the **Release** workflow. Publishing a release or pre-release from the GitHub interface runs it as well.
- **The version comes from the tag.** The leading `v` is stripped and passed to the build as `EPIX_VERSION`. A development build without that variable reports the latest reachable git tag, and every build is stamped with its short commit hash. The version appears in the Dashboard's **Settings** panel, and both values are in the `version` and `rev` fields of `serverInfo`.
- **One job per platform.** The workflow builds a signed and notarized macOS disk image, Linux packages (`.deb`, `.rpm`, `.AppImage` and a tarball, with a `SHA256SUMS` file), a Windows installer signed through Azure Trusted Signing, and an Android APK. The desktop packages bundle a pinned Firefox ESR and the pinned wallet build.
- **The artifacts attach to a GitHub release.** The intended flow is to publish a pre-release, test the attached binaries, and then mark that same release as the latest, which keeps the tested files untouched.
- **Test builds need no tag.** The **Build** workflow is started by hand from the Actions tab for all platforms or one. It needs no signing secrets and attaches unsigned artifacts to the run.

Two pins make a release reproducible, and each is changed through an ordinary pull request:

| Pin | Files |
| --- | --- |
| Epix Wallet build | `shells/wallet-ext.rev` (an epix-wallet commit) and `shells/wallet-ext.sha256` (the checksum of that commit's published archive). Update both together. |
| Bundled Firefox ESR | The version in `packaging/fetch-firefox-esr.sh` |

Downloads and install steps for users are in [Install EpixNet](../start/install.md).

## Contribute to an official xite

The official xites are ordinary xites, written in plain JavaScript with no build step, so the edit and test loop is short.

1. Fork the xite's repository from the [table above](#official-xites).
2. Load your checkout into a node. Add the folder as a xite you own, or copy the files into that xite's folder in your [data directory](../internals/data-directory.md), then reload the page. Your node serves the local files as they are, so you see your change before anything is signed.
3. Run the tests where the repository has them:

    ```sh
    node --test tests/*.test.cjs
    ```

4. Open a pull request against the xite's `main` branch.

Two points are specific to xites:

- **Merging is not publishing.** A merged pull request changes the source repository only. The xite's owner then signs the new files and publishes them from a node that holds the owner key, and only that reaches other peers. Leave the signatures and file list in `content.json` alone. See [Publishing](../build/publishing.md).
- **Follow the xite conventions.** One class per file, wrapped so that nothing leaks into the shared global scope, with libraries vendored in `js/lib/`. [Coding conventions](conventions.md#official-xites) has the details and examples.

To learn how xites work before you change one, start with the [quickstart](../build/quickstart.md) and [Anatomy of a xite](../build/anatomy.md).

## Contribute a translation

The organization guidelines explicitly welcome new locales. Most official xites keep one JSON file per language in a `languages/` folder, named for the language code, such as `languages/fr.json`. Each file maps the English source string to its translation:

```json title="languages/fr.json"
{
	"Follow in Newsfeed": "Suivre dans le fil d'actualité",
	"Following": "Vous suivez",
	"New topics": "Nouveaux sujets"
}
```

To add or improve a language, copy an existing file, translate the values and leave the keys exactly as they are, then open a pull request against the xite's repository. As with any xite change, the translation reaches users after the owner signs and publishes it. [Translating a xite](../build/i18n.md) explains how the files are loaded and which language codes to use.

## Publish your own xite

You do not need anyone's permission or review to publish on EpixNet. A xite you create is yours: you hold its key, and you sign and publish it yourself. Follow the [quickstart](../build/quickstart.md), and see [Building xites with AI coding agents](../ai/index.md) if you work with an assistant. To help other people find your xite, you can submit it to the [Epix Sites](../start/apps.md#epix-sites) directory, where each listing is a public, signed record tied to the submitter's xID.

## Contribute to the docs

Corrections and new pages are welcome. [Improve these docs](docs.md) explains how the documentation is organized, how to preview a change, and the writing rules.

## Get help

Questions about building, running a node or writing a xite are best asked in the public channels of the community [Discord](https://discord.gg/bF2GKHgrfv). The organization [support guide](https://github.com/EpixZone/.github/blob/main/SUPPORT.md) lists every channel. Terms used on this page are defined in the [glossary](../reference/glossary.md).
