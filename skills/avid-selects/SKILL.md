---
name: avid-selects
description: Find local footage and build source-referenced selects collections or straight-cut AAF handoffs with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and current tool schemas. Index requested files with `avid_index_media`; use returned IDs throughout.

Choose search from the evidence needed: `avid_search_media` for metadata/transcript substrings, `avid_search_visual` for sampled CLIP text/image similarity, or `avid_search_visual_frame` for a reference source frame. Visual search requires an existing index from `avid_index_visual` and separately installed models. Uniform samples can miss shots; similarity scores are not probabilities. Inspect thumbnails and source ranges before curating.

Use `avid_detect_shots` when uniform samples may miss brief shots. It decodes the first video stream at native resolution and returns threshold-based cuts plus representative source timestamps. Inspect candidate cuts before treating them as edit decisions; flashes and motion can trigger false cuts. For long ranges use an analysis job with kind `shots`. Each request covers at most one hour; preserve range-edge and coverage limitations when combining reports.

Use `avid_index_visual_shots` to detect and embed one midpoint per shot in one operation, or job kind `visual_shots` for long work. Search results retain each shot's half-open source range. Indexes exceeding 1200 shots are rejected; shorten the range rather than assuming omitted shots were indexed. Search time scopes still filter midpoint timestamps, not any overlap with a shot range.

Save chosen half-open source-time ranges in seconds with `avid_save_collection`, including labels and reasons. Read the returned revision with `avid_read_collection`; use `avid_collection_range` to verify stringout-to-source mapping.

For interrupted visual indexing, use `avid_visual_index_runs` and `avid_visual_index_run` to inspect persisted sample counts. A partial record does not prove its worker stopped. After cancellation reaches a terminal status, `avid_resume_visual_index` (or a `visual_resume` job) creates a new run, validates source/model/thumbnail integrity and reuses the committed embedding prefix. Keep the returned parent run ID and reused count in the receipt. Speech and people have separate `avid_speech_runs` / `avid_speech_run` / `avid_resume_speech` and `avid_people_runs` / `avid_people_run` / `avid_resume_people` workflows. Inspect their current schemas and verified checkpoint state; do not infer that an unfinished job resumes automatically. Shot detection before its sample plan exists still lacks this recovery.

When using transcript summaries for editorial context, review claims against the source transcript. Interrupted summary runs are available through `avid_summary_runs` and `avid_summary_run`; `avid_resume_summary` (or a `summary_resume` job) reuses verified nodes in a new run. Keep the transcript revision and parent run identity. Recovery checks provenance and structure, not factual accuracy or visual grounding.

For handoff:

When a separate source-clock editing copy is needed, inspect the source's stream indexes and checksum, then call `avid_prepare_source_clock_media` with explicit absolute video/audio indexes. It supports bounded local H.264 plus stereo inputs and writes copied video with normalized 48 kHz/24-bit PCM. Preserve its receipt and original source; additional media streams are omitted. Preparation does not link or relink Avid media. Use the resulting file explicitly in the native link/reference-export workflow, and verify stereo source ranges and rendered audio independently.

- `avid_export_collection_otio` creates a frame-quantized single-video-track interchange file. It does not author audio routing or prove Avid import.
- For an existing master-only Avid-exported AAF, call `avid_inspect_aaf_template`, retain its checksum and master/slot identities, then use `avid_build_aaf_selects` with explicit integer frame ranges and exact track rates. Never infer MOB IDs from clip names. The builder preserves template descriptors and verifies output conformance; import and playback in Avid remain separate steps.
- For a requested native subclip, read the actual project/bin/clip with `avid_native_read`, then preview/apply `create_subclip` and read back the returned MOB. Current qualification requires a 30 fps source/project and retains all source tracks. A subclip is not a sequence.

For a native AAF selects workflow on the qualified Windows host:

1. Read the linked source master and available `export_settings` with `avid_native_read`. Obtain the current local source checksum. Preview/apply `export_aaf_master` with the actual bin/MOB, an existing AAF preset, source file and checksum. Use its returned `verification.inspection` template/checksum/master/slots; do not guess exported identities or reuse an unrelated template.

   For multiple exported references, inspect each template, then call `avid_merge_aaf_references` with 2–16 `{file, expectedSha256}` sources. Preserve the returned template/checksum, media evidence and per-input `sources[].remappedMobIds`. Resolve each chosen exported master ID through its own input's map (use the original ID when absent), and verify that the resulting ID exists in the returned masters. Preserve the reviewed cut order explicitly; names or the returned master array order are not editorial ordering. Shared source IDs can have conflicting graphs even when media paths or slot summaries look similar. The merger keeps those graphs separate through identity remapping and rejects incompatible definitions. Do not manually deduplicate them or suppress a verification failure. Merging creates an interchange template and does not relink the project.

2. Build reviewed integer source-frame cuts with `avid_build_aaf_selects` at the exact master-slot rate and explicit picture/sound slot mappings. For stereo, set `channels: 2` on one sound destination track and map its corresponding `slotIds` entry to `[leftSourceSlot, rightSourceSlot]` for each select; both must be distinct same-rate sound slots. Independent mono tracks do not assert stereo routing. Inspect the result using `avid_inspect_aaf_selects`; stereo cuts have overlapping `channelIndex` 1/2 records. Preserve the new AAF checksum, track mapping and source-media evidence.
3. Read `import_settings`, choose an existing open empty destination bin, or create a separately named bin through native preview/apply if authorized. Preview/apply `import_aaf_selects` using the returned AAF file/checksum and an existing import preset. Both edit and export capabilities are required; the current native path requires a 30 fps project/composition.
4. Use the returned native composition MOB ID. Its metadata receipt is not saved-graph conformance. When save/reopen is within the task, close/open the destination bin, verify identity, then use `avid_snapshot_saved_bins` and `avid_saved_timeline_range` to check source ranges and stereo channel references. Host remapping can change IDs and track representation; investigate discrepancies instead of repeating import.
5. If rendering is requested, preview/apply `export_mp4` for the complete returned sequence with explicit video/audio expectations. Report full decode and technical contract checks separately from source-audio, frame and color fidelity. The Sonoma PCM preparation is a specific qualified fixture, not an automatic correction for all MP4 source clocks or color tags.

Each native token is single-use. On an uncertain import/export, inspect the attempt and native lock before further writes; never automatically resubmit. `avid_native_lock_status` provides scoped evidence. With Avid stopped, export recovery uses its lock checksum; `avid_recover_native_import_lock` additionally requires the reviewed evidence checksum. Recovery releases only the lock and does not undo the operation. Do not promise atomic undo or complete live/unsaved timeline coverage.

Return collection revision, source ranges, artifact paths and the exact level of host verification completed. Do not describe an interchange file as an edited live timeline.
