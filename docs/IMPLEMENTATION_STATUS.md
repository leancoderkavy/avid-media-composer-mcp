# Open-source implementation status

Updated 2026-09-05. The full plan remains incomplete. Development is on `codex/open-source-full-plan` in [draft PR #55](https://github.com/leancoderkavy/avid-media-composer-mcp/pull/55). These changes are unreleased; the development checkout must not be confused with the published 1.1.0 package.

The [completion ledger](COMPLETION_LEDGER.md) preserves every original requirement and chronological evidence. This page summarizes the current state; older checkpoints in the ledger are historical, not the latest capability inventory.

## Native Avid workflows

The independent Windows adapter extracts protocol descriptors locally from the checksum-qualified Media Composer 2024.12 binary. It distributes neither private SDK binaries nor extracted descriptor payloads. Native calls verify the loopback listener owner. Preview/apply uses expiring single-use tokens, scoped project/bin/source state and a per-user lock.

Implemented actions include bin creation/open/close, media linking, marker changes, source-viewer loading, bounded all-track 30 fps subclips, [source-master AAF export](NATIVE_AAF_EXPORT.md), [AAF selects import](NATIVE_AAF_IMPORT.md) and [H.264 1080p30 export](NATIVE_EXPORT.md). Reference AAF export verifies master/slot/source structure and hashes; real MCP consumed its output with the selects builder. Import inspection validates direct composition/source ranges and hashes permitted media. Import checks empty destinations and native composition metadata; MP4 export checks its declared technical contract, stable output, complete decoding and hashes. Optional color and stream-start expectations are explicit metadata checks.

Actual Sonoma evidence includes seven linked MP4s, marker/subclip persistence, source-preserving AAF authoring, native import, save/reopen, saved video/stereo source ranges and 120-frame export. Retained import/export lock recovery has actual running-host refusal and stopped-host release evidence using isolated lock fixtures. A normal full Avid restart, continuation of the existing trial and reopening of the Sonoma project succeeded, followed by actual MCP reads and saved-timeline checks.

The prepared source-clock PCM fixture renders stereo samples exactly matching the original source-clock cuts. Native video timing matches the expected source presentation times, but a range-tag/pixel interpretation discrepancy remains. A separate research copy with corrected range declarations improves full-resolution comparisons without re-encoding; it is not a general automatic native color fix. See [render qualification](NATIVE_RENDER_QUALIFICATION.md).

The [chained AAF workflow test](AAF_WORKFLOW_QUALIFICATION.md) exposed a stereo regression with separate audio destination tracks. [Explicit stereo authoring](AAF_STEREO_AUTHORING.md) now writes the observed stereo track/combiner structure. A fresh MCP build/import/save/reopen/render from the newer reference preserved all channel ranges and matched the complete source-clock stereo PCM exactly. This fixes the reproduced prepared-PCM fixture; the earlier failed separate-track renders remain regression evidence. Broader media, rates and host builds still require qualification.

Native receipts do not establish atomic undo, preset-content identity, complete unsaved graphs, arbitrary concurrent-editor exclusion or source fidelity. General relink/trim/effect operations, broader media/rates/builds, per-action restart/undo coverage and perceptual playback remain open. The sanctioned Extension bridge and optional private-SDK work are separate from this native adapter.

## Local analysis and editorial workflows

| Area | Implemented and exercised | Remaining acceptance |
| --- | --- | --- |
| Media library and watches | Content hashes, metadata/facets, moved-source aliases, persistent watches, stable-file polling, job journals, bounded workers and cancellation | Broader concurrency/resource/failure coverage; offline/relinked paths |
| Visual search | Pinned local CLIP text/image/frame similarity, temporal scopes, pagination, shot detection and shot-midpoint indexing | Broader independent ranking and shot-accuracy benchmarks; memory/long-media coverage |
| Transcripts | Local English/multilingual Whisper, automatic language candidate selection, source-clock extraction, checkpoint/resume, immutable review revisions, search/ranges and five export formats | Broad speech/language accuracy, mixed-language and non-speech behavior, larger model choices |
| Speakers | Local diarization, anonymous clusters, interval corrections, transcript overlap/assignment provenance, cancellation/resume and guarded cleanup/recovery | Accurate speaker references, word alignment, broad audio coverage and native dependency/license acceptance |
| Summaries | Transcript-linked generated hierarchies, node/source drill-down, visual captions and visual summary workflows | Factual support, consequential omissions/repetition, long-input/language quality and remaining computation recovery |
| People | Local YuNet/SFace indexing, reference crops, groups, names/merge/move/recluster, deletion and checkpoint/resume | Independent recognition quality, dense sampling, sustained memory/resource and broader-media acceptance |
| Editorial interchange | Collections, source-to-stringout mapping, OTIO export/round trip, AAF template/selects inspection and authoring, native AAF import | Multiple-source/rate host qualification, general timeline editing/relink/undo and Avid OTIO import |
| Saved project evidence | Semantic snapshots/diffs, source usage, bounded track/range queries, subclips, timecode and observed stereo channel combiners | Live/unsaved graph access, deeper nested/effect/retime mapping, complexity and turnover reports |
| QC and outputs | Contact sheets, thumbnails, copies, bounded trims, stream-selectable black/freeze/silence/loudness/timestamp checks and color metadata in JSON/HTML reports | Broad discontinuity/HDR/media coverage, perceptual sync, delivery certification and richer camera reports |

All model-generated identities, transcripts, captions and summaries need review. Passing a model invocation or preserving resumed machine output does not demonstrate accuracy. The Sonoma development visual-search set achieved 14/16 top-one matches and 16/16 within three, but absent-scene probes also return ranked results. Summary and speech probes retain documented omissions and recognition errors. See [visual ranking](VISUAL_SEARCH_BENCHMARK.md), [summary quality](SUMMARY_QUALITY_QUALIFICATION.md), [diarization](DIARIZATION_RESEARCH.md) and [model runtime qualification](MODEL_RUNTIME_QUALIFICATION.md).

## Local installation and distribution

The CLI generates, installs, updates, restores and removes entries for Claude, Cursor, VS Code, LM Studio and generic stdio JSON configurations. Managed package installation/status/removal uses isolated directories, checksums/tree receipts, fresh-server checks and preserved configuration backups. Tests cover the published package's older server-only layout and switching back from the development artifact. Optional model runtimes have separate download, pinning, offline-inference and lifecycle evidence.

[Five original workflow skills](WORKFLOW_SKILLS.md) are packaged. Actual generated commands, stdio/HTTP transports and fresh tarball installation have passed. Named-client application onboarding, clean-machine/system dependency lifecycle, complete optional-runtime/model license review and release artifacts remain open. Client JSON compatibility is not proof of a workflow inside each named application.

The optional licensed Jumper provider, additional enterprise adapters and separately shipped Windows UI actions remain unfinished. Mac implementation and real-host qualification are explicitly deferred to work on a Mac. These requirements remain in the completion ledger rather than being removed from scope.

## Latest complete local check

The latest `npm run check` passed with 331 TypeScript tests, 22 Python tests, 125 tools, stdio/HTTP checks, dry packing and fresh-tarball installation. Log: `.avid-mcp-analysis/check-aaf-modifiers.log`. Tool count includes existing offline/bridge tools; it does not represent 125 native Avid operations. CI, local package checks, real Windows/Avid evidence, model/media quality and release proof remain distinct.

The next acceptance work includes remaining native editing/undo and full fidelity; broader model accuracy/resource/recovery work; named-client onboarding and dependency lifecycle; licensing/security/release review; and the optional-provider/enterprise scope. No merge, release or publication is claimed for this development branch.
