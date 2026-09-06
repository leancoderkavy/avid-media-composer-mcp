# QC video frame coverage

`avid_media_qc` records `videoCoverage.decodedFrames` and `requestedSeconds` for the selected video stream. It requires a positive integer frame count in FFmpeg's terminal progress block. Missing, malformed, zero or nonterminal counts fail before report publication. Video-disabled analysis records `null`.

The video filter chain retains its existing range trim and detectors and uses explicit passthrough output timing. [FFmpeg's documentation](https://ffmpeg.org/ffmpeg.html) specifies progress as key/value blocks ending in `progress=continue` or `progress=end`, and describes passthrough mode as forwarding each frame with its timestamp. This avoids automatic output frame-rate conversion when counting processed frames. A count is not a proof of continuous timestamp coverage, image fidelity, CFR or synchronization; no expected count is inferred from nominal rate.

Saved-report reads validate positive counts, requested duration and consistency with the selected video stream. `videoCoverageStatus` distinguishes `recorded`, `video_not_selected` and legacy `not_recorded`; a legacy report is not upgraded by guessing its coverage.

## Qualification

- `scripts/research/qualify-qc-coverage.mjs`: real MCP report counted 120 frames, matching independent ffprobe full decode. A four-second file containing one second of video reported 30 frames. An empty selected range failed with no new report. Saved readback retained the coverage. Evidence: `.avid-mcp-analysis/qc-coverage-377ded63-46bd-4414-a540-b8c85a6e9692/evidence.json`.
- `scripts/research/qualify-qc-streams.mjs`: both selected video streams counted 120 frames, with distinct detector findings; audio-only analysis recorded null video coverage. Evidence: `.avid-mcp-analysis/qc-streams-113a54b1-e5d1-4ff2-ac22-ce8e921ca099/evidence.json`.
- `scripts/research/qualify-sonoma-qc-amount.mjs`: original Sonoma MP4 and prepared MOV each counted 900 frames over [60,90), matching independent ffprobe frame timestamps adjusted by container start. Existing independent audio sample checks still passed. Evidence: `.avid-mcp-analysis/sonoma-qc-amount-61206e10-8e36-4410-9b22-8faaca044138/evidence.json`.

All fixture/source hashes remained unchanged. These checks do not qualify every codec, HDR path, timestamp discontinuity or long-media workload.
