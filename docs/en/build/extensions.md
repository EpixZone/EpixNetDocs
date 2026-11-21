---
description: Publish a Mozilla-signed Firefox extension through a xite so EpixNet Browser users can install and update it from a verified publisher.
---

# Publish browser extensions

EpixNet Browser can install Firefox WebExtensions that are published as files of a xite. This page is for extension authors and xite owners: it covers what the package must look like, how to publish it, what the user is shown, how updates work, and the limits the installer enforces. The user-side walkthrough is in [Browser and wallet](../start/browser-wallet.md).

## How it works

An extension published on a xite passes two independent checks before it can be installed:

1. **Xite provenance.** The package must be a file in the xite's signed manifest, with its exact size and hash, under a valid signature chain from the xite's accepted root. This proves which publisher distributed these exact bytes.
2. **Engine signature.** The browser engine verifies Mozilla's signature on the package, exactly as it does for any other extension.

Neither check replaces the other. A xite signature alone does not grant extension privileges, and it does not replace the browser's own permission prompt. A Mozilla signature alone does not make an arbitrary file installable through this manager.

The extension manager is native browser UI. It is not exposed as an EpixFrame command or a wallet API, so a xite page cannot start, approve or observe an installation. What you publish is a file and a link.

!!! note
    The extensions are ordinary WebExtensions. They receive only the engine permissions the user approves, and the installer does not attach the Epix Wallet's native message handlers to them.

## Platform availability

| Platform | Status |
| --- | --- |
| EpixNet Browser on Linux, Windows and macOS | Supported. The bundled engine is the Firefox 153 ESR series, from 153.4.0. |
| EpixNet for Android | Supported with the app's pinned GeckoView build |
| EpixNet for iOS | Not supported. Installation is rejected explicitly. |
| A regular browser pointed at a node | Not applicable. The manager is part of EpixNet Browser. |

An XPI is a Gecko package, so it cannot be installed in the WebKit engine that iOS requires.

## Package requirements

Your package must be a standard XPI that satisfies all of the following.

Mozilla signature
:   Publish the unchanged file that Mozilla signed. Mozilla signs add-ons through addons.mozilla.org, including self-distributed ("unlisted") extensions that never appear in the public catalog. See Mozilla's [signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). Repacking, recompressing or editing the archive after signing invalidates it.

Explicit extension ID
:   The manifest must declare a stable ID in `browser_specific_settings.gecko.id` (the older `applications.gecko.id` is also read, and the two must agree if both are present). The ID may contain letters, digits and `@ . _ - { }`, up to 255 characters.

Manifest basics
:   `manifest_version` must be 2 or 3. `name` (up to 256 bytes) and `version` (up to 128 bytes) are required, and neither may contain control characters. A permission listed twice in the same list is refused.

No privileged permissions
:   The installer rejects any package whose `permissions`, `optional_permissions`, `host_permissions` or `optional_host_permissions` contain `nativeMessaging`, `nativeMessagingFromContent`, `nativeMessagingFromAddon`, `management`, `mozillaAddons`, `mozillaAddonsTheme`, `geckoViewAddons` or anything starting with `experiments.`. It also rejects a manifest with `experiment_apis` or `theme_experiment`.

No reserved IDs
:   IDs ending in `@epix.zone`, the ID `zone.epix.nmh` and IDs starting with `epix-internal` are reserved.

A minimal manifest that meets these rules:

```json title="manifest.json"
{
  "manifest_version": 3,
  "name": "Example reader mode",
  "version": "1.2.0",
  "browser_specific_settings": {
    "gecko": { "id": "reader@example.epix" }
  },
  "permissions": ["storage"],
  "host_permissions": ["*://*.epix/*"]
}
```

!!! warning "Host permissions keep the browser's normal scope"
    Publisher verification is not a per-xite permission boundary. In particular, a host permission that covers the local node's loopback origin can cover several xites served from that origin. Request the narrowest host patterns your extension needs, and say why in your xite's description.

### Size and archive limits

| Limit | Value |
| --- | --- |
| Package (archive) size | 32 MiB |
| Total unpacked size | 128 MiB |
| `manifest.json` after decompression | 1 MiB |
| Entries in the archive | 8192 |
| Permissions per list | 256 entries, each up to 2048 characters |
| All permission strings together | 65536 characters |
| Managed extensions per browser profile | 256 (updates stay available at the limit) |

The archive must be a plain single-disk ZIP using stored or deflate compression. ZIP64, split or prefixed archives, symbolic links, duplicate or case-aliased paths, and overlapping entries are refused. A package signed by Mozilla's normal pipeline already satisfies this.

## Publish the package

1. **Add the signed XPI to your xite.** Use a simple, stable path such as `addons/reader.xpi`. The path becomes part of the extension's identity for updates, so choose one you can keep.

2. **Sign the xite.** Signing records the file in `content.json` with its exact size and hashes:

    ```json title="content.json (excerpt)"
    "files": {
      "addons/reader.xpi": {
        "size": 184320,
        "sha512": "<64 hex characters>",
        "b3": "<64 hex characters>"
      }
    }
    ```

    The installer checks the size and every hash that is present (`sha512` and the BLAKE3 `b3`) against the package bytes.

    The package may be a required file (under `files`) or an optional file (under `files_optional`). It must be a flat file entry: a package split into pieces as a [big file](files.md) is refused, and a path listed as both required and optional is refused.

3. **Publish the xite** as usual. See [Publishing](publishing.md).

4. **Tell users the package address.** It has the form:

    ```text
    https://<publisher>.epix/addons/reader.xpi
    ```

    `http://` and `epix://` are accepted with the same host and path. The host must be a lowercase `.epix` name. The path must be a plain relative path that ends in `.xpi`, at most 1024 characters, with no query string, fragment, percent escape, backslash or `..` component.

If the package is in a file that a delegated `content.json` governs, that content must also have a valid signature chain from the xite's accepted root.

### Required or optional file

| | Required (`files`) | Optional (`files_optional`) |
| --- | --- | --- |
| Downloaded with the xite | Yes, by every visitor | Only when needed |
| Best for | Small extensions central to the xite | Larger packages, or several extensions in one xite |

If the package file is not on the user's node yet, the installer fetches it from peers by its signed BLAKE3 identity (`b3`), within the 32 MiB limit and a 60 second timeout, and checks it against the signed size and hashes. A package stored inside a bundle cannot be fetched this way and must already be downloaded on the user's node. See [Files and media](files.md) for how optional files and their hashes are declared.

!!! note "The xite must already be known"
    The manager installs only from a xite the user's node already has, with a verified publisher. It does not clone an unknown xite and does not use a stale name mapping. Ask users to open your xite first, then install.

## What the user sees

On desktop the user opens **Extensions from xites** from the toolbar. On Android they long-press the Epix icon and choose **Extensions**. They enter the package address, and the manager shows a review with:

- the publisher (your xite) and the package path,
- the extension's name, ID and version,
- the signature status and the SHA-256 digest of the package,
- the required permissions and sites (your `permissions` and `host_permissions`),
- the optional permissions and sites.

After the review, the browser engine shows its own native permission prompt. The installation happens only when the user allows that prompt. Closing or cancelling the review approves nothing, and a prepared review expires after five minutes.

Write your permission list for this moment. Every entry you declare is displayed, and unexplained broad permissions are the most common reason a careful user declines.

## Updates

Updates are manual and always go through the same review.

1. Have Mozilla sign the new version.
2. Replace the file at the **same path** in your xite.
3. Sign and publish the xite.
4. The user chooses the installed extension's update action and reviews the new package.

An update is accepted only if the canonical publisher, the path and the extension ID all match the original installation, and it must pass the same signature, byte and permission checks as a first install. If you move the package to a different path or change its ID, it is a different extension as far as the manager is concerned.

Managed updates do not follow an extension's own `update_url`, and they never substitute a package from addons.mozilla.org for the one the user reviewed. An extension that was installed outside this manager cannot be adopted by it.

The manager also lets the user enable, disable and remove the extensions it installed.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Only .epix publisher URLs are accepted" | The address is not a `.epix` host, or contains uppercase characters |
| "Package path must be an unambiguous relative .xpi path" | The path has a query, fragment, percent escape or backslash, or does not end in `.xpi` |
| "Bundled addon package must already be downloaded in its xite" | The package is not on the user's node and lives in a bundle, so it cannot be fetched on demand |
| "Missing package has no signed EDX object hash" | The package is not on the user's node and its entry has no signed `b3` hash. Sign the xite again with the current node. |
| "Addon download timed out" or "Signed addon object is unavailable from the known peers" | The package is not on the user's node and no reachable peer served it within 60 seconds |
| "Package bytes differ from signed hash" or "Package length differs from signed declaration" | The file on disk is not the one recorded in `content.json`. Sign and publish again. |
| "Addon packages require a flat signed file" | The package was published as a big file with a piece map |
| "Explicit stable addon ID required" | The manifest has no Gecko ID |
| "Native or privileged addon permission is not allowed" | The manifest requests a blocked permission |
| "Reserved addon ID" | The ID collides with an Epix-reserved pattern |
| "Managed extension limit reached" | The profile already manages 256 extensions |
| The native prompt rejects the package | The engine did not accept the Mozilla signature, or the extension is not compatible with the bundled engine version |

Pending installs, updates and removals survive a browser restart. If the browser reports inconsistent extension state at startup, it stops with a visible error by design. Users should keep the affected profile and logs for diagnosis and should not delete receipt files to dismiss the error.

## Publisher checklist

- [ ] The XPI is the exact file Mozilla signed.
- [ ] The manifest declares an explicit Gecko ID that you will keep for the life of the extension.
- [ ] No blocked permissions, and the narrowest host permissions that work.
- [ ] The package is under 32 MiB and is a flat file entry.
- [ ] The path is short, lowercase and permanent.
- [ ] The xite page explains what the extension does, lists its permissions in plain language, and shows the full package address.
- [ ] You tested a first install, an update and a removal with a disposable browser profile.

## What this boundary does not cover

The installer protects against untrusted xites and ordinary extensions. It does not claim protection against a compromised browser engine, a privileged extension, or a local process that already has the user's access. A valid xite signature and a valid Mozilla signature together say who distributed and who signed the package. They do not say the extension is safe to use.

## Related pages

- [Browser and wallet](../start/browser-wallet.md)
- [Files and media](files.md)
- [Publishing](publishing.md)
- [Node source: xite-extensions.md](https://github.com/EpixZone/EpixNet/blob/main/docs/xite-extensions.md)
