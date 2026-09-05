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
node dist/cli.js --download-models --speech --speech-model tiny --model-dir 'D:\MCP Models'
$env:AVID_MCP_MODEL_DIR = 'D:\MCP Models'
```

These explicit commands install and audit a separate optional runtime, then download fixed model revisions. npm must be available alongside Node. Model inference loads cached files only; footage is not uploaded. The optional runtime uses Transformers.js 4.2.0 with sharp 0.35.4 and adm-zip 0.6.0 in its own installation root, where override pins apply.

- CLIP: `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`.
- Whisper English: `onnx-community/whisper-tiny.en`, revision `2575352d61be1bf7225cf8f8b268a4678025fc58`.
- Whisper multilingual: `onnx-community/whisper-tiny`, revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`. The [model card](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7) points to OpenAI Whisper; accepted language codes follow its pinned [generation configuration](https://huggingface.co/onnx-community/whisper-tiny/blob/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/generation_config.json).

`avid_transcribe_media` and `speech` analysis jobs accept `options: {"model":"tiny","language":"fr"}` (for example, French). The default remains `tiny.en`; it rejects non-English language hints. `tiny` accepts the model's language codes or the compatibility value `auto`. **Automatic language detection is unavailable in the pinned runtime.** Auto uses English and reports `language: "en"`, `languageSelection: "english_fallback"` and `languageDetectionSupported: false`. Choose an explicit language code for non-English audio. This corrects the earlier `language: null` response, which hid the runtime's English default. The task is transcription, not translation. Responses include the pinned model revision, requested language and source-relative segment times. Calls in one direct speech service are serialized; queued jobs retain their existing single-worker bound.

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

New indices retain `coverage` per media ID: range start/end and sample count, including sources where no faces were found. Reads validate each face against a requested sample and authorize all covered media. Legacy indices report null coverage. Requested seek times are not exact decoded-frame timestamps, and multiple samples can map to the same decoded frame. More than 50 detected faces in one frame or 1000 total faces fails explicitly; detections are not silently dropped to fit these limits. Source hashes are rechecked after face inference before the index is published. Dense indexing still lacks computation resume.

Real queued MCP qualification sampled Sonoma [60,120) 120 times, returned 38 detections, checked every face against the requested sample plan and preserved the source hash. Script: `scripts/research/qualify-people-range.mjs`. This establishes bounded dense/ranged execution, not exhaustive appearance coverage or identity accuracy.

`avid_find_similar_faces` uses a selected `referenceIndexId` and `referenceFaceId` to rank other saved face appearances. Optional `options` include up to 20 `indexIds` (defaults to the reference index), `mediaIds`, a half-open `range`, `threshold` from -1 to 1 (default 0.45), and `limit` from 1 to 100. Results include index revisions, media IDs, requested sample times, crop paths, cluster IDs and user-supplied names. The selected occurrence is excluded; the same face ID in another index is a separate occurrence. `matchingFaces` and `hasMore` report when the result limit was reached; narrow the scope or increase the limit for more results.

This read-only search requires `inspect`, checks access to every requested index's media, and uses saved features without loading models. Cosine scores rank visual similarity, not verified identity or calibrated confidence. It cannot find unsampled appearances. Real MCP ranking of 37 Sonoma detections matched an independent cosine calculation, with bounded and time-filtered results verified and source unchanged. Script: `scripts/research/qualify-face-search.mjs`.

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

The transcription API's `auto` compatibility option still uses its documented English fallback. Its `languageDetectionSupported: false` field describes automatic selection within that transcription call, not availability of this separate detection tool. Review the suggestion and pass the selected language explicitly to transcription. Existing speech recovery recipes retain their original language behavior.

Qualification: real stdio MCP returned en and zh on original synthetic English and Mandarin speech, and null on digital silence, with unchanged source hashes. This is narrow language-identification evidence, not acceptance across all supported language tokens. Scripts: `qualify-language-detection.mjs` and `qualify-language-detection-mcp.mjs` under `scripts/research`. The unguarded research model selected Welsh for silence, which is why the tool excludes exact digital silence.

Method reference: [OpenAI Whisper language detection](https://github.com/openai/whisper/blob/main/whisper/decoding.py). This implementation is original TypeScript using the pinned local ONNX model; it does not copy a competitor implementation.

## Rediscovering people indices

`avid_people_indices` takes an authorized `mediaId`, optional `after` index UUID and `limit` (1–100, default 20). It returns saved indices in UUID order, their revisions, face/cluster counts and coverage for that media. Use an index ID with the people-cluster, face-list or reference-search tools after reconnecting a client.

New zero-face indices are discoverable through their retained coverage. Legacy indices without coverage can only be attributed through their face records. Partial/deleted directories without a final index are omitted. Invalid indices attributable to the requested media return `state: "unavailable"` and an error while healthy results remain visible. Every available result requires authorization for all media in that index. Malformed manifests that cannot be attributed still fail discovery.

Fresh-session inspect-only MCP qualification discovered the existing Sonoma index and verified its 37 reference-face search results again: `scripts/research/qualify-face-search.mjs`. This does not provide interrupted people computation recovery.

Visual text queries have a 77-token model-context limit including special tokens, in addition to the 500-character input limit. Oversized descriptions return VISUAL_QUERY_TOO_LONG with tokenCount and maxTokens before text inference. They are not silently truncated. Use concise descriptions or separate searches for distinct concepts. Frozen Sonoma queries retained exactly the same ranks and scores after enforcing this limit; see VISUAL_SEARCH_BENCHMARK.md.
