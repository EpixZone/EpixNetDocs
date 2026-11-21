---
description: EVX runs sandboxed WebAssembly programs that a xite publishes, on the user's own node, with explicit consent. Status, declaration format, capabilities, limits, scheduling and how to publish a program.
---

# EVX programs

EVX (Epix Virtual eXecution) lets a xite publish a small WebAssembly program that runs on the user's own node, outside the browser, inside a confined process, with access only to capabilities the user granted. A program can run once on request or on a schedule in the background while no page is open. This page is for xite authors who want to understand what EVX can do today, declare a program, and publish it. The engineering reference lives in the node repository and is linked at the end.

## Status and availability

Read this section before you plan a feature around EVX.

!!! warning "Early feature with a deliberately small surface"
    EVX is implemented and shipped in the desktop node, but the node's own documentation lists an external independent security review as an open release gate. The set of capabilities a program can use is closed and small: today a program can compute and can read and write a few small text files in a private workspace. It has no network access, no access to xite files or the database, no chain access and no way to publish. Treat EVX as a foundation to experiment with, not as a general backend.

| Platform | EVX |
| --- | --- |
| Linux desktop and server node | Included. Requires a kernel with Landlock ABI 3 or newer and seccomp. Execution is refused when confinement is unavailable. |
| macOS desktop node | Included. The worker confines itself with a deny-default sandbox profile. |
| Windows desktop node | Included. The worker runs in an AppContainer with Job Objects, through the Pulley interpreter. |
| Android and iOS | Not available. The mobile builds omit EVX execution and its commands. |
| Public gateways | Inspection only. Consent and execution are refused for visitors. |

On a node where the worker binary or the confinement profile is missing, inspection and status still work, `evxStatus` lists the `unsupported_host` reason, and run requests are refused with "unsupported host". Your xite must work without EVX, and should present it as an optional enhancement.

## How it fits together

1. You add a program file and an `evx` section to the xite's root `content.json`. The section is a request. It grants nothing.
2. Your page calls `evxRequest`. The wrapper inspects the declaration (without compiling or running anything) and shows a consent dialog with the buttons **Enable EVX for this xite**, **Allow once** (when applicable) and **Deny**.
3. If the user enables it, the node stores a grant bound to the declaration and its capabilities, with limits clamped to the host's ceiling.
4. To run, the node verifies the root signature, re-hashes the program files against the signed manifest, compiles the module in a confined child process, and executes it in another confined worker with no filesystem, no network and no ability to start processes.
5. Every request the program makes goes through a broker that checks it against the grant.

Three layers hold the program:

- **A restricted WebAssembly profile.** One import, two required exports, and most post-MVP proposals disabled.
- **Authority checks.** Every broker request is decoded strictly and checked against the granted capabilities, and rechecked when a file write is committed.
- **Operating system confinement.** The worker restricts itself before it reads any input, and the supervisor enforces time, CPU and memory limits from outside.

## Declare a program

The declaration is a top-level `evx` object in the root `content.json`. The xite owner's signature already covers it.

```json title="content.json (excerpt)"
{
  "files": {
    "evx/tally.wasm": { "sha512": "<64 hex characters>", "size": 164 },
    "index.html": { "sha512": "<64 hex characters>", "size": 2210 }
  },
  "evx": {
    "version": 1,
    "programs": {
      "tally": {
        "runtime_profile": "wasm-core-v1",
        "entry": "evx/tally.wasm",
        "allow_run_once": true,
        "capabilities": [
          { "api": "workspace.read" },
          { "api": "workspace.write" }
        ],
        "limits": {
          "fuel": 5000000,
          "storage_bytes": 16384
        }
      }
    },
    "jobs": {
      "refresh": {
        "program": "tally",
        "schedule": {
          "type": "interval",
          "seconds": 1800,
          "anchor": "unix_epoch",
          "missed": "skip"
        },
        "max_concurrency": 1
      }
    }
  }
}
```

### Section fields

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | Yes | Must be the integer `1` |
| `programs` | Yes | Map of program ID to program object |
| `jobs` | No | Map of job ID to job object |
| `streams` | No | Reserved. Any entry is reported as unsupported. |

IDs use ASCII letters, digits, `_`, `.` and `-`, start with a letter or digit, and are 1 to 128 characters long.

### Program fields

| Field | Required | Meaning |
| --- | --- | --- |
| `runtime_profile` | Yes | Must be `wasm-core-v1` to be usable |
| `entry` | Yes | Path of the module that exports `run`, relative to the xite root |
| `dependencies` | No | Additional file paths pinned and verified together with the entry. No duplicates, and none equal to the entry. |
| `allow_run_once` | No | Whether you ask for the program to be runnable on demand. Defaults to `false`. |
| `capabilities` | Yes | Array of `{ "api": "<name>" }` objects. May be empty. At most 64. |
| `limits` | No | Requested resource limits. Unnamed limits use the defaults below. |

Every file in the closure (the entry plus its dependencies) must be listed in the manifest's required `files` map. A file under `files_optional` cannot be used, because optional files are not guaranteed to be present. A closure may contain at most 16 files, each at most 1 MiB, and 4 MiB in total.

!!! note "Practical module size"
    The 1 MiB figure is a structural ceiling. The module is passed to the confined compiler in a single bounded frame, which leaves room for a module below about 96 KiB, and for a compiled artifact below about 192 KiB. Keep programs small.

### Job fields

| Field | Required | Meaning |
| --- | --- | --- |
| `program` | Yes | ID of a usable program in the same declaration |
| `schedule.type` | Yes | Must be `interval` |
| `schedule.seconds` | Yes | Period in whole seconds, at least 1 |
| `schedule.anchor` | Yes | Must be `unix_epoch`: occurrences fall on multiples of the period since the Unix epoch |
| `schedule.missed` | Yes | `skip` drops missed occurrences. `coalesce` collapses them into one catch-up run. |
| `max_concurrency` | No | 1 to 16. Defaults to 1. |

### Malformed versus unsupported

The parser is strict, and it distinguishes two kinds of problem:

- **Malformed** input fails the whole section: duplicate JSON keys anywhere in `content.json`, unknown fields, wrong types, bad identifiers, path escapes, missing required fields, a float where an integer belongs (`1800.0` is refused), or a `version` other than `1`. Nothing in a malformed declaration is usable.
- **Unsupported** requirements disable only the affected program or job and are shown to the user with a reason: an unknown capability, another runtime profile, a non-interval schedule, an unknown limit name, limits outside the valid range, a closure of more than 16 files, or any `streams` entry.

There is no permissive fallback. An unknown schedule type does not become "run manually", and an unknown limit is not replaced by a default.

## Capabilities

The capability set is closed. A capability takes no parameters, so each object is exactly `{ "api": "<name>" }`.

| Capability | Request from the program | Response |
| --- | --- | --- |
| `workspace.read` | `{"op":"workspace.read","path":"<path>"}` | `{"ok":true,"data_b64":"<base64>","bytes":<n>}` |
| `workspace.write` | `{"op":"workspace.write","path":"<path>","text":"<text>"}` | `{"ok":true,"bytes":<n>}` |
| `game.score.get` | `{"op":"game.score.get"}` | `{"ok":true,"score":42}` |

`game.score.get` is a fixture that stands in for a future EpixNet capability. It always returns the same value and exists so the boundary can be tested. A failed or denied request returns `{"ok":false,"error":"<message>"}`.

### The workspace

Each xite gets a private workspace directory under the node's private data folder, outside every served xite directory. Peers cannot fetch it and pages cannot read it. Only the xite's own granted programs reach it, and only through the broker.

| Workspace limit | Value |
| --- | --- |
| File size | 2048 bytes per read or write |
| Entries (files plus directories) | 128 |
| Path depth | 8 components, each up to 255 bytes, 512 bytes in total |
| Total storage | The `storage_bytes` limit, including staging copies |

Paths are relative, use `/` as the separator, and may not contain `.` or `..` components, a component that starts with `..` or `.pending-`, backslashes, colons or control characters.

A write is staged, synced and then committed only after the supervisor re-authorizes it. If anything fails after that point the run ends with `effect_unknown`: the file may or may not have changed. The host records a digest of every authorized write and returns a read only when the bytes match an authorized version, so a file replaced behind the program's back is denied instead of read.

## Limits

A declaration requests limits. The node clamps each one to its host ceiling, and the grant stores the result. The ceiling is compiled into the node and cannot be raised by a page, a command or a setting.

| Limit | Default | Valid range | Host ceiling |
| --- | --- | --- | --- |
| `memory_bytes` (Wasm linear memory) | 1 MiB | 64 KiB to 256 MiB | 64 MiB |
| `fuel` (instruction budget per run) | 100000 | 1 to 10^12 | 10^9 |
| `host_calls` (broker calls per run) | 16 | 1 to 1024 | 256 |
| `storage_bytes` (workspace quota) | 4096 | 0 to 1 GiB | 16 MiB |
| `wall_seconds` (whole run) | 2.0 | 0.1 to 600 | 30 |
| `host_call_seconds` (one broker call) | 0.8 | 0.05 to 60 | 5 |
| `process_cpu_seconds` | 2.0 | 0.05 to 300 | 30 |
| `process_rss_bytes` | 128 MiB | 16 MiB to 4 GiB | 512 MiB |

`host_call_seconds` may not exceed `wall_seconds`. A value outside the valid range makes the program unsupported. A value inside the range but above the ceiling is reduced to the ceiling.

Background work has two more fixed limits: at most 288 scheduled runs per xite per UTC day (one every five minutes fills it exactly), and at most two background workers running at once across all xites. Resident memory is sampled by the supervisor, not hard-capped, so a short overshoot between samples is possible.

## Write a program

A program is a core WebAssembly module with this shape:

- It exports a function `run` with the signature `() -> i32`. The return value is reported as the run's `value`.
- It exports its linear memory as `memory`, with no declared maximum (the host sets the limit).
- It may import exactly one function, `evx.call`, with the signature `(i32, i32, i32, i32) -> i32`. No other import is accepted, including WASI.
- It has no start function, and exports no name beginning with `evx`.

The allowed feature set is the WebAssembly MVP plus mutable globals, sign extension, saturating float conversions, multi-value and bulk memory. SIMD, reference types, garbage collection, exceptions, tail calls, threads, 64-bit memory, multiple memories and the component model are disabled. A table must declare a bounded maximum.

`evx.call(req_ptr, req_len, out_ptr, out_cap)` sends one JSON request and writes the JSON response into your buffer:

| Return value | Meaning |
| --- | --- |
| 0 or greater | Length of the response written at `out_ptr` |
| `-1` | Invalid pointer, length or memory, or an output capacity outside 4096 to 8192 bytes |
| `-2` | The response does not fit |

A request may be up to 8192 bytes. Offer an output buffer of 4096 to 8192 bytes: 4096 bytes is the largest response, and a capacity below 4096 or above 8192 is refused with `-1`.

The smallest useful program computes a value and needs no capability:

```wat title="evx/calc.wat"
(module
  (memory (export "memory") 1)
  (func (export "run") (result i32)
    i32.const 19
    i32.const 23
    i32.add))
```

A program that writes a workspace file keeps its request in a data segment:

```wat title="evx/tally.wat"
(module
  (import "evx" "call" (func $call (param i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  ;; 63 bytes of JSON at offset 0
  (data (i32.const 0)
    "{\22op\22:\22workspace.write\22,\22path\22:\22state/last.txt\22,\22text\22:\22hello\22}")
  (func (export "run") (result i32)
    i32.const 0      ;; request pointer
    i32.const 63     ;; request length
    i32.const 4096   ;; response buffer pointer
    i32.const 4096   ;; response buffer capacity
    call $call))
```

Convert the text format to a binary module with a WebAssembly assembler such as `wat2wasm` from WABT or `wasm-tools parse`, and publish the `.wasm` file. You can use any language toolchain that emits a core module, as long as the output meets the profile above. Toolchains that enable reference types, SIMD or threads by default must be configured to turn them off, and the module must not import WASI.

## Publish a program

1. Put the compiled module in the xite, for example at `evx/tally.wasm`.
2. Add the `evx` section to the root `content.json`.
3. Sign the xite. Signing records the module's size and hash in `files`, which is what the declaration is bound to.
4. Publish as usual. See [Publishing](publishing.md).

Check the result before you ask users for consent. Open the file browser for your xite and follow the **EVX declaration** link, or go to `/list/<address>?evx=1`. The panel shows the signature status, the declaration digest, every program with its pinned files, the requested capabilities and limits, the jobs, and every unsupported item with its reason. It never compiles or runs anything. The file browser itself is described in [Dashboard and sidebar](../start/dashboard.md).

## Ask for consent from a page

A page can ask and can read status. It cannot grant, revoke, change limits or start a run directly.

```js title="js/evx.js"
// Ask the user to enable EVX, or to run one program once.
function requestEvx(program) {
  return new Promise((resolve) => {
    const params = program ? { program } : {};
    epixFrame.cmd("evxRequest", params, resolve);
  });
}

async function enableOrRun() {
  const answer = await requestEvx("tally");
  if (answer.error && answer.granted === undefined) {
    showStatus("EVX is not available here: " + answer.error);
  } else if (!answer.granted) {
    showStatus("EVX was not enabled.");
  } else if (answer.mode === "once") {
    // Allow once runs the program immediately and returns its result.
    showResult(answer.result, answer.error);
  } else {
    showStatus("EVX is enabled for this xite.");
  }
}
```

The examples use `epixFrame`, the ready-made instance of the [EpixFrame library](../libraries/epixframe.md). Call `enableOrRun` from a user action such as a button.

Use the callback form shown here. An "allow once" answer can carry both `granted: true` and an `error` (the grant happened but the run failed), which a promise wrapper that rejects on `error` would hide.

Possible answers:

| Answer | Meaning |
| --- | --- |
| `{granted: true, mode: "enable"}` | A persistent grant was stored |
| `{granted: true, mode: "once", result}` | The named program ran once. `result` is the run result. |
| `{granted: true, mode: "once", result: null, error}` | Consent was given but the run did not complete |
| `{granted: false}` | The user chose **Deny** or closed the dialog |
| `{granted: false, mode, error}` | The node refused the grant, for example because the xite is unsigned or not fully downloaded, or the declaration changed while the dialog was open |
| `{error}` | No dialog was shown: a public gateway, a node without EVX, a missing `evx` section or a malformed one |

**Allow once** is offered only when the page named a program that is usable and declares `allow_run_once: true`.

The dialog lists the xite and publisher, the integrity status, each program with its entry file and hash prefix, capabilities and limits, the declared triggers, anything this node cannot honor, and the effective limits. When the declaration has at least one usable job, a separate paragraph states that enabling lets those jobs run in the background even when no page of the xite is open.

### Read status

```js
epixFrame.cmd("evxStatus", {}, (status) => {
  if (!status || status.error) return hideEvxPanel(); // this node has no EVX
  const enabled = status.grant && status.grant.enabled;
  const reasons = status.reasons;        // for example ["no_grant"] or ["unsupported_host"]
  const lastRun = (status.runs || [])[0]; // newest first, up to 10; absent on a public gateway
  renderEvxPanel(enabled, reasons, status.jobs, lastRun);
});
```

`evxStatus` returns the grant, recent run records, whether a run is in progress, a `reasons` list (`no_grant`, `revoked`, `expired`, `run_once_not_allowed`, `background_not_allowed`, `unsupported_host`, `plugin_disabled`), the host's ceiling and each registered job with its `next_due_unix`, `failures`, `runs_today`, `paused_reason` and `waiting_reason`. `evxInspect` returns the declaration summary that the consent dialog is drawn from. On a public gateway both are redacted: the grant becomes a bare `{enabled}`, each job only `{job, enabled}`, the reasons are limited to `no_grant`, `unsupported_host` and `plugin_disabled`, and the run history is removed.

A run result has a `status` of `ok`, `error`, `denied`, `timeout`, `resource_limit`, `effect_unknown` or `quarantined`, the `value` that `run` returned, the broker `responses`, and usage figures such as `fuel_used`.

## Consent, updates and revocation

- **Grants are bound to the declaration.** The wrapper sends the declaration digest it showed the user, and the node refuses the grant if the declaration or the bound files changed in the meantime.
- **Updates inside the grant need no new prompt.** If you publish a new version signed by the same owner, with capabilities and limits within what the user granted, it runs under the existing grant.
- **Wider requests wait.** If a new version asks for more, scheduled jobs pause with `declaration_outgrew_grant` and nothing beyond the grant runs until the user consents again.
- **Rollbacks are refused.** A root `content.json` with an older `modified` time than the last admitted version is denied.
- **`ADMIN` is unrelated.** A xite with `ADMIN` cannot grant itself EVX, and an EVX grant confers no `ADMIN`. EVX is not a `wrapperPermissionAdd` permission.
- **Management is not available to pages.** Revoking a grant, changing limits, and pausing, resuming or manually running a job are accepted only from the wrapper's own trusted commands or the node operator's local admin interface. A page that sends `evxRevoke` or `evxSetLimits` gets an error. The operator can also disable the `Evx` plugin, which stops all admission.

## Scheduled jobs

Scheduling happens inside the node, survives restarts, and does not need a page to be open.

- Occurrences are numbered slots: slot `k` covers `k * seconds` to `(k + 1) * seconds` since the Unix epoch. The scheduler adds a small random delay to each wake.
- An occurrence never runs twice. A manual run and the scheduled run of the same slot share one identity.
- Missed occurrences are never backfilled one by one. With `skip` the next run happens on schedule. With `coalesce` exactly one catch-up run happens.
- Every admission rechecks that the plugin is enabled, the grant is enabled and unexpired, the declaration is still covered, the daily budget has room, and a worker is free.
- A failing job backs off: the first failure waits one minute, each further failure doubles the wait, and the wait is capped at 6 hours. Success resets the count.
- If the node stops while a run that had already started was in progress, the occurrence is closed as `effect_unknown` and the job pauses with `reconcile_required` until it is explicitly resumed. The node does not claim exactly-once execution for file writes.

Design jobs to be idempotent: read the current workspace state, compute, and write a complete new value. Do not rely on a run having happened a particular number of times.

If a manual write was interrupted, a page can ask the wrapper to show a workspace recovery confirmation by sending `evxRecoverWorkspace`. Recovery checks pending files against their previously authorized contents. It runs no program, grants nothing and resumes no job.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `evxRequest` answers `{error}` and no dialog appears | The root `content.json` needs a well-formed `evx` section, and the node must include EVX. Gateways never show the dialog. |
| The dialog appears but enabling fails | Only a xite whose root is signed by its owner and whose files are fully downloaded can be granted. The dialog shows this as the integrity status. |
| A program is listed as unsupported | Read the reason in the inspection panel: unknown capability, another runtime profile, limits out of range, or an entry that is not in `files` |
| "declared in files_optional; only required files can be bound" | Move the module out of the optional pattern and sign again |
| Status lists `unsupported_host` and runs are refused | The node has no usable worker or confinement, for example a Linux kernel without Landlock ABI 3 |
| Runs end with `resource_limit` or `timeout` | Lower the work per run or request higher limits, within the ceiling |
| `evx.call` returns `-1` | The output capacity is below 4096 or above 8192 bytes, or a pointer is out of bounds |
| A job never runs and status shows `daily_budget` | The xite used its 288 background runs for the UTC day |
| A job is paused with `reconcile_required` | A previous run's effect is unknown. The operator must resume it after checking the workspace. |

## Further reading

The node repository has the engineering depth this page leaves out:

- [evx.md](https://github.com/EpixZone/EpixNet/blob/main/docs/evx.md): crates, execution boundary, effect semantics, known limits
- [evx-platforms.md](https://github.com/EpixZone/EpixNet/blob/main/docs/evx-platforms.md): per-platform acceptance status
- [evx-mobile.md](https://github.com/EpixZone/EpixNet/blob/main/docs/evx-mobile.md): why mobile execution is not enabled
- [evx-direct-lifecycle.md](https://github.com/EpixZone/EpixNet/blob/main/docs/evx-direct-lifecycle.md): worker lifecycle across host restarts
- [evx-workspace-provenance.md](https://github.com/EpixZone/EpixNet/blob/main/docs/evx-workspace-provenance.md): workspace read provenance and recovery

Related pages in these docs:

- [The wrapper sandbox](sandbox.md)
- [content.json reference](content-json.md)
- [Admin API reference](../api/admin.md)
- [Node architecture](../internals/architecture.md)
