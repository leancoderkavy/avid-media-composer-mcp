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

The doctor reports FFmpeg, ffprobe, Python packages and native connectivity separately. Each dependency's `ok` reflects availability; FFmpeg and ffprobe must identify themselves as the configured tool. A successful version probe does not verify codecs, rendering quality or editor operations.

## Client configuration

```powershell
node dist/cli.js --client claude --root 'D:\Avid Projects' --root 'D:\Media' --output 'D:\MCP Outputs' --native 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
```

Formats: `claude`, `cursor`, `vscode`, `lmstudio`, `generic`. The command prints configuration by default. Add `--config ABSOLUTE_JSON_FILE --install` to back up and merge it. Existing Avid entries are never replaced; malformed JSON/JSONC is rejected. Keep the checkout at a stable path and restart the client. For Codex, use `codex mcp add` with the generated command/environment. Named-client UI and clean-machine qualification remain pending.

### Claude Code CLI qualification

Windows Claude Code 2.1.260 has passed configuration and connection qualification against this checkout's built server. The harness uses a new synthetic project and an isolated `CLAUDE_CONFIG_DIR`, adds the generated stdio entry using `mcp add-json --scope local`, requires connected status from both `mcp get` and `mcp list`, removes the entry and verifies the explicit missing-server response. Existing Claude Code and Desktop configuration hashes remained unchanged.

After building, run `node scripts/research/qualify-claude-cli.mjs ABSOLUTE_PATH_TO_INSTALLED_CLAUDE_EXE`. It retains evidence or failure output under `.avid-mcp-analysis/claude-cli-*`. It requires an existing Windows Claude Code executable and does not install or authenticate Claude. Verified evidence: `claude-cli-04ab760f-19ce-4d46-9ad9-b2891cb421a9/evidence.json`.

To qualify another installation, append its absolute `dist/index.js` path and expected SHA-256. The harness checks that checksum before configuring Claude and verifies both client executable and server entry hashes after the run. It also installs a deliberately missing server path, requires Claude to report a connection failure, then replaces that configuration with the valid entry and requires reconnection and final removal. A fresh retained tarball installation passed this sequence: `claude-cli-693ede97-5c9f-4c83-829c-059caa9dc262/evidence.json`; archive/installation hashes and dependency audit are under `claude-installed-c040314a-721f-425f-937b-ec0bd7018508`.

This proves the named CLI's configuration lifecycle and live MCP connection. Desktop UI invocation, model-selected tools, native Avid reads through Claude, other clients and clean-machine installation remain separate acceptance work. Claude Code's local-scope configuration is different from Claude Desktop's JSON file; the generic stdio entry is passed to Claude Code's own configuration command. See the official [MCP configuration guide](https://code.claude.com/docs/en/mcp) and [configuration-directory environment variable](https://code.claude.com/docs/en/env-vars).

Native edits use `avid_native_preview` then the exact token with `avid_native_apply`. Enable `edit`, or `project-write` for bin creation. Tokens are single-use and check current project/target evidence. An abandoned `.avid-mcp/native-write.lock` under the user's home requires inspection before manual removal. No automatic retry or atomic undo is promised. Application completion, post-state readback and persistence are distinct evidence.

`create_subclip` takes source-relative `startFrame` and exclusive `endFrame`, retains all source tracks, and currently requires a 30 fps source/project. It creates an Avid subclip, not a sequence. The returned created MOB and metadata should be inspected before further operations.

## Optional local models

```powershell
node dist/cli.js --download-models --model-dir 'D:\MCP Models'
node dist/cli.js --download-models --speech --model-dir 'D:\MCP Models'
node dist/cli.js --download-models --speech --speech-model tiny --model-dir 'D:\MCP Models'
$env:AVID_MCP_MODEL_DIR = 'D:\MCP Models'
```

These explicit commands install and audit a separate optional runtime when needed, or verify and reuse its receipt, then download fixed model revisions. npm must be available alongside Node. Model inference loads cached files only; footage is not uploaded. The optional runtime uses Transformers.js 4.2.0 with sharp 0.35.4 and adm-zip 0.6.0 in its own installation root, where override pins apply.

- CLIP: `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`.
- Whisper English: `onnx-community/whisper-tiny.en`, revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.
- Whisper multilingual: `onnx-community/whisper-tiny`, revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`. The [model card](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7) points to OpenAI Whisper; accepted language codes follow its pinned [generation configuration](https://huggingface.co/onnx-community/whisper-tiny/blob/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/generation_config.json).

`avid_transcribe_media` and `speech` analysis jobs accept `options: {"model":"tiny","language":"fr"}` (for example, French). The default remains `tiny.en`; it rejects non-English language hints. `tiny` accepts explicit language codes or `auto`. New multilingual auto runs rank language tokens from the first 30 seconds (or shorter available audio), pass the leading candidate explicitly to transcription, and report the candidates and `languageSelection: "model_candidate"`. Scores are not calibrated confidence; mixed languages, music and noise can mislead selection. Exact digital silence in that window returns `SPEECH_LANGUAGE_UNDETERMINED`; choose a speech-containing range or a known language. Earlier recipe-one runs retain their original English fallback when resumed. The task is transcription, not translation. Responses include the pinned model revision, requested language and source-relative segment times. Calls in one direct speech service are serialized; queued jobs retain their existing single-worker bound.

Qualification: both direct explicit-English and queued English-fallback calls ran the multilingual model on the Sonoma MP4 [60,80), preserving its source hash. This establishes cached-model execution and option propagation, not automatic language detection, recognition accuracy in French or any other language, nor diarization. Use `scripts/research/qualify-multilingual-speech.mjs` after the explicit download. Machine transcripts require review.

A separate local Mandarin fixture generated with Microsoft Huihui Desktop measured 13 edits across 41 reference characters (31.7% raw character error rate) with multilingual tiny. The comparison applies NFKC and removes punctuation/whitespace; it does not equate numeral forms or simplified/traditional characters. Inspection of the exact hypothesis shows traditional-character forms and `9` for the reference's Chinese numeral; the raw score must not be read as 13 spoken-content recognition errors. Exact reference, hypothesis and transcript are retained by `scripts/research/qualify-mandarin-speech.mjs`. This is one synthetic fixture, not a general language benchmark or an accuracy acceptance gate.

Libraries and weights retain their own licenses; downloaded models are not relicensed as our code or bundled in the MCP package. References: [Transformers.js](https://github.com/huggingface/transformers.js), [CLIP weights](https://huggingface.co/Xenova/clip-vit-base-patch32), [OpenAI CLIP](https://github.com/openai/CLIP), [Whisper weights](https://huggingface.co/onnx-community/whisper-tiny.en), [OpenAI Whisper](https://github.com/openai/whisper). Final model license/provenance review remains a release item.

## Media workflow

1. `avid_index_media` produces content IDs. Use metadata/facets and substring search within a selected scope.
2. Enable `export` for artifacts, reports, contact sheets and visual-frame caching. Outputs use unique names and source integrity checks.
3. `avid_index_visual` creates a sampled-frame index. `avid_search_visual` supports text and reference images; scores are similarity, not probability. It does not detect every shot.
4. Enable `project-write` and `export` for local transcription. Use the returned revision for search, range reads, extractive outlines or TXT/JSON/CSV/SRT/VTT export. Machine transcription requires review; similarity-based face collections are available separately; diarization is not implemented.
5. Longer operations can run through the analysis-job tools. There is one worker per queue, a bounded queue and explicit cancellation. Partial artifacts remain for inspection; jobs are session-owned and do not resume automatically after restart.

Visual indexing now checkpoints each completed thumbnail/embedding. `avid_visual_index_runs` discovers runs; `avid_visual_index_run` reads the planned and completed counts without loading a model. A `partial` run may still have an active worker. Cancel that job and wait for its terminal status when you want it stopped.

Call `avid_resume_visual_index` with a partial run ID, or queue `{ "kind": "visual_resume", "runId": "..." }`. Resume validates the pinned model/revision, current source hashes, sample plan and cached thumbnail hashes, then copies the committed contiguous prefix into a new run and computes the remaining samples. The result reports `reusedSamples` and `parentRunId`. The original run is preserved; resume never modifies a prior run or automatically restarts jobs. Missing temporary/uncommitted samples are recomputed; corrupt committed samples are rejected. Uniform and shot-midpoint indexes use these checkpoints after their plan is created. Summaries have separate node checkpoints described below. Shot detection itself, transcription and people computation do not yet resume from internal checkpoints. Retention/cleanup and broader concurrent/resource qualification remain open.

Checkpoint publication requires same-directory hard-link support (for example, local NTFS/APFS). It fails if a committed sample already exists; there is no overwrite fallback. Completion is published atomically, and completed status validates that the final index exists and matches every committed sample. These checks cover process interruption and consistency; they are not a power-loss durability guarantee.

Run discovery skips runs whose sources are disconnected or outside the current allowed roots, filling pages from accessible runs. Direct status/resume still rejects those sources. Reindex a moved source at its permitted new location to reconnect its content ID; existing visual runs can then be discovered without recomputing embeddings. Corrupt accessible manifests/checkpoints still fail instead of being silently hidden. Generated-MP4 qualification covers narrowed roots, direct refusal, disappearance after a move and restoration with the same index ID: `scripts/research/qualify-visual-cache-scope.mjs`.
6. Save selected ranges with `avid_save_collection`, then read them or query their stringout positions with `avid_collection_range`. `avid_export_collection_otio` produces a single-video-track OTIO file with local references and source identity metadata. It does not import into Avid or create audio tracks. OpenTimelineIO round-trip validation is separate from Avid import verification.
7. `avid_configure_watch_folder` stores a scoped folder and traversal limits. Run `avid_scan_watch_folder` twice for initial stability checks, or explicitly start `avid_watch_service`. Checkpoints survive sessions; the polling service does not restart automatically. `stop` allows the current file to finish. Cross-process lock conflicts are reported without stealing locks. Removal deletes the watch configuration only.

Index a moved file at its new allowed location to reconnect the same content ID. Source aliases in the shared output cache preserve transcript and collection references. Export still verifies the source hash. The same cache can be used by multiple local sessions; each session retains its own source-root restrictions.

For saved editorial structure, use `avid_snapshot_saved_bins`, then `avid_saved_timeline_range`, `avid_saved_source_usage` and `avid_diff_saved_snapshots`. Ranges use half-open edit units at the returned mob rate. Track ordinals are distinct from Avid's displayed track numbers. Subclip `_START`/`_END` bounds are applied before range mapping. Save the bin first; these tools cannot see unsaved editor changes. Unknown effects/retimes or mixed-rate paths make coverage explicitly incomplete.

Metadata, transcripts and images returned to a cloud-backed AI client may reach its model provider. Local processing alone does not make that client offline. Telemetry stays off unless a PostHog key is configured.

See [implementation status](IMPLEMENTATION_STATUS.md) for the substantial remaining plan. This is not full Jumper parity or a finished installer.


## Optional local people collections

Run `avid-mcp --download-models --faces --model-dir PATH`, then set `AVID_MCP_MODEL_DIR` to that path. This explicitly downloads an isolated Python runtime (OpenCV headless 4.12.0.88 and NumPy 2.2.6), YuNet detection and SFace embedding weights. Normal inference makes no network requests. Python must already be installed; model downloads require internet access.

Weights come from [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models), pinned at `47534e27c9851bb1128ccc0102f1145e27f23f98`. YuNet 2023mar is MIT; SFace 2021dec is Apache-2.0. Their license files are downloaded alongside the weights. Exact sizes and SHA-256 hashes are checked during installation and loading; weights are not bundled or relicensed under this project's MIT license.

With `project-write` and `export` enabled, use `avid_index_people` (or a people job) on up to 20 indexed media files, with up to 120 samples each and 1200 samples total. An optional `range: {"start":60,"end":120}` applies to every selected source; each source must contain that range. Samples use evenly spaced midpoint seek times. `avid_people_clusters` and `avid_people_faces` provide paginated groups and crops. These are visual similarity groups, not verified identities. Names are supplied by the user. Sampling can miss brief appearances and recognition accuracy has not been benchmarked.

New indices retain `coverage` per media ID: range start/end and sample count, including sources where no faces were found. Reads validate each face against a requested sample and authorize all covered media. Legacy indices report null coverage. Requested seek times are not exact decoded-frame timestamps, and multiple samples can map to the same decoded frame. More than 50 detected faces in one frame or 1000 total faces fails explicitly; detections are not silently dropped to fit these limits. Source hashes are rechecked after face inference before the index is published. New dense indexing runs support explicit computation resume as described below.

Real queued MCP qualification sampled Sonoma [60,120) 120 times, returned 38 detections, checked every face against the requested sample plan and preserved the source hash. Script: `scripts/research/qualify-people-range.mjs`. This establishes bounded dense/ranged execution, not exhaustive appearance coverage or identity accuracy.

`avid_find_similar_faces` uses a selected `referenceIndexId` and `referenceFaceId` to rank other saved face appearances. Optional `options` include up to 20 `indexIds` (defaults to the reference index), `mediaIds`, a half-open `range`, `threshold` from -1 to 1 (default 0.45), and `limit` from 1 to 100. Results include index revisions, media IDs, requested sample times, crop paths, cluster IDs and user-supplied names. The selected occurrence is excluded; the same face ID in another index is a separate occurrence. `matchingFaces` and `hasMore` report when the result limit was reached; narrow the scope or increase the limit for more results.

This read-only search requires `inspect`, checks access to every requested index's media, and uses saved features without loading models. Cosine scores rank visual similarity, not verified identity or calibrated confidence. It cannot find unsampled appearances. Real MCP ranking of 37 Sonoma detections matched an independent cosine calculation, with bounded and time-filtered results verified and source unchanged. Script: `scripts/research/qualify-face-search.mjs`.

`avid_edit_people` supports naming, merging, moving, removing a face and reclustering with an expected revision. Reclustering resets names. Removing a face deletes its crop and embedding; sampled source frames remain. `avid_delete_people_index` deletes all generated frames, crops and embeddings in that index after validating its contents. Source MP4s remain untouched. Unexpected files or stale revisions stop deletion. Failed jobs may leave a partial directory for inspection; automatic interrupted-job cleanup remains unfinished.


## Transcript review and deletion

`avid_transcript_revisions` discovers revisions and SHA-256 checksums with pagination. `avid_correct_transcript` accepts the selected revision and checksum, then replaces/removes segments by their original indices or adds segments. Corrections can change text, time ranges and user-supplied speaker labels. The resulting immutable revision records its parent; the original remains available. Duplicate edits to one index and times outside the media duration are rejected. Select the new revision explicitly for search, export and range queries.

`avid_delete_transcript_revision` deletes exactly one selected revision after checksum checking. It does not delete other revisions, exported subtitles/documents, derived artifacts or source media. Deletion and correction share a per-media lock with a unique operation owner; stale locks are not automatically stolen. Ownership is checked before mutation and cleanup, and detected replacement locks are retained. A cleanup error may follow a completed write: inspect the revision list before retrying. This is coordination between cooperating writers, not an atomic transaction against arbitrary filesystem changes. These operations require `project-write`. Speaker labels are manual annotations, not automatic diarization.


## Scoped visual and reference-frame search

`avid_index_visual` accepts an optional `range: {start, end}` in source seconds and 1–120 uniform samples per file, with 1200 samples total per index. The whole requested range must fit every selected media file. Visual analysis jobs accept the same range and limits. This samples frames; it does not perform shot-boundary detection or guarantee continuous coverage.

`avid_visual_samples` browses sample timestamps and cached images with pagination, without loading the ML model. `avid_search_visual` accepts an optional `scope` containing media IDs and a half-open source-time range. `avid_search_visual_frame` extracts a reference thumbnail at an indexed source's timestamp and searches by its CLIP embedding; it requires `export`. Similarity scores are not probabilities. A reference self-match is a consistency check, not evidence of broad semantic ranking accuracy.


## Media QC

Saved JSON reports can be discovered with `avid_qc_reports` and read with `avid_read_qc_report`. Both require inspect authority, an indexed media ID and a current unchanged source within allowed roots. Discovery scans up to 50 report files per page (20 by default); pages may contain no matching reports, so follow `next`. Each read is limited to 4 MiB. Unreadable discovery candidates are counted. Pass the discovered SHA-256 when reading to reject changed report bytes. The returned checksum binds the stored JSON, not an authenticated analysis receipt; reading does not rerun QC or verify the HTML companion.

Stored audio sample counts, equivalent duration, requested range and the amount-match flag must agree. Legacy reports without sample coverage return `audioCoverageStatus: "not_recorded"`; reports that intentionally omit audio return `"audio_not_selected"`. These consistency checks do not authenticate the measurements or fill in missing historical evidence.

Queued QC uses `avid_start_analysis_job` with `kind: "qc"`. Poll `avid_analysis_job_status` for its result. Status reads wait for that job's pending journal writes, including a terminal write queued while an earlier write finishes. A `journalError` means the live result has not been reliably persisted; retain that result and investigate the storage failure. This does not guarantee survival of abrupt process termination before acknowledgement or restart unfinished computation. Completed and failed QC records have been verified in a new server session without a separate history request before disconnecting.

`avid_media_qc` (or a `qc` analysis job) decodes a selected range of up to 600 seconds and writes JSON/HTML findings in the library output directory. It requires `export` and uses the first video and audio streams. All thresholds are included in the report: black pixel/picture ratio and minimum duration, freeze noise/duration, and silence dB/duration. Source hashes are checked before and after processing.

The measurements use FFmpeg's [blackdetect](https://ffmpeg.org/ffmpeg-filters.html#blackdetect), [freezedetect](https://ffmpeg.org/ffmpeg-filters.html#freezedetect), [silencedetect](https://ffmpeg.org/ffmpeg-filters.html#silencedetect), [vfrdet](https://ffmpeg.org/ffmpeg-filters.html#vfrdet), and input statistics from [loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm). The normalized filter output is discarded; no replacement audio or media is written. Silence can have nonfinite loudness, represented as null with the raw `-inf` value retained.

Audio QC also measures samples per channel with [astats](https://ffmpeg.org/ffmpeg-filters.html#astats), at the declared sample rate before loudness normalization. `audioCoverage` reports the measured sample amount, equivalent duration and whether it matches the requested duration within one sample. A short stream can produce a partial amount; that mismatch remains visible for review. An empty range or missing sample measurement fails without writing a success report. Matching sample amounts do not establish continuous timestamps or perceptual synchronization.

The Sonoma preview's [60,90) range yielded 1,443,456 samples per channel at 48 kHz (30.072 seconds); its previously verified source-clock copy yielded 1,440,000 (30 seconds). Separate raw PCM exports matched both QC measurements, and both source checksums remained unchanged. Evidence: `.avid-mcp-analysis/sonoma-qc-amount-cda30236-6e66-48b5-95b8-016efd885e9f/evidence.json`. This is a measured amount comparison for one range, not a general synchronization verdict or an instruction to retime source media.

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


## Generated transcript summaries

Download the optional English model with `avid-mcp --download-models --summaries --model-dir PATH`. [Xenova DistilBART CNN 6-6](https://huggingface.co/Xenova/distilbart-cnn-6-6) and its [upstream model](https://huggingface.co/sshleifer/distilbart-cnn-6-6) identify Apache-2.0 licensing. The ONNX revision is pinned to `6b476295a3cf27d5b20e8c8b847a54ab8e5d0df9`; weights remain in the optional model cache, not the MCP package. Inference uses cached local files.

`avid_generate_summary` or a `summary` analysis job creates a hierarchy from a selected transcript revision. Leaves cover bounded text chunks; parent nodes summarize groups of up to four children. Limits are 64 source chunks of 2000 characters, 1000 input tokens per generation and 80 generated tokens per node. Excess input is rejected rather than silently dropped. `mayBeTruncated` flags generated text without a terminal sentence boundary; this heuristic cannot detect every omission or truncation.

`avid_list_summaries` discovers saved hierarchies; `avid_summary_node` reads the overview or a selected child and returns leaf transcript references. Reads validate the transcript checksum and source indices. These checks establish provenance, not factual entailment. The English news-trained model can omit content, repeat text, fabricate details or end mid-sentence, and is not qualified for visual-only descriptions. Review against the transcript before using generated claims.

Generation and reads also validate a connected single-parent tree: no cycles, duplicate edges or unreachable nodes; each parent range equals its children's range, and leaf ranges match their referenced transcript segments. With transcript provenance available, every nonempty source segment must be referenced by a leaf. This validates reference coverage, not whether the summary text accurately includes every fact. Discovery/deletion without a transcript retains structural validation but cannot check source ranges or coverage.

A three-fixture [quality comparison](SUMMARY_QUALITY_QUALIFICATION.md) found consequential omissions, repetition and an unfinished sentence. Increasing the requested token budget and beams produced identical text in that comparison and was not adopted. Broad factual-quality acceptance remains open.

`avid_delete_summary` removes one checksum-selected summary document while retaining media and transcripts. Discovery/deletion remain available if its transcript was deleted; content reads fail because provenance is unavailable. Generated summaries are derived copies and are not automatically removed when a transcript revision is deleted.

Summary generation checkpoints every completed node, including parent nodes. Use `avid_summary_runs` with the media ID to discover runs and `avid_summary_run` to read persisted counts. These computation-run reads require the original transcript and its unchanged checksum. A partial run may still have an active worker; cancel and await terminal job status if it must stop. `avid_resume_summary`, or a `summary_resume` job, creates a new run and reuses the committed prefix after checking transcript identity/checksum, pinned model revision, generation recipe, node structure and input hashes. It requires `project-write` and locally cached weights. The result reports `reusedNodes` and `parentRunId`; the parent is preserved. Completion validates the final hierarchy against the committed nodes. Same-directory hard-link support is required for exclusive checkpoint publication. Power-loss durability and automatic cleanup are not guaranteed.

Real MCP qualification cancelled generation from synthetic editorial notes attached to Sonoma, reconnected, and resumed one committed node into a nine-node hierarchy with original checkpoint/source unchanged. This is recovery evidence, not summary accuracy: `scripts/research/qualify-summary-resume.mjs`. Deleting a completed summary document or its transcript leaves the separate computation records; status then fails because output/provenance is missing. Use the existing summary discovery/deletion tools for the final documents.

`avid_summary_runs` preserves pagination when a run's transcript or output is unavailable: it returns that run as `state: "unavailable"` with a problem code/message and continues listing other runs for the authorized media. It does not hide the failure or permit reuse. Direct status/resume still rejects invalid provenance. An unreadable manifest that cannot be attributed to a media ID still fails discovery. Real MCP coverage of a deleted older transcript alongside a healthy newer summary is in `scripts/research/qualify-summary-discovery.mjs`.


## Reference-preserving AAF selects

`avid_inspect_aaf_template` accepts a master-only Avid-exported AAF, enumerates masters/slots, and verifies/hashes local file locators against the allowed roots. Both the template and referenced media must be in scope. Network/remote locators, existing compositions and embedded essence are rejected. This inspection requires `export` because it writes a local request manifest.

`avid_build_aaf_selects` accepts the template checksum, a composition name and rational edit rate, destination picture/sound tracks, and ordered selects containing master MOB IDs, source frame start/length and source slot IDs for each destination track. Source rates must match exactly. It preserves the template descriptors and writes a new file exclusively, then reopens it to verify every source reference and cut range. It returns the output hash and media hashes. Limits: 64 MiB template, 100 masters/locators, 16 tracks, 500 selects. Failed builds can leave a partial generated folder for inspection.

The current authoring scope is straight cuts. Effects, retimes, transitions, embedded essence and existing compositions are unsupported. The output is a new AAF; this tool does not import it into Avid or prove playback/render fidelity. One three-track 30 fps Sonoma sequence was separately imported and checked in a saved AVB; see NATIVE_AAF_QUALIFICATION.md. Broader sources/rates and a guarded native import/export adapter remain qualification work.

## Speech computation recovery

Speech transcription checkpoints the generated tokens for each overlapping audio window. `avid_speech_runs` discovers runs for an authorized media ID, and `avid_speech_run` validates persisted progress and the final transcript checksum. Partial status does not establish that a worker stopped: cancel its job and await terminal status before treating it as stopped.

`avid_resume_speech`, or a `speech_resume` analysis job, creates a new run and reuses a verified contiguous prefix. It requires `export`, `project-write` and cached speech weights. Source SHA, extracted audio SHA, exact range/options, pinned model/runtime/recipe and each feature/generation input must match. The parent run is retained. Results report `runId`, `parentRunId`, `reusedWindows` and `completedWindows`. Completed runs cannot be resumed. Transcript deletion or modification invalidates completed status; discovery reports that run as unavailable.

Recovery repeats audio extraction and feature preparation but skips inference for saved windows. Exclusive checkpoint publication requires same-directory hard-link support. There is no automatic replay, checkpoint cleanup or power-loss durability guarantee. Only Transformers.js 4.2.0 is supported by this recipe, and runtime loading rejects another installed version.

Real Windows MCP qualification cancelled a Sonoma [0,180) speech worker, reconnected, reused two saved windows into nine completed windows, and compared every resulting segment against uninterrupted transcription. Parent checkpoints and source SHA were unchanged. Run `scripts/research/qualify-speech-resume.mjs` with cached English speech weights. This is recovery and result-equivalence evidence, not speech accuracy or diarization acceptance.

## Reviewable language detection

`avid_detect_speech_language` accepts an indexed media ID and a source range of at most 30 seconds. It requires `inspect`, `export`, and explicitly downloaded multilingual `tiny` weights. It extracts mono 16 kHz audio locally and ranks the language tokens from one decoder step using the public Whisper language-identification method. It returns the top five `modelProbability` scores, a candidate `language`, analyzed range, pinned model revision and `reviewRequired: true`. Scores are not calibrated confidence or verified language identity.

Exact digital silence returns `status: "digital_silence"`, no candidate and no model inference. This is not voice activity detection: background noise, music, quiet speech and mixed languages can still produce misleading candidates. Choose a range containing clear speech and review the result. No transcript is created and no project-write permission is needed.

New multilingual transcription auto requests use this same language-ranking method internally and persist the decision in recipe-two checkpoints. Resume reuses that decision, including its candidates, instead of running detection again. Explicit language selection and the English-only model bypass detection. Existing recipe-one recovery runs retain their original language behavior.

Qualification: real stdio MCP returned en and zh on original synthetic English and Mandarin speech, and null on digital silence, with unchanged source hashes. This is narrow language-identification evidence, not acceptance across all supported language tokens. Scripts: `qualify-language-detection.mjs` and `qualify-language-detection-mcp.mjs` under `scripts/research`. The unguarded research model selected Welsh for silence, which is why the tool excludes exact digital silence.

Method reference: [OpenAI Whisper language detection](https://github.com/openai/whisper/blob/main/whisper/decoding.py). This implementation is original TypeScript using the pinned local ONNX model; it does not copy a competitor implementation.

## Rediscovering people indices

`avid_people_indices` takes an authorized `mediaId`, optional `after` index UUID and `limit` (1–100, default 20). It returns saved indices in UUID order, their revisions, face/cluster counts and coverage for that media. Use an index ID with the people-cluster, face-list or reference-search tools after reconnecting a client.

New zero-face indices are discoverable through their retained coverage. Legacy indices without coverage can only be attributed through their face records. Partial/deleted directories without a final index are omitted. Invalid indices attributable to the requested media return `state: "unavailable"` and an error while healthy results remain visible. Every available result requires authorization for all media in that index. Malformed manifests that cannot be attributed still fail discovery.

Fresh-session inspect-only MCP qualification discovered the existing Sonoma index and verified its 37 reference-face search results again: `scripts/research/qualify-face-search.mjs`. For interrupted computation, use the separate people-run tools described below.

Visual text queries have a 77-token model-context limit including special tokens, in addition to the 500-character input limit. Oversized descriptions return VISUAL_QUERY_TOO_LONG with tokenCount and maxTokens before text inference. They are not silently truncated. Use concise descriptions or separate searches for distinct concepts. Frozen Sonoma queries retained exactly the same ranks and scores after enforcing this limit; see VISUAL_SEARCH_BENCHMARK.md.

## People job recovery

New people runs checkpoint extracted image hashes and each analyzed frame. Use `avid_people_runs` with a media ID to discover persisted work and `avid_people_run` with an index ID to verify progress. Cancel an active analysis job and await terminal status before treating its run as stopped: partial status alone is not process status.

`avid_resume_people` or a `people_resume` job requires `export`, `project-write` and cached face models. It validates current source hashes, the original sampling plan, model hashes/OpenCV version, image/crop hashes and face data; then copies the verified prefixes into a new index and computes the rest. Results report `parentIndexId`, `reusedExtractions` and `reusedAnalysisFrames`. Parent directories remain unchanged. Legacy indices without run manifests cannot resume.

Completed runs cannot resume. Run status verifies the original final index checksum; later user edits invalidate that original-output verification while normal people-index reads remain available. Removing a face also clears that index's analysis checkpoints to remove derived embedding copies. Other indices, including parents, are separate copies. Sampled source frames remain until whole-index deletion.

Actual Windows MCP cancellation/reconnect tests covered both extraction and analysis, then reused 120 images and 34 analyzed frames to reproduce all 38 Sonoma detections exactly. See PEOPLE_RECOVERY_RESEARCH.md. Checkpoint publication requires same-directory hard links. Automatic replay, checkpoint cleanup, power-loss durability and broad concurrent recovery remain unqualified.

QC stream selection: `avid_media_qc` accepts `options.videoStream` and `options.audioStream` as absolute stream indices from media metadata. Omit a selector to use the first stream of that type; set it to `null` to skip that type. For example, `{end:30,videoStream:1,audioStream:3}` measures those two streams, while `{end:30,videoStream:null,audioStream:3}` measures only audio. Missing or wrong-type indices are rejected. Each report records the selected indices. Run separate calls for additional tracks; a single report does not cover unselected streams. Container offsets remain metadata observations, not perceptual synchronization verification, and HDR delivery qualification remains open.

QC timestamp handling preserves each stream's delay relative to the file timeline. It decodes preceding media and trims at the requested range before measurement, avoiding demuxer seek behavior that can skip early audio when video starts later. This can cost additional decoding time for late ranges in long files; the command timeout still applies. Timestamp correctness on delayed synthetic tracks is not evidence of perceptual audio/video synchronization.

QC reports include `streamDetails` for the selected video/audio streams: codec, dimensions, pixel format, range, matrix, transfer, primaries, declared sample depth, frame/time bases and audio layout/rate. Missing fields remain null. These are probe metadata declarations, not measurements of display brightness, gamut, actual transfer behavior or mastering compliance. The field provenance follows [FFmpeg's stream reporting implementation](https://github.com/FFmpeg/FFmpeg/blob/master/fftools/ffprobe.c). No HDR delivery pass/fail is inferred from these tags.

## Isolated package installation

Install an explicitly chosen local npm tarball into a new directory with:

```powershell
node dist/cli.js --package-install "D:\Downloads\avid-media-composer-mcp.tgz" --package-root "D:\Avid MCP Packages" --package-sha256 "EXPECTED_64_CHARACTER_LOWERCASE_SHA256"
```

Use the checksum from your chosen build/release verification. A checksum identifies the selected bytes; it does not establish publisher trust. The command requires Node with its adjacent npm CLI, copies and rechecks the archive, installs npm dependencies with lifecycle scripts disabled, performs the high-severity dependency audit, and runs the installed server's MCP ping. Dependency installation and audit use npm's configured registry/network settings. A successful installation writes `installation.json` and returns an absolute `setupCommand` for that installation.

Run the returned setup CLI with the existing `--client`, `--config` and `--install`/`--update` options to select that installation in a client configuration. The previous package stays in its own directory; the configuration's checksum-checked `--restore` operation can point back to it. Each package operation creates a UUID directory, even for the same version. Failed operations retain their directory for inspection and never create a success receipt or change client configuration.

The receipt records archive, entry, setup and lockfile hashes plus a complete installed-tree digest and protocol/audit results. The tree digest detects changes; it does not authenticate a publisher. Node, FFmpeg, Python, optional model/runtime installation, cross-version compatibility and actual named-client application qualification remain separate work. In particular, removing an Avid client entry does not delete its package directory.

Managed package status/removal (Windows):

```powershell
node dist/cli.js --package-status "INSTALLATION_UUID" --package-root "D:\Avid MCP Packages"
node dist/cli.js --package-remove "INSTALLATION_UUID" --package-root "D:\Avid MCP Packages" --expected-sha256 "RECEIPT_SHA256_FROM_STATUS"
```

Use a setup CLI outside the installation being removed. Update/remove client entries and stop their servers first. Removal verifies the receipt and complete tree, refuses changed or additional files, checks Windows Node process command lines, then renames the directory before rechecking and deleting it. It never terminates a server. Status does not discover references in arbitrary client configurations, and removing a package leaves those configurations and external media/models alone. Older receipts without a tree digest are unsupported for automatic removal.

A failed removal may retain a `UUID.removing-UUID` directory. If no contents were deleted or changed, recover its original location using `--package-recover UUID.removing-UUID --package-root PATH --expected-sha256 RECEIPT_HASH`. Recovery rechecks the receipt/tree and process state and refuses an existing destination. Partial deletion cannot be automatically restored. This is process-state qualification for Windows Node-based servers, not a guarantee against arbitrary concurrent filesystem writers. Mac removal remains unqualified.

Older published packages may expose only the MCP server, without `avid-mcp`. The installer accepts that layout and returns `usesBootstrapSetup: true` with a `setupCommand` that uses the current CLI plus `--server-entry` and `--server-entry-sha256`. Run that returned command with the ordinary client install/update arguments. The bootstrap validates the selected entry's checksum before producing configuration; retain access to that bootstrap CLI while configuring the older installation. An unexpected declared setup entry point is still rejected.

The actual published 1.1.0 archive was qualified through install, activation, switching to this branch artifact and configuration rollback. It exposed 27 tools; the tested branch exposed 98. Both artifacts currently declare 1.1.0, so archive checksums distinguish them. This is release-to-branch protocol/configuration compatibility, not qualification of all future version combinations or downgrading newer analysis files. Check retained package integrity before rollback; configuration backup checksums alone validate the configuration, not every server/dependency file.

## Frame captions with source-image review

Explicitly install the optional caption model with `avid-mcp --download-models --captions --model-dir PATH`, then set `AVID_MCP_MODEL_DIR` for the server. The pinned Florence-2-base-ft ONNX q4 model and Transformers.js 4.2.0 runtime run locally. The package does not include model weights.

- `avid_caption_frame` takes an indexed media ID and requested seek time, extracts a bounded JPEG, generates a caption and saves model/runtime/task/source/image provenance. It requires export and project-write. For cancellable execution, start an analysis job with `{kind:"caption",id:MEDIA_ID,time:SECONDS}`.
- `avid_read_caption` returns the saved text and verified JPEG as MCP image content. The image and source hashes are checked before review. The timestamp is a requested seek time, not an exact decoded PTS.
- `avid_list_captions` discovers captions by media ID with UUID pagination. Invalid images produce per-caption unavailable results; incomplete outputs without a final caption record are omitted.
- `avid_correct_caption` requires the current caption checksum and replacement text. It preserves the original machine text and model provenance. `edited:true` records a change, not proof of human review or factual accuracy.
- `avid_delete_caption` requires the current checksum and deletes the caption plus its sampled image, refusing unexpected files. It preserves source media.

Generation is capped at 128 new tokens and direct calls serialize within one server instance. `mayBeTruncated` flags output near the token cap for review. Model captions can miss key subjects, invent details and misdescribe actions; see [the recorded candidate comparison](VISUAL_CAPTION_QUALIFICATION.md). Each caption describes one sampled frame. Selected-time batches and computation resume are described below; automatic shot coverage, broad concurrency/failure qualification, managed cleanup and integration into hierarchical visual summaries remain open. Failed generation may retain its image directory; it is not reported as a completed caption.

## Resumable caption batches

Use `avid_caption_batch` with `{id:MEDIA_ID,times:[2,20,40]}` for 1–120 strictly increasing requested seek times within the source duration. For cancellable execution use `avid_start_analysis_job` with `{job:{kind:"caption_batch",id:MEDIA_ID,times:[2,20,40]}}`. Model installation, permissions and image-review requirements match single-frame captions.

Discover saved work with `avid_caption_runs` and verify it with `avid_caption_run`. After the original job reaches a terminal state, use `avid_resume_captions` or a `caption_resume` job with its `runId`. Resume creates a new run, references verified completed captions and generates only the remaining times. A partial manifest alone does not prove worker termination.

The child and parent share references to saved captions. Correcting or deleting one invalidates verification of every run referencing that version; it does not silently rewrite historical checkpoints. Source bytes, caption records and sampled images are rechecked. Repeated source hashing can be expensive on large media. Failed generation may leave incomplete caption directories; automatic cleanup, cross-process editing coordination, broad resource qualification and hierarchical visual summaries remain open.

## Visual summaries from reviewed captions

Use `avid_summarize_captions` with `{id:MEDIA_ID,references:[{captionId:CAPTION_UUID,sha256:CURRENT_CAPTION_CHECKSUM},...]}`. References must identify 1–120 distinct captions for the same media in strictly increasing sample-time order. You can select references from a caption batch or use checksums returned after caption corrections.

Leaves retain each selected caption's text exactly. Parents summarize groups of up to four children using the installed DistilBART model, building a hierarchy up to 161 nodes. Generation requires project-write; groups requiring model inference also require the cached summary model. Use an analysis job with `{kind:"visual_summary",id:MEDIA_ID,references:REFERENCES}` for cancellable execution. It does not require export when using already saved captions.

Read the overview with `avid_visual_summary_node` using `revision`, or select a child with `nodeId`. Reads verify caption checksums, source media and images, and include original descendant caption records/image paths. Use `avid_read_caption` to display a source image. The first/last sample times are points delimiting selected samples; they do not prove coverage or events between those images.

`avid_list_visual_summaries` discovers records with checksums even after caption changes/deletion, with `provenanceVerified:false`. A node read performs provenance verification and rejects changed references. To incorporate a correction, create a new summary using the corrected checksum. `avid_delete_visual_summary` removes only the summary with its current checksum, preserving source media and captions.

Generated overview text remains experimental: the Sonoma test repeated details, omitted later scenes and propagated an unsupported "3D image" description already present in a caption. Caption provenance proves traceability, not factual correctness. Review the original images and leaf text before relying on parent summaries. Parent generation rejects overlong input instead of silently truncating; individual generation is bounded at 80 new tokens. Interrupted visual-summary computation currently requires a fresh job, although saved caption batches remain reusable. Per-node recovery, broader quality/resource/concurrency qualification and cleanup remain open.

## Optional runtime setup and status

Use `avid-mcp --install-model-runtime --model-dir PATH` to prepare the optional JavaScript AI runtime without downloading model weights. `avid-mcp --model-runtime-status --model-dir PATH` checks its manifest and recorded dependency-tree checksum. New installs are staged, audited and import-tested before publication. Reuse leaves dependencies unchanged. Changed or incomplete runtimes require a fresh model directory; setup does not overwrite them.

An older matching runtime can be audited and adopted without reinstalling dependencies. Its receipt does not establish whether its original installation disabled scripts. A setup lock or retained staging directory may remain after interruption; a lock's age is not proof of worker termination. Automatic lock recovery and runtime update/rollback/uninstall remain open.

Cached inference now uses absolute pinned model directories and disables remote model access. This avoids Transformers.js 4.2.0 discovery requests that did not respect the earlier per-call local-only flags. See [runtime qualification and the correction to earlier offline claims](MODEL_RUNTIME_QUALIFICATION.md) for actual fetch-blocked model tests, setup evidence and limitations. Explicit model downloads still require network access.

## Carrying analysis settings into an AI client

Configuration generation, install and update accept `--model-dir`, `--capabilities`, `--ffmpeg`, `--ffprobe` and `--python`. Model/executable paths must be absolute so the resulting configuration does not depend on the client's working directory. Without an explicit capability list, the entry remains inspect-only.

Example using paths appropriate to your installation:

```powershell
node dist/cli.js --client generic --root "D:\Media" --output "D:\MCP Output" --model-dir "D:\MCP Models" --capabilities "inspect,export,project-write" --ffmpeg "C:\Tools\ffmpeg.exe" --ffprobe "C:\Tools\ffprobe.exe" --python "C:\Tools\python.exe"
```

These flags work for Claude, Cursor, VS Code, LM Studio and generic configuration formats. They configure existing dependencies; they do not install executables or weights. `inspect,export,project-write` enables local media analysis/artifact writes, including captions. Native editing and unsafe automation remain separate capability choices.

Update reconstructs the Avid entry from the supplied flags. Repeat any model paths, executables and capabilities you want retained; omitting them returns to defaults. Unrelated entries remain preserved by the existing checksum/backup update flow. Allowed roots containing the platform's path-list separator are rejected because the environment format cannot represent them unambiguously.

Actual generated commands in all five formats indexed/read the Sonoma preview. The generic command generated a barrel caption through its configured model and executable paths. A temporary configuration install/update preserved unrelated entries, and an inspect-only update denied caption generation. Evidence: `.avid-mcp-analysis/setup-runtime-3d505ec5-3923-4634-b866-0bcdc0b65781/evidence.json`. This verifies generated-command execution, not the named client applications' UI.


## Optional diarization runtime

The branch includes a local speaker-analysis worker, explicit setup and persisted MCP speaker analysis. Read-only transcript overlap alignment is available; explicit transcript speaker assignment is available; underlying diarization labels and boundaries can be corrected in new analysis revisions.

```powershell
$env:AVID_MCP_PYTHON = "C:\Python312\python.exe"
node dist/cli.js --download-models --diarization --model-dir "D:\MCP Models"
node dist/cli.js --diarization-runtime-status --model-dir "D:\MCP Models"
```

Setup creates a uniquely named Python environment beneath the chosen cache's `diarization` directory. It installs binary wheels for sherpa-onnx/core 1.13.7 and NumPy 2.2.6 without resolving additional dependencies, runs pip's dependency check, downloads checksum-pinned segmentation/embedding weights, and verifies silent-audio inference. Only the completed installation is selected by its receipt. Environment paths never move, preserving Python launchers. Inference uses local files and does not install dependencies or download weights.

Status checks the selected installation tree and packaged worker checksum. Explicit setup reuses unchanged installations without running Python or pip again. Changed trees, changed workers, invalid receipts and existing setup locks are refused; choose a fresh model cache when necessary. Failed unique installations are retained and remain unselected. Lock age does not establish process termination. Automatic recovery, update/rollback/removal, Python/system dependency management and clean-machine/Mac qualification remain open. A Python virtual environment still depends on its system interpreter installation. Dependency consistency and prior inference checks are not a current vulnerability audit or model accuracy acceptance.

The worker consumes bounded mono 16 kHz float32 PCM (at most 600 seconds), validates model sizes/hashes, and returns at most 5,000 sorted spans with anonymous per-run labels. Automatic clustering or supplied counts of 1–20 and a threshold in (0,1] are supported. Labels do not identify people and can overlap. See [diarization research and provenance](DIARIZATION_RESEARCH.md) for quality limits and license sources. Neither weights nor the Python runtime are bundled in the package.


## Saved speaker analyses

After installing the diarization runtime and configuring `inspect,export,project-write`, use `avid_diarize_audio` with an indexed media ID, source `start`/`end` (up to 600 seconds), and optional `{speakers: -1, threshold: 0.5}`. `-1` requests automatic clustering; a supplied count from 1 to 20 constrains clustering. `avid_start_analysis_job` accepts the same fields under `kind: "diarization"` for cancellable execution.

Completed results retain PCM, model-worker/runtime provenance, source/audio hashes and anonymous speaker spans. `avid_speaker_analysis` reads pages (default 100, maximum 500) using `analysisId` and `offset`. `avid_speaker_analyses` discovers completed results for a media ID. Reads recheck source scope, source content and PCM consistency. Times are in the source media clock; overlapping spans remain overlapping. Anonymous labels apply only within their analysis and do not identify people or establish who spoke individual transcript words.

Speaker discovery keeps healthy results available when another saved record is malformed or has a mismatched analysis ID. Its `discovery` diagnostics count unpublished candidates and unclassified records, with at most 20 sorted unclassified IDs. These diagnostics cover candidate directories in this output library after the supplied cursor; they cannot attribute unreadable records to the requested media. Counts do not establish whether a worker is still running. Discovery preserves all files and does not automatically recover, delete or retry an analysis. Records with valid media attribution but damaged PCM continue to appear as unavailable results.

`avid_delete_speaker_analysis` requires `analysisId` and the current result's `sha256`. It deletes the saved record and extracted PCM after verifying their identity and refuses unexpected files. Source media is preserved. Interrupted execution leaves incomplete artifacts and omits them from completed-result discovery. Runs with a verified audio checkpoint support the new-run recovery described below; older runs or interrupted extraction without a checkpoint require fresh extraction. A cancellation race near publication may leave a completed artifact even if the job reports cancellation; inspect discovery before retrying. Checkpoints inside model inference, incomplete-artifact cleanup and shared-writer deletion recovery remain open.


## Transcript and speaker overlap

`avid_align_speakers` requires `analysisId`, `analysisSha256`, `transcriptRevision` and `transcriptSha256`. Obtain the speaker checksum from `avid_speaker_analysis` and the transcript checksum from `avid_transcript_revisions`. It reads only the selected saved inputs and works with inspect-only access; models and a model directory are not required for alignment.

Results include transcript segments intersecting the analyzed source range, their original revision indices, unchanged text/existing speaker fields, and overlap candidates. Pagination uses `after` (default -1) and `limit` (maximum 100). `candidateLimit` defaults to 20 and supports up to 100 candidates per segment; `totalCandidates` and `candidatesTruncated` explicitly report omitted candidates. Saved speaker pages retain every interval.

`single_candidate` means one anonymous label overlaps the segment. `multiple_candidates` means different labels occur sequentially; `overlapping_candidates` means at least two labels overlap simultaneously. `no_speech_overlap` means no detected span intersects the segment. These are interval classifications, not verified identity or confidence. Coverage unions repeated intervals for the same label, distinguishes uncovered analyzed time from time outside the analysis range, and reports simultaneous-speaker seconds separately. No transcript assignment is applied. Review audio and revise speaker boundaries/labels before applying attribution; word-level forced alignment remains open. Explicit caller-selected assignment is described below.


## Assigning transcript speakers

`avid_assign_transcript_speakers` accepts the same `analysisId`, `analysisSha256`, `transcriptRevision` and `transcriptSha256` references as alignment, plus 1–1,000 explicit assignments. Each assignment contains an original transcript segment `index`, an overlapping anonymous `speaker` label, and an optional caller-supplied `displayName` (up to 100 characters). Without a display name, the anonymous label is written. Duplicate indices and conflicting names for the same anonymous label in one request are rejected.

A segment with multiple interval candidates requires `allowAmbiguous: true` for that assignment. A segment extending outside the analyzed source range requires `allowPartialRange: true`. Neither flag permits selecting a label with no overlap. These flags record explicit choices; they do not establish human review or identity verification. The operation requires project-write, preserves every segment's text/timing, changes only selected speaker fields, and saves a new immutable transcript revision with its parent link and assignment provenance. Source media, speaker analysis and previous transcript are retained. A later correction starts from whichever revision is explicitly selected; there is no automatically overwritten latest transcript.

`avid_transcript_speaker_assignments` reads the persisted provenance using `id`, `revision` and `expectedSha256`. Pages use `offset` and `limit` (default 100, maximum 500), with `nextOffset` and `totalAssignments`. Ordinary revisions without an assignment record return `speakerAssignment: null`. This read works with inspect-only access and requires no models. Generic transcript corrections can still remove or change speaker fields; their parent revision links retain the history. Diarization cluster/boundary corrections are described below. Word-level attribution and broad speaker accuracy remain open.


## Correcting speaker intervals and clusters

`avid_correct_speaker_analysis` takes an `analysisId`, its `expectedSha256`, and 1–1,000 ordered edits. It requires project-write, but no models or export capability. Supported edits:

- `replace`: select an existing `spanId` and provide its complete new source-time `start`, `end` and `speaker` label. Assigning a new label splits that interval from its previous cluster.
- `remove`: remove an existing `spanId`.
- `add`: provide source-time `start`, `end` and `speaker`; the returned span receives an `added-UUID` identity.
- `merge`: supply distinct existing `from` and `into` labels; all current spans with the first label move to the second.

Labels use `speaker-1` through `speaker-9999`; they are anonymous identifiers, not names. Edits execute in order, then spans are sorted by source start/end and ID. Referenced spans/merge labels must exist at that step, intervals must remain inside the analyzed source range, and results may contain at most 5,000 spans. Removing every span is supported. Edits do not run model inference or certify accuracy.

Each correction creates a new analysis ID with its parent ID/checksum, a corrected span snapshot and an independent verified PCM copy. The original machine result remains embedded unchanged. `avid_speaker_analysis` defaults to `view: "effective"`; `view: "machine"` returns the original model spans. Reads report `edited`, the parent reference and `machineSpeakerCount`. Alignment and transcript assignment use the effective view of the explicitly selected analysis. Previous analyses remain unchanged; there is no implicitly updated current analysis.

The child is self-contained and remains readable if its parent is explicitly deleted later. Parent references then identify a historical artifact whose contents may no longer be present. Deletion of a child follows the same checksum/known-file checks as other speaker analyses. Interrupted correction may retain unpublished files; automatic cleanup, publication/deletion interruption recovery and broader concurrency/resource qualification remain open.


## Diarization pip bootstrap revision

Fresh diarization installations now create a venv without Python's bundled pip and bootstrap checksum-pinned pip 26.2.1 from a verified wheel. This fixes the old setup's inherited pip 23.2.1, which has listed advisories. Status reports `bootstrapCurrent` independently of `unchanged`. An older receipt can therefore describe an unchanged tree with an outdated bootstrap. Explicit setup refuses reusing that older bootstrap; use a fresh model directory. Existing files and cached inference are preserved, and automatic migration/rollback remains open. See [dependency audit and evidence](DIARIZATION_DEPENDENCY_AUDIT.md) for the point-in-time advisory scan and remaining native-library/notice review.


The optional sherpa wheels contain more native functionality than the diarization worker uses. The [native audit](DIARIZATION_NATIVE_AUDIT.md) records ONNX Runtime/OpenBLAS versions and evidence of eSpeak/phonemizer code with separately licensed source. Preserve upstream component terms; the wrapper package's Apache metadata is not a complete native notice inventory. Optional-wheel redistribution and cross-platform native qualification remain unfinished.

### Speaker audio recovery

New analyses publish an `audio.json` checkpoint only after successful source-clock extraction and source/hash validation. `avid_speaker_checkpoint` takes `analysisId` and verifies its media scope, PCM length/hash, range and checkpoint identity without loading models. `published` only reports whether a result path exists; inspect the result separately. `avid_speaker_analyses` includes at most 20 sorted unpublished candidate IDs; use the last ID as `after` to inspect later candidates. A candidate may have no checkpoint, and discovery does not establish worker termination.

After observing cancellation/failure, call `avid_resume_speakers` with `analysisId` and the checkpoint `sha256` as `expectedSha256`, or queue a `diarization_resume` job with those fields. Resume requires `export`, `project-write` and the same verified runtime/worker. It validates the parent and source again, refuses a published parent, copies verified PCM into a new analysis, and reruns inference. The parent remains unchanged, and the new result persists parent/checkpoint provenance. A running parent is not automatically stopped; inspect its job before retrying. No model-internal progress is reused. Old analyses remain readable and deletable without a checkpoint.

Actual Windows MCP cancellation after audio publication, terminal-job observation, reconnect, resume with an unavailable FFmpeg executable, and exact machine-output comparison against uninterrupted 180-second Sonoma analysis passed. See `scripts/research/qualify-speaker-recovery.mjs`. This verifies audio reuse and deterministic output for this input; speaker accuracy and cleanup remain unqualified.

Saved speaker options must explicitly include the speaker count and clustering threshold; missing persisted fields are rejected rather than defaulted. Checkpoint publication, verification and saved-result reads reject nonfinite float32 PCM samples, even if file length and SHA match. User-request options still retain their documented defaults. These structural checks do not authenticate externally edited checkpoints or establish audio/recognition quality.

External-command timeouts and output overflow now request termination and wait for the direct child close event before returning an error. A still-running child receives a forced-termination request after one second; kill errors do not establish exit. If termination fails, the operation can remain pending rather than report a stopped process. Output after the first failure is discarded within the existing byte bound. This covers the direct process, not arbitrary descendants or other writers, and is not sufficient by itself to authorize incomplete-artifact cleanup.

On Windows, failed commands now request taskkill tree termination before direct-child fallback and wait for the tree command and child closure. Error details include `treeTermination.succeeded`; false means descendant termination was not confirmed, even if the direct child closed. Non-Windows retains direct-child termination. Actual ordinary/detached descendant tests passed for Windows timeout and overflow; see PROCESS_TREE_QUALIFICATION.md for normal-exit, parent-exit-race and cleanup limits.

### Cleanup of stopped speaker runs

New speaker runs write owner metadata before extraction and bind its hash into the audio checkpoint. On Windows, `avid_cleanup_speaker_run` takes `analysisId` and `expectedCheckpointSha256`. It requires `project-write`, a valid source/audio checkpoint, no published result, a matching owner record, and exactly `audio.json`, `owner.json` and `speech.f32` as direct regular files. Missing, changed, linked and unexpected files are refused. Older ownerless runs and extraction failures without an audio checkpoint remain outside automatic cleanup.

Cleanup requires the recorded owner PID to be absent and queries current Windows processes for directory references. Unavailable relevant command lines cause refusal. A direct-call failure may retain the MCP server as its owner; stop/restart that server before cleanup. No process is killed by cleanup, and PID age is not used to infer exit.

The validated directory is renamed to `speaker-cleanup-<analysisId>-<UUID>` inside the same library, then process state, file inventory/hashes and source access are rechecked before the three files are deleted individually. Failures retain the remaining files at the reported cleanup path; automatic recovery from a partial cleanup is not implemented. This coordinates known run ownership and observed process references, not arbitrary writers racing the scan or reparented processes hiding their paths. Source media, resumed children and other analyses are preserved.

Actual Windows MCP cancellation/resume and cleanup passed using the Sonoma preview, including unexpected-file refusal and preservation of the resumed result and source. Reproduce with `node scripts/research/qualify-speaker-recovery.mjs --cleanup-parent`.

### Restore an intact speaker cleanup directory

If cleanup stopped after the rename while all three files remain intact, call `avid_recover_speaker_cleanup` with the returned cleanup directory basename as `name` and the original `expectedCheckpointSha256`. Windows process qualification, source access, exact regular-file inventory, checkpoint/owner/audio hashes and an absent destination are required. The tool restores the original `speakers-<analysisId>` directory and verifies its checkpoint. It requires `project-write` and does not restart inference.

Partial deletions, unknown names, changed contents, active owners/writers and existing destinations are refused with files retained. If the move succeeds but final verification fails, the error identifies the restored destination; inspect it before retrying. Arbitrary writers racing validation and power-loss durability are not qualified. Real MCP testing used an intact simulated cleanup directory copied from saved Sonoma analysis, verified a collision refusal, restored identical files and cleaned the isolated copy while preserving the original. Reproduce with `node scripts/research/qualify-speaker-cleanup-recovery.mjs`.

### Interrupted process qualification

`scripts/research/qualify-job-crash.mjs` runs Sonoma QC with a second queued job, confirms both journal states, and forcibly terminates only its own MCP process tree on Windows. After reconnect, both records must return `unresolved`, retain their recorded running/queued status and have `automaticReplay: false`. The test checks unchanged journal hashes and source media. This does not resume QC computation or establish power-loss durability, parent-only termination safety, or cleanup of orphaned descendants. Evidence: `.avid-mcp-analysis/job-crash-bde54231-5f92-4c71-988b-353f1255049c/evidence.json`.

The same harness accepts `--parent-only` to terminate its server without requesting tree termination. It records child process identities, checks their absence after reconnect, and rejects QC report artifacts left by the interrupted run. Surviving observed children receive identity-checked cleanup. One Sonoma QC run passed (`job-crash-2d0234ca-fd34-4bf7-811f-d8c47bba8e6c`); later child absence does not prove prompt shutdown or containment of all descendants and model workers.

Job history pages scan at most `limit` validly named journal files, counting damaged/unreadable files in `unreadable` and omitting records outside the configured scope. Follow `nextAfter` even when `records` is empty. Direct status reads still reject damaged records. Invalid filenames and directories are ignored; total directory discovery remains bounded at 10,000 entries.

Fresh-package Claude qualification: after building, run `node scripts/research/qualify-installed-claude.mjs ABSOLUTE_PATH_TO_INSTALLED_CLAUDE_EXE`. This packs and installs the current branch in a retained isolated directory, compares every installed MCP tool definition with the checkout, pings both servers and runs the isolated Claude CLI lifecycle harness against the installed entry. The current 129-tool package passed: `installed-claude-d551d8d6-1f7f-44ce-a0fe-77350c5cbac1`, with Claude evidence `claude-cli-66bc27f8-005b-412a-a474-b8b2fbeceb94`. This remains CLI connection evidence, not GUI/model-driven or native-Avid invocation. Zod is pinned to the tested 4.4.3 because a fresh 4.5.4 resolution changed the advertised tuple constraints; dependency updates must requalify schema equality.

### Saved sequence structure report

`avid_saved_sequence_complexity` accepts a snapshot `revision` and `mobId`. It reports duration, track and node counts, direct source-reference and distinct-source counts, node kinds per track and opaque-node counts. It requires one matching mob; snapshot only its bin if IDs are duplicated. Counts are historical snapshot structure, not current media availability or a render-cost estimate. Stereo references count per channel, not per editorial cut. Opaque nodes make completeness false and are not classified as specific effects.

For a current saved-bin report, capture a fresh snapshot first. `node scripts/research/qualify-snapshot-complexity.mjs --fresh` qualifies that workflow against the retained Sonoma import fixture and compares the new snapshot with its historical capture. The observed three-track count includes picture, stereo sound and timecode; six source references cover channel references across two cuts. Fresh capture evidence: `complexity-42f4d4c3-9aad-4fa2-bcf9-643f8e05cc61.json`. The bin remained unchanged during inspection, but differs semantically from the historical snapshot.

Snapshot reads reject inconsistent duration/source bounds, duplicate track ordinals and node ranges outside the mob duration. These checks validate stored structure; they do not authenticate an externally edited snapshot or establish current media availability.

`node scripts/research/qualify-snapshot-fixtures.mjs` exercises generated AVB subclips, stereo channel mapping and opaque effects through the real Python sidecar and MCP snapshot/report/range tools. It requires the repository Python environment and retains inputs and results. This complements the Sonoma saved-bin check; generated AVB acceptance does not establish native import or general transition support.

The snapshot fixture harness also covers a generated ten-frame transition between two sixty-frame sources. Source nodes overlap during the transition; overlapping references must not be counted as sequential cuts or summed to infer sequence duration. The transition remains opaque and makes coverage incomplete. Exact effect identity, native rendering and broader transition variants are not qualified by this fixture.

`avid_saved_source_usage` now accepts `after` and `limit` (1–500). Follow `nextAfter` with the same revision/source ID until null. `totalReferences` counts all direct matches; `truncated` indicates that more pages remain. Each result has a stable match index within that snapshot/source query. Stereo channels and overlapping transition sources remain separate references, not unique editorial cuts.

`avid_diff_saved_snapshots` accepts `after` and `limit` (1–200). Follow `nextAfter` with the same baseline/candidate pair to retrieve every change. `totalChanges` is the comparison-wide count; `truncated` indicates more pages. Change indices are scoped to that pair of saved revisions, not stable identifiers across different comparisons.
