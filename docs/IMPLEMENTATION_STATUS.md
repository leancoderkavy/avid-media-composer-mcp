# Open-source implementation status

Work in progress, 2026-09-05. The full plan is not complete. This file distinguishes implementation from host qualification and preserves the remaining scope.

The complete requirement-by-requirement [completion ledger](COMPLETION_LEDGER.md) is the completion audit source. Verified increments are committed and pushed on `codex/open-source-full-plan`; the overall goal remains active.

## Implemented in this checkout

- TypeScript native MCAPI client using local descriptor discovery on the pinned Windows 2024.12 executable. No Avid SDK/descriptor payload is distributed.
- Native read, preview and single-use apply MCP tools; scoped project/bin/clip checks, process-owner verification and per-user cross-process write lock.
- All-track native subclips for qualified 30 fps sources/projects, with explicit frame bounds, preflight duration validation and created-MOB readback.
- Semantic saved-bin snapshots/diffs, bounded track/range source mapping and direct cross-bin source-usage queries. Subclip bounds and timecode components are decoded; unknown effects and mixed-rate paths report incomplete coverage.
- Local media index keyed by SHA-256; metadata and transcript substring search, immutable transcript revisions and bounded transcript reads.
- Codec/resolution/frame-rate/channel facets, five transcript export formats, extractive outlines and HTML contact sheets.
- Immutable selects collections with tags/notes, source-to-stringout range queries and frame-quantized single-video-track OTIO export.
- Thumbnails, trimmed MP4s, verified copies and HTML inventory reports in an explicitly configured output directory.
- Local CLIP text/image similarity over sampled frames, with explicitly downloaded pinned weights.
- Local English Whisper transcription with reviewable timestamped output; no speaker diarization.
- Bounded worker queue with job status and cancellation for media analysis; one active worker to limit model memory.
- Persistent watch-folder configuration and per-file checkpoints, explicit polling start/stop, stable-file detection and cross-process watch locks. Content-ID source aliases reconnect moved media while retaining transcript revisions.
- CLI doctor and configuration generation/backup/merge for Claude, Cursor, VS Code, LM Studio and generic stdio clients. Codex currently uses its own CLI with the generated command/environment.

## Evidence so far

- Seven Sonoma MP4s indexed; H264 metadata search returned all seven.
- A 95-second thumbnail, 95–97-second MP4, verified source copy and seven-file HTML report were generated. Source hashes stayed unchanged.
- Six preview-file CLIP samples indexed. Text search returned a visually appropriate outdoors frame; reference-image self-match ranked first with cosine 1. This is a smoke test, not search-quality benchmarking.
- Whisper ran on seconds 135–155 of the preview. It returned a short segment. Accuracy has not been verified against audio; no accuracy claim is made.
- Native MCP calls created a disposable bin, linked the preview, added/changed/deleted a marker and loaded the source viewer. Nested marker normalization and field preservation were fixed and retested. The bin reopened with the linked source present.
- Created a separate 1920x1080 30 fps project through Avid UI. All seven Sonoma MP4s linked and survived bin close/reopen. Preview metadata reports V1 A1-2. This is not application/OS restart qualification.
- Five transcript formats, seven-file facets/contact sheet, completed indexing job and queued/running cancellation passed against the local media fixtures.
- Two selects exported to OTIO, with overlap-to-source mapping checked. OpenTimelineIO 0.18.1 read and wrote the file successfully: two clips, 150 frames at 30 fps. Avid OTIO import and audio routing are not qualified.
- CLIP inference was rerun successfully after moving its runtime outside the core package. Core fresh-tarball consumer audit passed; ML runtime installation has its own pins and audit because root package overrides do not apply to consumers.
- Native regression tests cover process identity changes, single-use tokens, marker field preservation, unknown wire fields/enums and accepted writes with failed post-state reads. See the latest check below for the final test/tool count.

### Host limitations discovered

The first CreateSubClip request returned audio because track number 1 selected A1 on this build. A subsequent request with number 0 selected V1; omitting the track list retained V1 A1-2. The native adapter now exposes bounded all-track subclips for 30 fps. A one-second subclip created through MCP persisted after close/reopen with all three tracks. Offline pyavb found usage code 2 and `_START: 2850`, `_END: 2880`; the underlying track lengths remain the full source length. The API's `create_new_sequence` flag still produced a subclip, so this is not qualified sequence creation.

Native source-viewer loading updated the visible clip title, tracks and timecode. Scrubbing changed the timecode, but the captured viewer remained black. Playback/video display is therefore not qualified by these captures; do not infer successful rendering from the load RPC.

Closing the earlier Test project saved `Test Bin.avb` and changed its hash from the previous smoke-test baseline. Offline pyavb inspection still found zero bin items and zero mobs. Byte-for-byte preservation of that bin no longer holds after the project-close operation. Source MP4 files were not edited.

Local evidence lives under ignored `.avid-mcp-analysis`; source media and third-party model weights are not part of the package.

### Latest complete check

`npm run check` passed on 2026-09-05: 151 TypeScript tests, five Python tests, stdio and HTTP smoke tests with 68 tools, package dry run and fresh-tarball consumer installation/audit. `git diff --check` passed. The 68 tools include the pre-existing read-only/bridge tools; this count is not 68 newly qualified native editor operations.

## Remaining delivery work

- Finish native mutation/persistence/restart/recovery qualification, state invalidation and tests. Validate native sequence/subclip creation, additional metadata/bin operations and export methods before exposing them.
- Extend progressive-project qualification to playback/render, application restart, original Premiere source media and successful Avid timeline interchange.
- Complete live project/timeline range search and AAF/Avid OTIO round trips. Local collection ranges are implemented but are not live editor ranges.
- Add grounded generated hierarchical summaries, deeper watch/cache qualification and resumable analysis jobs.
- Benchmark face grouping accuracy/resources, qualify failure recovery, and expand local model management/languages.
- Add separately enabled Windows UI actions, focus/shortcut diagnostics and real-host checks; do not map unimplemented catalog actions to success.
- Finish installers, update/rollback/uninstall, bundled/managed dependencies and actual named-client clean-machine tests. Complete model license notices/release review.
- Add original workflow skills, optional Jumper provider integration, and remaining enterprise adapter improvements.
- Mac implementation and host qualification remain deferred until work is on a Mac, as requested by the user.

The baseline was committed/pushed as `0d382aa`. No release, npm publication, deployment or PR has been created for these changes yet. Existing production version remains 1.1.0; new work is unreleased.

People collections now implement local YuNet/SFace detection, complete-link similarity grouping, pagination, user names, merge/move/recluster and revision-checked deletion. `scripts/research/qualify-people.mjs` passed against the Sonoma preview: three faces from 12 frames, five correction operations and full index deletion, source SHA unchanged. Recognition accuracy and broad runtime/platform support remain unqualified.

Transcript review supports paginated revision discovery, immutable corrections with parent ancestry, text/timing/manual speaker edits, and checksum-checked single-revision deletion. `scripts/research/qualify-transcripts.mjs` passed against the real Sonoma library over stdio, including search and SRT verification; synthetic review text was used.
