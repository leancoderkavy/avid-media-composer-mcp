# Unreleased local setup

This checkout contains new Windows native and local analysis tools. They have not been published as a new npm release. The public 1.1.0 package does not yet contain this work. Our original implementation remains MIT and does not require Jumper.

## Build

Use Node.js 20 or newer. Run `npm ci` and `npm run build`. Install FFmpeg/ffprobe for media work; Python is optional for AVB/AAF analysis and is not needed by the native adapter.

```powershell
$env:AVID_MCP_ALLOWED_ROOTS = 'D:\Avid Projects;D:\Media'
$env:AVID_MCP_OUTPUT_ROOT = 'D:\MCP Outputs'
$env:AVID_MCP_NATIVE_BINARY = 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
$env:AVID_MCP_CAPABILITIES = 'inspect'
node dist/cli.js --doctor
node dist/index.js
```

Create the output directory first. Configure executable paths using `AVID_MCP_FFMPEG`, `AVID_MCP_FFPROBE` and `AVID_MCP_PYTHON` if needed. Native support is restricted to the qualified Windows 2024.12.58720 executable hash; other builds fail closed.

## Client configuration

```powershell
node dist/cli.js --client claude --root 'D:\Avid Projects' --root 'D:\Media' --output 'D:\MCP Outputs' --native 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
```

Formats: `claude`, `cursor`, `vscode`, `lmstudio`, `generic`. The command prints configuration by default. Add `--config ABSOLUTE_JSON_FILE --install` to back up and merge it. Existing Avid entries are never replaced; malformed JSON/JSONC is rejected. Keep the checkout at a stable path and restart the client. For Codex, use `codex mcp add` with the generated command/environment. Named-client UI and clean-machine qualification remain pending.

Native edits use `avid_native_preview` then the exact token with `avid_native_apply`. Enable `edit`, or `project-write` for bin creation. Tokens are single-use and check current project/target evidence. An abandoned `.avid-mcp/native-write.lock` under the user's home requires inspection before manual removal. No automatic retry or atomic undo is promised. Application completion, post-state readback and persistence are distinct evidence.

`create_subclip` takes source-relative `startFrame` and exclusive `endFrame`, retains all source tracks, and currently requires a 30 fps source/project. It creates an Avid subclip, not a sequence. The returned created MOB and metadata should be inspected before further operations.

## Optional local models

```powershell
node dist/cli.js --download-models --model-dir 'D:\MCP Models'
node dist/cli.js --download-models --speech --model-dir 'D:\MCP Models'
$env:AVID_MCP_MODEL_DIR = 'D:\MCP Models'
```

These explicit commands install and audit a separate optional runtime, then download fixed model revisions. npm must be available alongside Node. Model inference loads cached files only; footage is not uploaded. The optional runtime uses Transformers.js 4.2.0 with sharp 0.35.4 and adm-zip 0.6.0 in its own installation root, where override pins apply.

- CLIP: `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`.
- Whisper English: `onnx-community/whisper-tiny.en`, revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.

Libraries and weights retain their own licenses; downloaded models are not relicensed as our code or bundled in the MCP package. References: [Transformers.js](https://github.com/huggingface/transformers.js), [CLIP weights](https://huggingface.co/Xenova/clip-vit-base-patch32), [OpenAI CLIP](https://github.com/openai/CLIP), [Whisper weights](https://huggingface.co/onnx-community/whisper-tiny.en), [OpenAI Whisper](https://github.com/openai/whisper). Final model license/provenance review remains a release item.

## Media workflow

1. `avid_index_media` produces content IDs. Use metadata/facets and substring search within a selected scope.
2. Enable `export` for artifacts, reports, contact sheets and visual-frame caching. Outputs use unique names and source integrity checks.
3. `avid_index_visual` creates a sampled-frame index. `avid_search_visual` supports text and reference images; scores are similarity, not probability. It does not detect every shot.
4. Enable `project-write` and `export` for local transcription. Use the returned revision for search, range reads, extractive outlines or TXT/JSON/CSV/SRT/VTT export. Machine transcription requires review; similarity-based face collections are available separately; diarization is not implemented.
5. Longer operations can run through the analysis-job tools. There is one worker per queue, a bounded queue and explicit cancellation. Partial artifacts remain for inspection; jobs are session-owned and do not resume automatically after restart.
6. Save selected ranges with `avid_save_collection`, then read them or query their stringout positions with `avid_collection_range`. `avid_export_collection_otio` produces a single-video-track OTIO file with local references and source identity metadata. It does not import into Avid or create audio tracks. OpenTimelineIO round-trip validation is separate from Avid import verification.
7. `avid_configure_watch_folder` stores a scoped folder and traversal limits. Run `avid_scan_watch_folder` twice for initial stability checks, or explicitly start `avid_watch_service`. Checkpoints survive sessions; the polling service does not restart automatically. `stop` allows the current file to finish. Cross-process lock conflicts are reported without stealing locks. Removal deletes the watch configuration only.

Index a moved file at its new allowed location to reconnect the same content ID. Source aliases in the shared output cache preserve transcript and collection references. Export still verifies the source hash. The same cache can be used by multiple local sessions; each session retains its own source-root restrictions.

For saved editorial structure, use `avid_snapshot_saved_bins`, then `avid_saved_timeline_range`, `avid_saved_source_usage` and `avid_diff_saved_snapshots`. Ranges use half-open edit units at the returned mob rate. Track ordinals are distinct from Avid's displayed track numbers. Subclip `_START`/`_END` bounds are applied before range mapping. Save the bin first; these tools cannot see unsaved editor changes. Unknown effects/retimes or mixed-rate paths make coverage explicitly incomplete.

Metadata, transcripts and images returned to a cloud-backed AI client may reach its model provider. Local processing alone does not make that client offline. Telemetry stays off unless a PostHog key is configured.

See [implementation status](IMPLEMENTATION_STATUS.md) for the substantial remaining plan. This is not full Jumper parity or a finished installer.


## Optional local people collections

Run `avid-mcp --download-models --faces --model-dir PATH`, then set `AVID_MCP_MODEL_DIR` to that path. This explicitly downloads an isolated Python runtime (OpenCV headless 4.12.0.88 and NumPy 2.2.6), YuNet detection and SFace embedding weights. Normal inference makes no network requests. Python must already be installed; model downloads require internet access.

Weights come from [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models), pinned at `47534e27c9851bb1128ccc0102f1145e27f23f98`. YuNet 2023mar is MIT; SFace 2021dec is Apache-2.0. Their license files are downloaded alongside the weights. Exact sizes and SHA-256 hashes are checked during installation and loading; weights are not bundled or relicensed under this project's MIT license.

With `project-write` and `export` enabled, use `avid_index_people` (or a people job) on up to 20 indexed media files, with up to 24 samples each. `avid_people_clusters` and `avid_people_faces` provide paginated groups and crops. These are visual similarity groups, not verified identities. Names are supplied by the user. Sparse sampling can miss people and recognition accuracy has not been benchmarked.

`avid_edit_people` supports naming, merging, moving, removing a face and reclustering with an expected revision. Reclustering resets names. Removing a face deletes its crop and embedding; sampled source frames remain. `avid_delete_people_index` deletes all generated frames, crops and embeddings in that index after validating its contents. Source MP4s remain untouched. Unexpected files or stale revisions stop deletion. Failed jobs may leave a partial directory for inspection; automatic interrupted-job cleanup remains unfinished.


## Transcript review and deletion

`avid_transcript_revisions` discovers revisions and SHA-256 checksums with pagination. `avid_correct_transcript` accepts the selected revision and checksum, then replaces/removes segments by their original indices or adds segments. Corrections can change text, time ranges and user-supplied speaker labels. The resulting immutable revision records its parent; the original remains available. Duplicate edits to one index and times outside the media duration are rejected. Select the new revision explicitly for search, export and range queries.

`avid_delete_transcript_revision` deletes exactly one selected revision after checksum checking. It does not delete other revisions, exported subtitles/documents, derived artifacts or source media. Deletion and correction share a per-media lock; stale locks are not automatically stolen. These operations require `project-write`. Speaker labels are manual annotations, not automatic diarization.


## Scoped visual and reference-frame search

`avid_index_visual` accepts an optional `range: {start, end}` in source seconds and 1–120 uniform samples per file, with 1200 samples total per index. The whole requested range must fit every selected media file. Visual analysis jobs accept the same range and limits. This samples frames; it does not perform shot-boundary detection or guarantee continuous coverage.

`avid_visual_samples` browses sample timestamps and cached images with pagination, without loading the ML model. `avid_search_visual` accepts an optional `scope` containing media IDs and a half-open source-time range. `avid_search_visual_frame` extracts a reference thumbnail at an indexed source's timestamp and searches by its CLIP embedding; it requires `export`. Similarity scores are not probabilities. A reference self-match is a consistency check, not evidence of broad semantic ranking accuracy.


## Media QC

`avid_media_qc` (or a `qc` analysis job) decodes a selected range of up to 600 seconds and writes JSON/HTML findings in the library output directory. It requires `export` and uses the first video and audio streams. All thresholds are included in the report: black pixel/picture ratio and minimum duration, freeze noise/duration, and silence dB/duration. Source hashes are checked before and after processing.

The measurements use FFmpeg's [blackdetect](https://ffmpeg.org/ffmpeg-filters.html#blackdetect), [freezedetect](https://ffmpeg.org/ffmpeg-filters.html#freezedetect), [silencedetect](https://ffmpeg.org/ffmpeg-filters.html#silencedetect), [vfrdet](https://ffmpeg.org/ffmpeg-filters.html#vfrdet), and input statistics from [loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm). The normalized filter output is discarded; no replacement audio or media is written. Silence can have nonfinite loudness, represented as null with the raw `-inf` value retained.

Events use source-second ranges. An unfinished freeze is marked as open at the analyzed range end. Black endings have decoded-frame precision. Timestamp variation may reflect time-base rounding and is not a diagnosis of dropped frames. Container stream-start offsets do not establish perceptual synchronization. Intentional black/static/silent scenes require editorial review. The report does not certify any broadcast/delivery specification. Multistream, HDR, nonzero stream-offset and perceptual sync qualification remain open.


## Client configuration update, rollback and removal

Use `avid-mcp --config-status --config FILE` to obtain the current SHA-256 without printing configuration values. Then choose one operation:

```text
avid-mcp --client claude --config FILE --expected-sha256 HASH --update --root ABSOLUTE_PATH --output OUTPUT_PATH
avid-mcp --client claude --config FILE --expected-sha256 HASH --remove
avid-mcp --client claude --config FILE --expected-sha256 HASH --restore BACKUP_FILE
```

Use `vscode` for the `servers` configuration shape; Claude, Cursor, LM Studio and generic JSON use `mcpServers`. JSONC/comments are not supported. Update replaces the Avid entry with configuration generated by the currently running package, using the supplied roots/output/native options and default `inspect` capability. Review custom environment settings and additional capabilities before restarting the client. Update does not install a new npm package version.

Restore accepts only a backup created for the exact target file and restores its Avid entry into the current document. It preserves later edits to unrelated server entries and other settings. Remove deletes only the Avid client entry; source media, models, reports, backups and the installed npm package remain. Package/dependency version installation, rollback and uninstall are separate unfinished lifecycle work.

Changes use a cooperating-process lock, bounded JSON reads, an exact-byte backup, and a temporary-file replacement. Existing checksums are rechecked before replacement. Close the client while editing its configuration: a client that ignores our lock can still write concurrently. Backups may contain other entries' credentials and belong in the same protected local configuration directory. Lifecycle status/results return paths and hashes, not backup contents. Restart the client after a successful change.
