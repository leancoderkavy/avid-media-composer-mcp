---
name: avid-turnover
description: Inspect saved Avid bins and interchange files for source usage, timeline changes, and turnover gaps using Avid Media Composer MCP.
---

Start with `avid_get_capabilities`. Analyze the requested saved project/bin with `avid_analyze_project` or `avid_analyze_bin`; use `avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl` or `avid_analyze_otio` for the supplied interchange format.

After reconnecting, use `avid_saved_snapshots` to discover historical revision IDs in the configured output library. Follow `nextAfter` even when a page is empty and report unavailable entries as missing evidence. Discovery does not verify current bin hashes; capture a fresh snapshot for current saved state.

Use `avid_saved_snapshot_mobs` for a recovered revision to find mob IDs, names, bin identities and structural metadata. Follow its continuation cursor. If a mob ID occurs in multiple bins, capture only the target bin before requesting a single-mob range or complexity report.

For sequence source mapping, create `avid_snapshot_saved_bins` over the relevant saved AVBs. Retain its revision and warnings. Query `avid_saved_timeline_range` with integer edit-unit bounds, and `avid_saved_source_usage` for direct source references. These are saved-file facts; unsaved editor changes are excluded. Nested effects, retimes and opaque graph nodes can make usage incomplete.

Source-usage results are paginated. Pass `nextAfter` as `after` with the same snapshot revision and source mob ID until it is null. `totalReferences` counts direct matching references across the snapshot, including separate stereo channel references; it does not count unique editorial cuts. A truncated page is not the complete turnover inventory.

Review source-usage `coverage` for each bin, including warnings and `warningsTruncated`. Zero matches with incomplete coverage do not establish that a source is unused. Report mixed-rate or opaque omissions before recommending media cleanup or relinking.

When current file availability is requested, call `avid_saved_locator_availability` and follow `nextAfter` until null. It performs metadata-only checks under configured roots. Distinguish `not_found` from unsupported declarations, volume hints, unavailable roots, absent/unrecorded descriptors and refused symlinks. Rows are declarations, not unique assets. For observed Windows `D//folder/file` values, explicit `interpretAvidDrivePaths: true` enables that bounded spelling interpretation while retaining the raw declaration and root checks. Do not infer volume mappings or scan for replacements. `file_present` is not Avid online, correct-content, relink or playback proof.

Keep `missingBins` and row-level `binPresent` in the report, including when a page has no declarations. `binSha256` belongs to the capture at `snapshotCreatedAt`; `binHashesRevalidated: false` means current bin contents were not rehashed. Restoring a filename does not prove that the historical locator declarations are current. Capture a new snapshot for that claim.

Use `avid_saved_sequence_complexity` with that revision and the target mob ID for per-track node kinds, source-reference counts and opaque-node coverage. Include media kinds: track count can include timecode, and stereo channel references are not separate editorial cuts. Treat the result as direct saved structure, not a render-time estimate, media-online check or recursively expanded effect inventory. Use a fresh snapshot when the user asks about the current saved bin.

For a before/after review, create a second snapshot after the requested edit is saved and call `avid_diff_saved_snapshots`. Report semantic changes with bin/MOB/track references; distinguish missing coverage from an empty diff.

Diff results also paginate: follow `nextAfter` as `after` with the same baseline/candidate revisions until null. `totalChanges` is the comparison-wide count; do not present the first 200 changes as the entire review when more pages remain.

Use `avid_analyze_dnx_turnover` when the user supplies a DNx turnover to check, following its discovered schema. Report unresolved media paths, track/rate inconsistencies, unsupported effects and dependency gaps supported by the results. Do not infer relink or render success from a parsed AAF or AVB.

Return a concise turnover report with input paths, snapshot revisions, observed source uses, differences and remaining host checks. Preserve source projects and media.
