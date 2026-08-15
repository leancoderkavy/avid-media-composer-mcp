# Architecture

## Goals

- Provide useful, read-only Avid analysis without requiring Media Composer to be installed or running.
- Make live editing possible through the sanctioned Media Composer Extensions surface.
- Never confuse cataloged, requested, applied, and verified operations.
- Preserve professional project, source-media, and shared-bin safety.

## Components

### MCP server

`src/server.ts` exposes 19 tools, one resource, and two workflow prompts over local stdio. Tool results use a stable structured envelope:

```json
{
  "ok": true,
  "tool": "avid_analyze_ale",
  "data": {}
}
```

Errors carry a stable code, message, and optional details.

### Native analysis

The TypeScript analysis layer provides:

- deterministic recursive inventory;
- file classification and optional SHA-256 hashing;
- symlink skipping and allowed-root enforcement;
- text/UTF-16 detection;
- binary magic, entropy, null-ratio, and string extraction;
- ALE and CMX-style EDL parsing;
- `ffprobe` orchestration and normalized stream summaries.

### Python inspection

`python/avid_inspector.py` opens AVB and AAF read-only through pinned `pyavb` and `pyaaf2` versions. Its serializer:

- detects cycles;
- assigns stable per-run object references;
- bounds depth and item count;
- hashes and previews byte arrays;
- preserves object types and property errors;
- writes only JSON to stdout.

The Node process launches it without a shell, applies a timeout and output ceiling, and rejects invalid JSON.

### Extension bridge

The live bridge uses an explicitly configured, authenticated local mailbox:

```text
bridge/
  state/capabilities.json
  requests/<operation-id>.json
  responses/<operation-id>.json
```

The extension publishes a signed fresh heartbeat plus extension/installation/session identity,
optional state revision, Media Composer version, host platform, OS version, architecture,
supported bridge commands, and supported edit operations. Protocol v3 authenticates capability,
request, and response envelopes with an installation secret; it includes request nonce, expiry,
client session, and monotonically increasing sequence binding, and rejects v1/v2 downgrade,
symlinked mailbox paths, replayed responses, and hosts outside the qualified three-release matrix.
The MCP still does not infer operation support from Media Composer version alone. This is a contract
for a future sanctioned Extension, not evidence that an Avid host bridge exists.

### Version and platform compatibility

The compatibility layer contains source-linked rules for Media Composer 2025.12.x, 2025.6, and
2024.12.x. It evaluates Windows/macOS qualification independently from live operation support and
can discover standard installation paths on either desktop platform.

### Edit plans

An edit plan contains:

- optional project identity/path;
- one to 100 cataloged operations;
- operation arguments;
- expected-state guards;
- explicit destructive opt-in.
- a per-operation expected-state guard required before a live mutation request.

Canonical key ordering produces a stable SHA-256 confirmation token. Any plan change invalidates the token.

## Evidence states

| State | Meaning |
| --- | --- |
| Cataloged | The operation has a stable name, risk level, and verification contract |
| Bridge-advertised | A connected extension claims it can execute that operation |
| Previewed | The exact plan passed validation and has a confirmation token |
| Requested | The MCP wrote the operation to the local bridge mailbox |
| Applied | The extension returned a successful structured response |
| Verified | A subsequent live-state read confirms the intended state |

Only the final state is end-to-end evidence.

## Extension points

- `MediaComposerExtensionAdapter` — local project/bin/timeline control
- `MediaCentralAdapter` — enterprise asset and Production Management workflows
- `MediaToolkitAdapter` — licensed OP-Atom/AAF essence operations
- future source-safe QC analyzers — loudness, freeze/black-frame, timecode continuity, transcript, and visual shot metadata

Each adapter must publish its own health and capability evidence.
