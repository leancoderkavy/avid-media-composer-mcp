# Unknown freeze and silence endpoints

## Saved event validation

Stored black/freeze/silence collections must be arrays with at most 10,000 events. Closed events require finite numeric, nonnegative starts and positive ends strictly after their starts, inside the report's source range, with the corresponding stream selected. Open freeze/silence events retain their separate null-end schema. Historical openAtRangeEnd events remain readable for freeze/silence without upgrading their evidence. Invalid reports are refused rather than silently repairing intervals. Missing historical event collections remain distinct from malformed collections.

The affected 12 report tests cover malformed shapes, excessive event counts, reversed/zero/negative/out-of-range intervals, wrong types and missing streams. Actual short-stream and black-tail saved retrieval passed: `.avid-mcp-analysis/qc-open-streams-4cd2c4c0-181c-41e7-a6f6-1af2c6cf6ded/evidence.json` and `.avid-mcp-analysis/qc-black-tail-09381dfc-11a3-4244-8309-a66cb8cf7765/evidence.json`.

## Model interpretation check

An actual authenticated Codex session read the saved short-video report using only avid_read_qc_report. A structured-answer check verified start 0, end null, duration unknown, 30 decoded video frames and four requested seconds. The model's explanation explicitly stated that neither the request nor the frame count establishes continuous coverage or a four-second freeze. The MCP payload matched a direct report read, and subsequent source/report validation stayed unchanged.

Reproduce with `node scripts/research/qualify-codex-qc-read.mjs ABSOLUTE_CODEX_EXECUTABLE ABSOLUTE_OPEN_STREAMS_EVIDENCE_JSON`. The input must be the owned fixture evidence from qualify-qc-open-streams.mjs containing the one-second video/four-second audio case. Evidence: `.avid-mcp-analysis/codex-qc-read-c7502fe6-6bd2-4df5-b93f-b6bc8867b764/evidence.json`. This qualifies one model/client/report interpretation; it is not general factual accuracy or a new media decode.

New QC results represent a freeze or silence start without an observed closing event as `{start, end: null, openAtProcessingEnd: true}`. Consumers must handle null before computing duration or drawing a closed range. The requested end can exceed the selected stream's decoded coverage and is not evidence of an event endpoint. Closed intervals retain numeric end timestamps.

Previously, these events were artificially closed at the requested end and marked openAtRangeEnd. An actual fixture containing one second of static video and four seconds of PCM silence exposed a false four-second freeze. The revised result retains the freeze start with an unknown end. In the inverse fixture, four seconds of static video and one second of silence, the open freeze also has unknown end, while FFmpeg's actual silence_end event remains at second one.

Evidence: `.avid-mcp-analysis/qc-open-streams-59ba901f-b1df-4e22-ac6f-14a1cc1a761c/evidence.json`. Both real MCP cases verified video-frame/audio-sample amounts, saved-result equality and unchanged input hashes. Six separate delayed-video/audio and nonzero-start cases retained their closed endpoints within the existing 80 ms tolerance: `.avid-mcp-analysis/qc-offsets-82ede981-d0fc-4d07-bd56-4fdd8b6e6c57/evidence.json`.

Historical saved reports retain their original values; reads do not retroactively upgrade their endpoint evidence. New open-interval records are validated for null endpoints, explicit open status, source-range bounds and selected stream presence. These changes do not prove actual scene motion, intentional silence, perceptual sync or delivery compliance.
