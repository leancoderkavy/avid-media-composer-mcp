# Completion ledger

This ledger preserves the complete requested scope across increments. It is not a new, narrower plan. Sources: ROADMAP.md, REVERSE_ENGINEERING_PLAN.md, COMPETITOR_RESEARCH.md, and the user's Windows-first/Mac-later and open-source requirements. The overall goal remains active until each applicable requirement has direct evidence.

| Requirement | Current evidence | Remaining acceptance work |
| --- | --- | --- |
| Original open-source implementation and license/provenance | MIT source; public contracts cited; no competitor implementation incorporated | Audit all additional model/runtime/installer licenses before release |
| Local MCP installation through AI clients | CLI config generation/install/update/entry rollback/removal with checksums and backups; generated-command ping; stdio/HTTP/fresh-tarball tests | Named-client application setup and real Avid reads; managed package/dependency install/update/rollback/uninstall |
| Native project/bin/clip/marker reads and writes | 17 methods tested on Windows 2024.12, preview/apply MCP, persistence and token regressions | Per-action undo/recovery, restart, lock/shared-project and version matrix |
| Timeline reading, range/track search, source mapping | Offline AVB/AAF/OTIO inspection; saved semantic snapshots/diffs and direct source mappings; collection range mapping | Live sequence graph and actual editor range queries |
| Sequences, selects, stringouts, trims, track assignment | Curated collections, OTIO round trip, and real AAF two-cut three-track import with saved AVB conformance | Source-checked straight-cut AAF builder shipped in branch; native import/export adapter and playback/render/relink/undo; multiple sources/rates and broader sequence conformance |
| Visual/text/image/frame similarity and bounded results | Pinned local CLIP, ranged uniform sampling, reference-frame queries, paginated sample discovery and media/time scopes | Shot detection, broad ranking/resource benchmarks and full-length coverage qualification |
| Transcript search/read/ranges/export | Immutable revisions, correction ancestry and checksum-checked deletion; substring/range tests; five formats; English Whisper runtime smoke | Speech accuracy fixtures, additional languages/model selection, diarization, broader correction/recovery qualification |
| Hierarchical summaries and node drill-down | Local generated transcript hierarchy, overview/node queries, source checksum/indices, discovery/deletion | Factual accuracy/omission/truncation benchmarking, broader language/long-media coverage and visual grounding |
| People collections | Pinned YuNet/SFace runtime; bounded indexing, pagination, names/merge/move/recluster/removal; real Sonoma crop and deletion workflow | Accuracy/resource benchmarks, dense sampling, interrupted-job recovery and broader media qualification |
| Watch folders/shared media cache | Polling CRUD/start/stop/checkpoints and moved-source aliases; synthetic MP4 runtime proof | More failure/concurrency/resource qualification; interrupted analysis resume and offline/relinked paths |
| QC/reports/thumbnails/exports/copies | Seven-file report/contact sheet; bounded black/freeze/silence/loudness/timestamp QC with generated-fixture and Sonoma evidence | Thumbnail strips, camera report depth, multistream/HDR/offset QC, perceptual sync, output QA and delivery presets |
| Project snapshots/source usage/complexity | Saved semantic snapshots/diffs and direct cross-bin source usage | Complexity/effect/render/relink/turnover reports and deeper nested/effect graph support |
| Optional Jumper provider for licensed users | Public OpenAPI contract researched | Separate local authenticated adapter, version/schema checks, runtime with licensed provider |
| Named Windows UI operations | Computer-use research only | Shipping action adapter, focus/shortcut/dialog checks, failure and post-state tests |
| Original workflow skills | Five original skills packaged for ingest/QC, selects, review markers, turnover and export; client setup/examples documented; fresh-install tool-reference validation | Named-client application qualification |
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

- Scoped visual increment: 24 Sonoma frames over [60,90) indexed and searched through stdio; the reference frame ranked first with cosine 1, and [80,85) filtering returned exactly four samples. Model-loading/sample/query workflow took 14.964 seconds on this Windows host. Shot detection and semantic accuracy benchmarking remain open.

- QC increment: generated black/static/silent-to-moving/tone MP4 validated event source timestamps within 80 ms in a nonzero-start range. Sonoma [60,90) produced JSON/HTML reports, no detected black/freeze/silence or variable timestamp intervals, and measured -22.5 LUFS/-5.81 dBTP. Both source hashes remained unchanged.

- Configuration lifecycle increment: built CLI installed, updated, restored and removed Avid entries in temporary Claude/VS Code JSON formats; generated commands completed real MCP ping. Rollback preserved unrelated edits. This does not prove either named client UI or package/dependency lifecycle.

- Summary increment: pinned local DistilBART generated three nodes from synthetic editorial notes attached to Sonoma media in 7.191 seconds; leaf source references matched. The observed overview ended mid-sentence, so output now flags missing sentence boundaries and accuracy/quality acceptance remains open.

- AAF host research: exported a real Sonoma master, built a 120-frame three-track composition, imported into a disposable bin, closed/reopened, and verified exact cuts in the saved AVB. Avid visibly showed the timeline; captured video remained black. See NATIVE_AAF_QUALIFICATION.md for export-path behavior, identity remapping and remaining fidelity requirements.

- AAF builder increment: real stdio tools inspected the Avid-exported Sonoma template, validated local locators, created a conforming 120-frame three-track selects AAF and rejected mismatched rates. Python tests verify source preservation, exact output conformance and no overwrite; TypeScript tests cover network/out-of-scope locators. Native import remains a separate adapter gap.
