# Audio timestamp accounting

`avid_media_qc` now includes `audioTiming` for selected audio, alongside `audioCoverage`. It records frame count, sample rate, sample sum, first/end timestamps, gap/overlap sample ticks and the number of adjacent-frame discontinuities. FFmpeg observes the trimmed audio before loudness normalization, with an explicit 1/sampleRate time base. Timestamps are relative to the requested range start; sample-grid rounding still applies to fractional-sample boundaries.

The parser requires sequential frame ordinals, one unchanged sample rate, positive sample counts and safe integer arithmetic. It compares the summed frame samples against the independent astats total and refuses incomplete or inconsistent observations. The bounded decode log limit is 16 MiB; exceeding it fails the operation rather than publishing partial timing. Saved-report reads validate the accounting and selected stream/sample metadata. Historical reports without `audioTiming` remain readable; absence means not recorded, while null means no audio was selected.

These are adjacent-frame measurements. Overlap counts are not a union-coverage calculation, and gaps do not establish audible silence. Repeated/backward timestamps, decoder behavior and source discontinuities need review. The measurements neither correct a clock nor certify synchronization, media handles or delivery compliance.

The Sonoma [60,90) experiment compares QC against independently clipped FFprobe frame timestamps and PCM sample counts, then reads the saved report through MCP. The original media has 1,443,456 decoded samples, 320 gap ticks, 3,776 overlap ticks and six discontinuities, spanning [0,1440000) at 48 kHz. The prepared source has 1,440,000 samples and zero gaps/overlaps. Both source hashes remain unchanged. Reproduce with `node scripts/research/qualify-sonoma-qc-amount.mjs` after building.

Evidence: `.avid-mcp-analysis/sonoma-qc-amount-c0ad7c43-495b-48d6-afe1-e4c5f39efc6d/evidence.json`. All independent timing fields and saved MCP readback matched. Unit tests cover gaps, overlaps, negative initial ticks, repeated frames, missing/reordered/invalid observations and inconsistent stored reports.

## Stream selection and delayed audio

`qualify-qc-streams.mjs` additionally exercises two video and two audio streams, explicit audio-only/video-only selection and saved timing readback. A separate generated two-audio-track PCM fixture delays only the second track by 250 ms. For [0,4), the first track reports 192,000 samples at ticks [0,192000), while the delayed track reports 180,000 at [12000,192000). For [1.25,4), each reports 132,000 samples at [0,132000). These expected values follow from the generated duration/delay and 48 kHz rate. No internal gaps or overlaps were reported in these fixtures.

Selecting the delayed track over [0,0.1) fails and leaves the report-file inventory unchanged. Video-only selection returns null audio timing and audio coverage. Both generated input hashes remain unchanged. Evidence: `.avid-mcp-analysis/qc-streams-1ee0a6b6-0e14-424a-b79d-8553ed9df39e/evidence.json`. Actual MCP execution and script syntax checks passed. This qualifies the observed selections and offsets, not arbitrary codecs, fractional-sample boundaries, timestamp origins or synchronization.
