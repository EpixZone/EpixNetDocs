---
description: Carry a signed APT, DNF, Homebrew or Chocolatey repository snapshot over a xite with epix-mirror, export it from a local node, and serve it to an ordinary package manager.
---

# Package mirrors

`epix-mirror` transports a bounded snapshot of a software repository through an ordinary signed xite. A publisher stages a complete repository and publishes it as a xite. A consumer exports it from their own node and serves it on loopback to an unmodified package manager: APT, DNF, Homebrew or Chocolatey. This page is for people who operate mirrors or who need software updates to reach machines over EpixNet, including on networks where the upstream servers are unreachable.

`epix-mirror` is a native command-line tool. It does not change system package sources, install packages, sign xites or publish files by itself. Every one of those steps stays under your control.

## Trust model

Two independent signatures protect a mirrored package, and you need both.

| Layer | What it proves | Who checks it |
| --- | --- | --- |
| Xite signature | Which publisher distributed this exact snapshot, and that its bytes are intact | The EpixNet node and `epix-mirror` |
| Upstream repository signature and checksums | That the packages are the ones the upstream project released | Your package manager |

The exported repository keeps its original signatures, metadata, package checksums and expiry. Keep your package manager's signature and checksum verification enabled.

!!! danger "Choose upstream keys independently"
    Do not trust a signing key because it arrived inside a mirror. Obtain the upstream project's key through a channel you already trust, and configure your package manager with that key. A mirror publisher who could also choose the key you verify against would control everything you install.

## Supported layouts

| Client | What the snapshot must contain | How the client reads it |
| --- | --- | --- |
| APT | A complete binary repository with a signed `InRelease` or `Release` plus `Release.gpg`, SHA256 indexes, and every indexed package | Local HTTP repository with `signed-by` |
| DNF | `repodata/repomd.xml` plus its `.asc`, all referenced metadata, the XML primary index, and every indexed RPM | Local HTTP `baseurl` with `gpgcheck=1` and `repo_gpgcheck=1` |
| Homebrew | Selected artifacts and an explicit map of the original download request paths | `HOMEBREW_ARTIFACT_DOMAIN`, with upstream formula and bottle checksums |
| Chocolatey | A flat directory of self-contained `.nupkg` packages, including dependencies | The exported local folder passed to `--source` |

APT `Packages` and DNF primary XML indexes may be plain, gzip or xz. Other index compression formats are rejected, not treated as complete. APT source-package repositories and a full Homebrew API or tap mirror are outside the supported layouts.

### Limits

| Limit | Value |
| --- | --- |
| Files per snapshot | 60,000 |
| Size per file | 8 GiB |
| Total snapshot size | 15 GiB |
| Catalog size | 8 MiB |
| Expanded repository metadata | 64 MiB |
| Node export archive | About 16 GiB |

A large distribution should be published as several complete repositories, not as incomplete slices of one upstream index. The node's own ZIP exporter has separate bounds.

## Install the tool

`epix-mirror` is built from the node repository. It is currently built separately from the desktop release bundle.

```sh
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
cargo build -p epix-mirror --release --locked
```

The binary is `target/release/epix-mirror` (`epix-mirror.exe` on Windows). To put it in Cargo's binary directory instead:

```sh
cargo install --path crates/epix-mirror --locked
```

The four commands:

```text
epix-mirror stage  --source DIR --output NEW --manager apt|dnf|homebrew|chocolatey --expires RFC3339 [--url-map JSON]
epix-mirror export --node http://127.0.0.1:PORT --address epix1... --output NEW [--cookie-file FILE] [--expected-snapshot SHA256]
epix-mirror verify --snapshot DIR
epix-mirror serve  --snapshot DIR [--port 42700]
```

Every option takes a value, and an unknown or repeated option is an error.

## Publish a snapshot

### 1. Obtain a complete repository

Use the upstream project's own synchronization tool to fetch a complete public repository. Include the dependencies of the packages you intend to support. `epix-mirror` checks that each indexed package and metadata file exists with its declared checksum. It is not a crawler and does not fetch missing files.

### 2. Choose an expiry

Every snapshot carries an explicit UTC expiry.

- For APT it cannot be later than the upstream `Valid-Until`, and an already expired release is rejected.
- DNF and artifact collections have no equivalent signed freshness field, so you choose the expiry yourself.

Repackaging old metadata does not make it current. Use an expiry that matches the real upstream metadata.

### 3. Stage

```sh
epix-mirror stage \
  --manager apt \
  --source /path/to/public-repository \
  --output /path/to/new-snapshot \
  --expires 2027-01-15T00:00:00Z
```

The date above is only an example. The output directory contains `epix-mirror.json` (the catalog) and `repo/` (the files, copied unchanged). On success the tool prints the snapshot identifier, the manager and the expiry. Keep the snapshot identifier: consumers can pin to it.

Staging rejects symbolic links, hidden paths, nonportable paths, duplicate names and common identity files.

!!! danger
    Point `--source` only at a public repository directory. Never point it at your node's data folder or at a directory that contains signing keys.

### 4. Create, sign and publish the xite

Create a dedicated xite with the normal authoring flow, copy the two staged entries into its directory, then sign and publish with the owner key:

```sh
epix-server siteCreate
# Copy epix-mirror.json and repo/ into the new xite's directory under <data folder>/data/<address>/
epix-server siteSign <address> --full
epix-server sitePublish <address>
```

`siteCreate` works offline against the data folder, so it refuses to run while a node holds that folder. Stop the node first, or click **Create new xite** in the Dashboard instead. `siteSign` and `sitePublish` are handed to a running node when one is up. `siteCreate` prints the new xite's private key once; store it safely. `--full` re-hashes every file instead of trusting the sign cache, which suits a freshly copied repository.

Rules for the xite:

- **Keep repository files mandatory.** Do not add an `optional` pattern in `content.json` that lets part of a supposedly complete repository be unavailable.
- **Publish only after staging succeeds.**
- **Keep signing keys and the node's private data out of the xite directory.**

To update the mirror later, stage a new complete snapshot, check it, replace the two entries in the same xite, and sign and publish again. See [Publishing](publishing.md) for signing details and key handling.

## Consume a snapshot

### 1. Download the xite

Open the mirror xite on the receiving node and wait until all of its required files are available.

### 2. Export and verify

```sh
epix-mirror export \
  --node http://127.0.0.1:42222 \
  --address <address> \
  --output /path/to/snapshot-001

epix-mirror verify --snapshot /path/to/snapshot-001
```

Export reads from the node's verified ZIP endpoint. That endpoint freezes the node's accepted manifest tree, checks file hashes, excludes private and unsigned files, and refuses changed or missing required content. Export does not ask the node to execute commands or fetch remote URLs.

| Option | Purpose |
| --- | --- |
| `--node` | The node's UI address. Must be a literal loopback address with its port. Defaults to `http://127.0.0.1:42222`. Redirects and environment proxy settings are refused. |
| `--address` | The mirror xite's canonical `epix1` address |
| `--output` | A new directory. An existing destination is refused. |
| `--cookie-file` | A private Netscape-format cookie file, for a password-protected node. Credentials are never placed on the command line or in exported files. |
| `--expected-snapshot` | Require a specific snapshot identifier. Obtain it from the publisher through a channel you trust. |

Export validates the catalog, every file's size and hash, repository completeness and expiry, then atomically renames the finished directory into place. A failed export removes its temporary directory.

### 3. Serve

```sh
epix-mirror serve --snapshot /path/to/snapshot-001 --port 42700
```

The server:

- binds only `127.0.0.1` and accepts only the matching literal `Host`,
- serves exact catalog entries with `GET` and `HEAD`, including bounded byte ranges,
- has no directory listing, upstream proxy, administrator API or write endpoint,
- stops serving a snapshot that has changed or expired.

Keep snapshot directories writable only by their operator, and do not edit an active snapshot. Export to a new directory instead.

## Configure clients

These examples show configuration for a mirror you have chosen. The tool does not apply them. Keep other repositories enabled only if you intend to allow dependencies or updates from those sources.

=== "APT"

    Add a source entry that names your independently obtained keyring:

    ```text
    deb [signed-by=/path/to/independently-verified-upstream-keyring.gpg] http://127.0.0.1:42700 stable main
    ```

    Then run `apt-get update` and `apt-get install` or `upgrade` as usual.

    Do not add `trusted=yes`, do not pass `--allow-unauthenticated`, and do not disable `Check-Valid-Until`. See [APT's source list documentation](https://manpages.debian.org/unstable/apt/sources.list.5.en.html) for `Signed-By`.

=== "DNF"

    ```ini
    [epix-snapshot]
    name=Selected upstream through EpixNet
    baseurl=http://127.0.0.1:42700
    enabled=1
    gpgcheck=1
    repo_gpgcheck=1
    gpgkey=file:///path/to/independently-verified-upstream-key.asc
    metadata_expire=0
    skip_if_unavailable=0
    ```

    Then run `dnf --refresh install` or `upgrade` as usual. Package and repository signature checks are separate settings and both matter. See the [DNF configuration reference](https://dnf.readthedocs.io/en/latest/conf_ref.html).

=== "Homebrew"

    Before staging, create a JSON URL map. Keys are the exact paths Homebrew requests, and values are files relative to the public source directory:

    ```json title="map.json"
    {
      "/https://downloads.example.org/tool-1.0.tar.gz": "tool-1.0.tar.gz",
      "/v2/homebrew/core/tool/blobs/sha256:0123456789abcdef": "selected-bottle.tar.gz"
    }
    ```

    Use the real full bottle digest and include every OCI manifest and blob requested for the selected bottle. Stage with `--manager homebrew --url-map map.json`.

    On the client:

    ```sh
    export HOMEBREW_ARTIFACT_DOMAIN=http://127.0.0.1:42700
    export HOMEBREW_ARTIFACT_DOMAIN_NO_FALLBACK=1
    brew install <trusted-formula>
    brew upgrade <trusted-formula>
    ```

    The server performs exact map lookups and never forwards an unlisted URL. Homebrew rewrites GHCR URLs for the artifact domain but leaves arbitrary source URLs unchanged, so use GHCR artifacts for this route. For an ordinary source archive, a formula you trust can point its URL or mirror at `http://127.0.0.1:42700/https://downloads.example.org/tool-1.0.tar.gz` while keeping the original SHA256.

    Keep the trusted formula or tap and its original checksums. A bottle is built for one operating system and architecture. Formula, tap and API updates, build dependencies and Git-based resources need their own availability: an artifact snapshot does not mirror all of Homebrew. No checksum bypass is provided. See the [Homebrew environment documentation](https://docs.brew.sh/Manpage.html#environment).

=== "Chocolatey"

    Use the exported folder directly, without the HTTP server:

    ```powershell
    choco install <package-name> --source 'C:\mirrors\snapshot-001\repo'
    choco upgrade <package-name> --source 'C:\mirrors\snapshot-002\repo'
    ```

    Chocolatey's HTTP sources need a NuGet or OData feed, which a static directory is not, so this workflow uses the flat local folder interface that [Chocolatey supports](https://docs.chocolatey.org/docs/how-to-host-feed/).

    Include every `.nupkg` dependency. Many community packages download an installer from their install script, so they must already be internalized (self-contained) to work offline. The tool does not rewrite scripts, installer URLs or checksums.

## Update and roll back

Export each newly accepted snapshot to a **new** directory. Do not overwrite the one in use.

1. Export the updated xite to a new directory and run `verify`.
2. Check the reported snapshot identifier and expiry.
3. Stop the local mirror server.
4. Start it on the same port with the new directory.

Clients can then refresh and upgrade without changing their repository URL. Switching directories this way prevents a client from reading metadata from one snapshot and package bytes from another.

Keep the old directory until the new snapshot has passed the client's own checks. Restoring an old directory does not bypass the catalog expiry or the upstream expiry. The tool does not automate downgrades and cannot prove upstream freshness when the upstream format has no signed expiry. A newly exported xite is subject to the node's normal rules for accepting signed updates.

## What to tell your users

If you publish a mirror for other people, state these things plainly on the xite:

- which upstream repository and release the snapshot was taken from, and when,
- the snapshot identifier and the expiry,
- where to obtain the upstream signing key independently,
- that availability depends on reachable peers that carry the xite,
- that a valid xite signature identifies you as the distributor and says nothing else about the software.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `stage` fails on an APT repository | The release is expired, the requested expiry is later than `Valid-Until`, an indexed package is missing, or the index uses an unsupported compression format |
| `export` refuses to run | The destination already exists, or `--node` is not a literal loopback address |
| `export` fails with missing content | The receiving node has not finished downloading the xite's required files |
| `export` fails on a password-protected node | Pass `--cookie-file` with a valid session cookie |
| The server stops answering | The snapshot expired or a file in the directory changed |
| The package manager reports a signature error | The keyring you configured does not match the upstream key. Do not disable verification. Recheck the key source. |
| Chocolatey cannot find a dependency | The dependency `.nupkg` is not in the folder |

## Related pages

- [Publishing](publishing.md)
- [content.json reference](content-json.md)
- [Files and media](files.md)
- [Run a node](../start/running.md)
- [Node source: package-mirrors.md](https://github.com/EpixZone/EpixNet/blob/main/docs/package-mirrors.md)
