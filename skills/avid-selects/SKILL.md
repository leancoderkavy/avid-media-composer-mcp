---
name: avid-selects
description: Find local footage and build source-referenced selects collections or straight-cut AAF handoffs with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and current tool schemas. Index requested files with `avid_index_media`; use returned IDs throughout.

Choose search from the evidence needed: `avid_search_media` for metadata/transcript substrings, `avid_search_visual` for sampled CLIP text/image similarity, or `avid_search_visual_frame` for a reference source frame. Visual search requires an existing index from `avid_index_visual` and separately installed models. Uniform samples can miss shots; similarity scores are not probabilities. Inspect thumbnails and source ranges before curating.

Use `avid_detect_shots` when uniform samples may miss brief shots. It decodes the first video stream at native resolution and returns threshold-based cuts plus representative source timestamps. Inspect candidate cuts before treating them as edit decisions; flashes and motion can trigger false cuts. For long ranges use an analysis job with kind `shots`. Each request covers at most one hour; preserve range-edge and coverage limitations when combining reports.

Use `avid_index_visual_shots` to detect and embed one midpoint per shot in one operation, or job kind `visual_shots` for long work. Search results retain each shot's half-open source range. Indexes exceeding 1200 shots are rejected; shorten the range rather than assuming omitted shots were indexed. Search time scopes still filter midpoint timestamps, not any overlap with a shot range.

Save chosen half-open source-time ranges in seconds with `avid_save_collection`, including labels and reasons. Read the returned revision with `avid_read_collection`; use `avid_collection_range` to verify stringout-to-source mapping.

For interrupted visual indexing, use `avid_visual_index_runs` and `avid_visual_index_run` to inspect persisted sample counts. A partial record does not prove its worker stopped. After cancellation reaches a terminal status, `avid_resume_visual_index` (or a `visual_resume` job) creates a new run, validates source/model/thumbnail integrity and reuses the committed embedding prefix. Keep the returned parent run ID and reused count in the receipt. Speech and people jobs, and shot detection before its sample plan exists, do not yet have computation resume.

When using transcript summaries for editorial context, review claims against the source transcript. Interrupted summary runs are available through `avid_summary_runs` and `avid_summary_run`; `avid_resume_summary` (or a `summary_resume` job) reuses verified nodes in a new run. Keep the transcript revision and parent run identity. Recovery checks provenance and structure, not factual accuracy or visual grounding.

For handoff:

- `avid_export_collection_otio` creates a frame-quantized single-video-track interchange file. It does not author audio routing or prove Avid import.
- For an existing master-only Avid-exported AAF, call `avid_inspect_aaf_template`, retain its checksum and master/slot identities, then use `avid_build_aaf_selects` with explicit integer frame ranges and exact track rates. Never infer MOB IDs from clip names. The builder preserves template descriptors and verifies output conformance; import and playback in Avid remain separate steps.
- For a requested native subclip, read the actual project/bin/clip with `avid_native_read`, then preview/apply `create_subclip` and read back the returned MOB. Current qualification requires a 30 fps source/project and retains all source tracks. A subclip is not a sequence.

Return collection revision, source ranges, artifact paths and the exact level of host verification completed. Do not describe an interchange file as an edited live timeline.
