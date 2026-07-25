# Capability matrix

Status vocabulary:

- **Implemented** — code and automated tests exist in this repository.
- **Dependency** — implemented but needs the named local executable/package.
- **Bridge contract** — MCP side exists; the Avid extension is not yet implemented.
- **Provider-gated** — requires Avid SDK access, licensing, or enterprise infrastructure.
- **Not claimed** — intentionally unsupported until a lawful, verifiable path exists.

| Area | Status | Detail |
| --- | --- | --- |
| Project discovery and inventory | Implemented | AVP/AVS/AVB/lock/interchange/media classification, sizes, timestamps, optional hashes |
| Shared-bin lock analysis | Implemented | Active companion locks and orphan locks |
| AVP/AVS text configurations | Implemented | Encoding, content, key/value clues, JSON, XML element inventory |
| AVP/AVS binary semantics | Not claimed | Magic/hash/entropy/null ratio/string evidence only; public semantic specification was not found |
| AVB bin analysis | Dependency | `pyavb==1.4.0`; bounded object graph, bin views, mobs, tracks, clips/sequences where supported |
| AAF analysis | Dependency | `pyaaf2==1.7.1`; mobs, slots, components, essence, descriptors, definitions |
| ALE analysis | Implemented | Headings, columns, rows, warnings |
| EDL analysis | Implemented | CMX-style events, transitions, comments, clip names, motion lines |
| Clip/container metadata | Dependency | `ffprobe`; raw output plus normalized video/audio/timecode summary |
| Full project aggregate report | Implemented | Per-format coverage, dependency health, truncation, source-safety statement |
| Live project/bin/sequence inspection | Bridge contract | `inspect.getState` request/response contract exists |
| Project and bin editing | Bridge contract | Catalog, token, capability, expected-state, and audit layers exist |
| Timeline editing and trimming | Bridge contract | Cataloged; requires per-operation Extension implementation and validation |
| Tracks, effects, transitions | Bridge contract | Cataloged; requires per-operation Extension implementation and validation |
| Audio, color, titles, captions | Bridge contract | Cataloged; requires per-operation Extension implementation and validation |
| Multicam, markers, playback | Bridge contract | Cataloged; requires per-operation Extension implementation and validation |
| Export/mixdown/output | Bridge contract | Cataloged as external-risk operations; requires output-file verification |
| MediaCentral asset operations | Provider-gated | Requires a configured MediaCentral environment, credentials, and applicable Avid rights |
| Avid Media Toolkit essence writes | Provider-gated | Requires licensed SDK and a separate adapter |
| Arbitrary scripts/raw UI automation | Not claimed | No initial unsafe escape hatch |

## Editing catalog coverage

The 167 catalog entries cover:

- projects and settings;
- bins, folders, views, selections, and item management;
- link/import/transcode/consolidate/relink/source settings;
- source monitor and sequence management;
- splice/overwrite/lift/extract/replace/segment/trim/slip/slide/extend edits;
- track creation, routing, targeting, monitoring, locks, mute, and solo;
- effects, transitions, parameters, keyframes, rendering;
- audio gain/pan/automation/AudioSuite/mixdown;
- color correction and LUTs;
- markers, titles, captions, multicam;
- playback/navigation;
- export, AAF/ALE/EDL, frame output, mixdowns, queues;
- workspaces, panels, user/project/site settings, and mapped commands.

Catalog coverage is a design map, not live validation. The runtime extension must advertise each supported operation.
