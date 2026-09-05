# Completion ledger

This ledger preserves the complete requested scope across increments. It is not a new, narrower plan. Sources: ROADMAP.md, REVERSE_ENGINEERING_PLAN.md, COMPETITOR_RESEARCH.md, and the user's Windows-first/Mac-later and open-source requirements. The overall goal remains active until each applicable requirement has direct evidence.

| Requirement | Current evidence | Remaining acceptance work |
| --- | --- | --- |
| Original open-source implementation and license/provenance | MIT source; public contracts cited; no competitor implementation incorporated | Audit all additional model/runtime/installer licenses before release |
| Local MCP installation through AI clients | CLI config generation/backup/merge; stdio/HTTP/fresh-tarball tests | Named-client setup and real Avid reads, managed dependencies, update/rollback/uninstall |
| Native project/bin/clip/marker reads and writes | 16 methods tested on Windows 2024.12, preview/apply MCP, persistence and token regressions | Per-action undo/recovery, restart, lock/shared-project and version matrix |
| Timeline reading, range/track search, source mapping | Offline AVB/AAF/OTIO inspection; local collection range mapping | Semantic live/saved sequence graph, snapshots/diffs, actual editor range queries |
| Sequences, selects, stringouts, trims, track assignment | Curated collections and OpenTimelineIO round trip | Avid import/export/relink/save/reopen/render; fix native subclip track discrepancy |
| Visual/text/image/frame similarity and bounded results | Pinned local CLIP, text/image smoke tests on Sonoma | Dense/shot/range samples, reference-frame tool, scope discovery, ranking/resource benchmark |
| Transcript search/read/ranges/export | Immutable revisions, correction ancestry and checksum-checked deletion; substring/range tests; five formats; English Whisper runtime smoke | Speech accuracy fixtures, additional languages/model selection, diarization, broader correction/recovery qualification |
| Hierarchical summaries and node drill-down | Extractive transcript outline | Grounded generated summaries, provenance validation and whole-media/node queries |
| People collections | Pinned YuNet/SFace runtime; bounded indexing, pagination, names/merge/move/recluster/removal; real Sonoma crop and deletion workflow | Accuracy/resource benchmarks, dense sampling, interrupted-job recovery and broader media qualification |
| Watch folders/shared media cache | Polling CRUD/start/stop/checkpoints and moved-source aliases; synthetic MP4 runtime proof | More failure/concurrency/resource qualification; interrupted analysis resume and offline/relinked paths |
| QC/reports/thumbnails/exports/copies | Seven-file Sonoma report/contact sheet, thumbnails/clips/copy with hashes | Thumbnail strips, camera/QC report depth, loudness/silence/black/freeze/VFR/sync, output QA and presets |
| Project snapshots/source usage/complexity | Existing bounded structural inspectors | Semantic snapshots/diffs and cross-bin graph, complexity/effect/render/relink/turnover reports |
| Optional Jumper provider for licensed users | Public OpenAPI contract researched | Separate local authenticated adapter, version/schema checks, runtime with licensed provider |
| Named Windows UI operations | Computer-use research only | Shipping action adapter, focus/shortcut/dialog checks, failure and post-state tests |
| Original workflow skills | Not packaged | Ingest/QC, selects, review markers, turnover, export; supported-client examples |
| Optional enterprise adapters | CTMS HAL read and prerequisite diagnostics | Scoped production operations, NEXIS/path mapping/locks, authorized AMT qualification |
| Optional sanctioned Extension | SDK-neutral bridge protocol/tests | Avid SDK/license/package access and installed Extension tests; unavailable SDK is not substituted by native evidence |
| Mac | Explicitly deferred to a Mac by user | Mac implementation and separate real-host/client qualification when working on a Mac |
| Sonoma/end-to-end acceptance | Seven MP4s linked in disposable 1080p30 project and persisted; sources unchanged | Actual video display/playback/render, marker/subclip/timeline conformance, failure/recovery and original Premiere source qualification |
| Delivery | Feature branch committed and pushed incrementally | Final full audit, CI/client/host evidence, docs/release artifacts consistent with actual support |

Evidence statuses distinguish implementation, offline tests, simulated adapters, real local media, real Avid response, visible editor state, saved-file persistence, and clean-machine/client qualification. A green package test or tool count cannot close a host/feature requirement.

## Progress checkpoints

- `0d382aa`: native adapter, local search/transcription/artifacts/jobs/collections/setup baseline; complete local package check, 135 TypeScript tests, 51 total MCP tools. Pushed to `codex/open-source-full-plan`.
- Watch/cache increment: real generated MP4 indexed only after stability, restart checkpoint avoided reindexing, moved content retained its ID/transcript, removing the watch preserved media. Runtime script: `scripts/research/qualify-watch.mjs`.
- `5b956c1`: persistent watches/cache aliases; complete local package check, 139 TypeScript tests, 56 tools; pushed.
- Native subclip increment: all-track 30 fps source bounds qualified through MCP and bin persistence; saved AVB confirmed `_START`/`_END` and picture/sound tracks. Initial track-selection discrepancy isolated to native numeric track indexing.
- Saved snapshot increment: real Sonoma bin indexed into 32 mobs; the new subclip mapped exactly to source frames 2850–2880 on three tracks; identical saved snapshots had no semantic differences. Native live sequence reading/creation and Avid interchange remain open.

- People increment: 12 real Sonoma samples produced three face crops; naming, merge, move, recluster, individual removal and whole-index deletion passed with the source SHA unchanged. This proves the workflow, not recognition accuracy.

- Transcript review increment: real stdio MCP calls imported synthetic review text for the Sonoma preview, corrected text/timing/speaker, searched the new revision, exported and inspected SRT timing, and deleted the original revision. Source SHA unchanged; this is review workflow evidence, not speech recognition accuracy.
