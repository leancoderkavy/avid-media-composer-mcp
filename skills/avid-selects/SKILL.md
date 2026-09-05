---
name: avid-selects
description: Find local footage and build source-referenced selects collections or straight-cut AAF handoffs with Avid Media Composer MCP.
---

Start with `avid_get_capabilities` and current tool schemas. Index requested files with `avid_index_media`; use returned IDs throughout.

Choose search from the evidence needed: `avid_search_media` for metadata/transcript substrings, `avid_search_visual` for sampled CLIP text/image similarity, or `avid_search_visual_frame` for a reference source frame. Visual search requires an existing index from `avid_index_visual` and separately installed models. Uniform samples can miss shots; similarity scores are not probabilities. Inspect thumbnails and source ranges before curating.

Save chosen half-open source-time ranges in seconds with `avid_save_collection`, including labels and reasons. Read the returned revision with `avid_read_collection`; use `avid_collection_range` to verify stringout-to-source mapping.

For handoff:

- `avid_export_collection_otio` creates a frame-quantized single-video-track interchange file. It does not author audio routing or prove Avid import.
- For an existing master-only Avid-exported AAF, call `avid_inspect_aaf_template`, retain its checksum and master/slot identities, then use `avid_build_aaf_selects` with explicit integer frame ranges and exact track rates. Never infer MOB IDs from clip names. The builder preserves template descriptors and verifies output conformance; import and playback in Avid remain separate steps.
- For a requested native subclip, read the actual project/bin/clip with `avid_native_read`, then preview/apply `create_subclip` and read back the returned MOB. Current qualification requires a 30 fps source/project and retains all source tracks. A subclip is not a sequence.

Return collection revision, source ranges, artifact paths and the exact level of host verification completed. Do not describe an interchange file as an edited live timeline.
