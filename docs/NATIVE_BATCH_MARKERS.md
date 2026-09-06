# Native batch markers

Fresh corrected-code qualification passed in `.avid-mcp-analysis/native-batch-markers-c8750760-3e8d-4822-8248-a04621e44ba3/evidence.json`: verified batch application, saved/reopened marker fields and baseline marker-list restoration after explicit deletion. Original source-bin/media hashes were unchanged. Initial default-enum mismatch and no-replay recovery are retained separately in `native-batch-markers-62921df6-59f3-47cb-8ad4-b4bdb287eb02`.

Preview an `add_markers` operation with `bin`, `mobId` and 1–100 marker records. Each record supplies a unique UUID `guid`, zero-based `offset`, picture/sound `track` (`type`, `number`), `name`, `comment` and `color`. Names and comments currently require printable ASCII. Apply requires edit authority and an unexpired single-use preview token.

UUIDs are normalized to lowercase in the preview. Case-only duplicates and collisions with existing uppercase/lowercase UUIDs are refused. Readback matches UUIDs independently of letter case, and a final project check refuses verification after a project switch. This is not an atomic snapshot of concurrent editor changes.

The preview binds current marker state, clip membership, saved bin hash, track inventory and duration metadata. It requires a 30 fps project/clip, existing target tracks and offsets below the frame count. GUIDs already present are refused. Apply dispatches one native `AddMarkers` request under the existing host lock and owner check.

`markersVerified` reports whether readback contains every requested GUID, offset, track, name, comment, color, length (one frame) and user (`Avid MCP`), with existing marker records preserved and no extra additions. The omitted picture-track enum is interpreted using the qualified protobuf default. `applicationCompleted` alone does not establish that verification succeeded. Persistence is separate: save/reopen and read markers again when required.

A partial/error response must be inspected before another operation. The consumed token cannot replay the batch, and a new batch containing an existing GUID is refused. There is no atomic undo or automatic compensating deletion. Native application errors may leave changes even when the request reports failure.

The qualification harness creates a new owned copy of the fixed Sonoma color sequence, adds two markers, saves/reopens, verifies fields, explicitly deletes those exact markers, and verifies the marker list after another save/reopen. It preserves original source-bin/media hashes. Optional recovery input is an absolute failed harness evidence directory; it requires a recorded completed batch and reads the existing markers instead of resubmitting them. This recovery mode is for these owned fixtures, not automatic recovery of arbitrary client operations.

Run `node scripts/research/qualify-native-batch-markers.mjs` on the qualified Windows project. The first experiment exposed omitted default enum values in readback; its retained original response correctly reports verification failure. The subsequent recovery preserved that response and independently checked the existing markers before cleanup. Broader rates, Unicode, mixed tracks, 100-marker scale, restart/undo and full saved-bin graph restoration remain separate acceptance work.
