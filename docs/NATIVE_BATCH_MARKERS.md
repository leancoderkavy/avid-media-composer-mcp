# Native batch markers

## Remove an explicit batch

Preview `delete_markers` with `bin`, `mobId` and 1–100 UUIDs in `guids`. Every requested UUID must exist exactly once; case-only duplicates are refused. The preview binds the entire current marker list, so edits between preview and apply invalidate the plan. Apply sends the observed native GUID spellings in one `DeleteMarkers` request under the existing lock and owner check.

`markersRemovedVerified` requires the resulting marker list to equal the original list minus exactly those IDs, including preservation of every remaining record. A project change, partial deletion or unrelated marker change refuses verified success. The token is consumed before dispatch; there is no automatic retry or compensating re-creation. Save/reopen remains a separate persistence check.

Actual qualification removed the 100 retained scale markers in one request while preserving one newly added marker outside that request. Save/reopen retained exactly the preservation marker; a separate removal and save/reopen then left zero markers. Original source-bin/media and prior evidence hashes remained unchanged. Evidence: `.avid-mcp-analysis/native-batch-removal-58c97a86-ce53-42f7-b502-893cf2abd953/evidence.json`. The earlier scale evidence records the state before this explicit cleanup; `MCP_Batch_29084e01.avb` no longer contains those test markers. This proves marker-list restoration, not whole-bin graph or byte restoration.

Subsequent read-only saved-file inspection compared the cleaned composition with the fixed copy source, permitting only the expected composition MOB ID and copy-name differences. All other decoded composition fields and all four referenced MOB records matched; warning records matched after remapping that composition ID. Both decodes remain incomplete because of opaque color-adapter components, so complete graph equivalence is explicitly unverified. This is also not a before/after marker comparison: no pre-marker copy graph was captured. Evidence and exclusive AVB snapshots: `.avid-mcp-analysis/batch-cleanup-graph-6e4630fc-ab64-47b6-aa56-e78c1e422a5a/`. Reproduce with `node scripts/research/verify-batch-cleanup-graph.mjs ABSOLUTE_BATCH_REMOVAL_EVIDENCE_JSON`. No editor or saved input file is modified.

The `--scale` harness mode passed 100 markers alternating between V1 and stereo A1 on a fresh 120-frame, 30 fps sequence copy, including frame-zero readback. All requested fields survived save/reopen. Evidence: `.avid-mcp-analysis/native-batch-markers-9b534448-7a38-4dd6-b345-5c08f6455e92/evidence.json`; retained fixture: `MCP_Batch_29084e01.avb`. Its markers remain for follow-up; no cleanup or baseline restoration is claimed for this mode. An initial V1/A1/A2 proposal was refused before dispatch because the source has one stereo A1, not separate A1/A2 tracks. The unchanged-source assertion passed on the successful run.

The earlier scale-run statement that markers remained describes that historical checkpoint; the subsequent batch-removal qualification cleaned that fixture.

## Independent saved-marker inspection

The harness now retains exclusive, hash-checked AVB copies before markers, after persistence and after cleanup. A fresh two-marker run passed in `.avid-mcp-analysis/native-batch-markers-cc75c541-21e6-44a8-8863-3793d2a19fe4/`, using owned bin `MCP_Batch_ca92028d.avb`. Independent pyavb inspection found zero TMBC records before, exactly the two requested GUID/name/comment/user/color-label records after save, and zero after deletion/save. All fields emitted by the existing timeline decoder matched across all three snapshots, including warnings. Original source-bin/media hashes remained unchanged.

The markers at sequence frames 15 and 75 both store `comp_offset: 15`, with `_TMP_CRM` references on different nested components. Their marker MOB IDs are zero. Neither field alone identifies sequence position or owner. The research inspector retains component reference paths and RGB16 values; it does not infer general track/rate/effect mapping or expose a production marker decoder yet. Opaque color adapters still prevent complete graph equivalence claims.

Run `.venv/Scripts/python.exe scripts/research/verify-saved-marker-snapshots.py EVIDENCE_DIRECTORY` once against a completed fresh two-marker run. It writes an exclusive `saved-marker-verification.json`; reruns refuse to overwrite it. `inspect-saved-markers.py SAVED_AVB` provides read-only raw record/path inspection. These checks establish saved identities, text and removal for this fixture, not general sequence-position decoding, Unicode, length, RGB-to-label equivalence or restart/undo.

## Native readback contract

Frame-zero offsets may be absent in protobuf responses; verification applies the qualified numeric default of zero. A regression case failed before that fix and passed afterward. This does not authorize inferring an offset from arbitrary non-native records.

Fresh corrected-code qualification passed in `.avid-mcp-analysis/native-batch-markers-c8750760-3e8d-4822-8248-a04621e44ba3/evidence.json`: verified batch application, saved/reopened marker fields and baseline marker-list restoration after explicit deletion. Original source-bin/media hashes were unchanged. Initial default-enum mismatch and no-replay recovery are retained separately in `native-batch-markers-62921df6-59f3-47cb-8ad4-b4bdb287eb02`.

Preview an `add_markers` operation with `bin`, `mobId` and 1–100 marker records. Each record supplies a unique UUID `guid`, zero-based `offset`, picture/sound `track` (`type`, `number`), `name`, `comment` and `color`. Names and comments currently require printable ASCII. Apply requires edit authority and an unexpired single-use preview token.

UUIDs are normalized to lowercase in the preview. Case-only duplicates and collisions with existing uppercase/lowercase UUIDs are refused. Readback matches UUIDs independently of letter case, and a final project check refuses verification after a project switch. This is not an atomic snapshot of concurrent editor changes.

The preview binds current marker state, clip membership, saved bin hash, track inventory and duration metadata. It requires a 30 fps project/clip, existing target tracks and offsets below the frame count. GUIDs already present are refused. Apply dispatches one native `AddMarkers` request under the existing host lock and owner check.

`markersVerified` reports whether readback contains every requested GUID, offset, track, name, comment, color, length (one frame) and user (`Avid MCP`), with existing marker records preserved and no extra additions. The omitted picture-track enum is interpreted using the qualified protobuf default. `applicationCompleted` alone does not establish that verification succeeded. Persistence is separate: save/reopen and read markers again when required.

A partial/error response must be inspected before another operation. The consumed token cannot replay the batch, and a new batch containing an existing GUID is refused. There is no atomic undo or automatic compensating deletion. Native application errors may leave changes even when the request reports failure.

The qualification harness creates a new owned copy of the fixed Sonoma color sequence, adds two markers, saves/reopens, verifies fields, explicitly deletes those exact markers, and verifies the marker list after another save/reopen. It preserves original source-bin/media hashes. Optional recovery input is an absolute failed harness evidence directory; it requires a recorded completed batch and reads the existing markers instead of resubmitting them. This recovery mode is for these owned fixtures, not automatic recovery of arbitrary client operations.

Run `node scripts/research/qualify-native-batch-markers.mjs` on the qualified Windows project. The first experiment exposed omitted default enum values in readback; its retained original response correctly reports verification failure. The subsequent recovery preserved that response and independently checked the existing markers before cleanup. Broader rates, Unicode, other track layouts, restart/undo and full saved-bin graph restoration remain separate acceptance work.
