# Unknown freeze and silence endpoints

New QC results represent a freeze or silence start without an observed closing event as `{start, end: null, openAtProcessingEnd: true}`. Consumers must handle null before computing duration or drawing a closed range. The requested end can exceed the selected stream's decoded coverage and is not evidence of an event endpoint. Closed intervals retain numeric end timestamps.

Previously, these events were artificially closed at the requested end and marked openAtRangeEnd. An actual fixture containing one second of static video and four seconds of PCM silence exposed a false four-second freeze. The revised result retains the freeze start with an unknown end. In the inverse fixture, four seconds of static video and one second of silence, the open freeze also has unknown end, while FFmpeg's actual silence_end event remains at second one.

Evidence: `.avid-mcp-analysis/qc-open-streams-59ba901f-b1df-4e22-ac6f-14a1cc1a761c/evidence.json`. Both real MCP cases verified video-frame/audio-sample amounts, saved-result equality and unchanged input hashes. Six separate delayed-video/audio and nonzero-start cases retained their closed endpoints within the existing 80 ms tolerance: `.avid-mcp-analysis/qc-offsets-82ede981-d0fc-4d07-bd56-4fdd8b6e6c57/evidence.json`.

Historical saved reports retain their original values; reads do not retroactively upgrade their endpoint evidence. New open-interval records are validated for null endpoints, explicit open status, source-range bounds and selected stream presence. These changes do not prove actual scene motion, intentional silence, perceptual sync or delivery compliance.
