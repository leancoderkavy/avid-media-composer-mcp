---
name: avid-turnover
description: Inspect saved Avid bins and interchange files for source usage, timeline changes, and turnover gaps using Avid Media Composer MCP.
---

Start with `avid_get_capabilities`. Analyze the requested saved project/bin with `avid_analyze_project` or `avid_analyze_bin`; use `avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl` or `avid_analyze_otio` for the supplied interchange format.

For sequence source mapping, create `avid_snapshot_saved_bins` over the relevant saved AVBs. Retain its revision and warnings. Query `avid_saved_timeline_range` with integer edit-unit bounds, and `avid_saved_source_usage` for direct source references. These are saved-file facts; unsaved editor changes are excluded. Nested effects, retimes and opaque graph nodes can make usage incomplete.

Use `avid_saved_sequence_complexity` with that revision and the target mob ID for per-track node kinds, source-reference counts and opaque-node coverage. Include media kinds: track count can include timecode, and stereo channel references are not separate editorial cuts. Treat the result as direct saved structure, not a render-time estimate, media-online check or recursively expanded effect inventory. Use a fresh snapshot when the user asks about the current saved bin.

For a before/after review, create a second snapshot after the requested edit is saved and call `avid_diff_saved_snapshots`. Report semantic changes with bin/MOB/track references; distinguish missing coverage from an empty diff.

Use `avid_analyze_dnx_turnover` when the user supplies a DNx turnover to check, following its discovered schema. Report unresolved media paths, track/rate inconsistencies, unsupported effects and dependency gaps supported by the results. Do not infer relink or render success from a parsed AAF or AVB.

Return a concise turnover report with input paths, snapshot revisions, observed source uses, differences and remaining host checks. Preserve source projects and media.
