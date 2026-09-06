# Audio timestamp accounting

`avid_media_qc` now includes `audioTiming` for selected audio, alongside `audioCoverage`. It records frame count, sample rate, sample sum, first/end timestamps, gap/overlap sample ticks and the number of adjacent-frame discontinuities. FFmpeg observes the trimmed audio before loudness normalization, with an explicit 1/sampleRate time base. Timestamps are relative to the requested range start; sample-grid rounding still applies to fractional-sample boundaries.

The parser requires sequential frame ordinals, one unchanged sample rate, positive sample counts and safe integer arithmetic. It compares the summed frame samples against the independent astats total and refuses incomplete or inconsistent observations. The bounded decode log limit is 16 MiB; exceeding it fails the operation rather than publishing partial timing. Saved-report reads validate the accounting and selected stream/sample metadata. Historical reports without `audioTiming` remain readable; absence means not recorded, while null means no audio was selected.

These are adjacent-frame measurements. Overlap counts are not a union-coverage calculation, and gaps do not establish audible silence. Repeated/backward timestamps, decoder behavior and source discontinuities need review. The measurements neither correct a clock nor certify synchronization, media handles or delivery compliance.

The Sonoma [60,90) experiment compares QC against independently clipped FFprobe frame timestamps and PCM sample counts, then reads the saved report through MCP. The original media has 1,443,456 decoded samples, 320 gap ticks, 3,776 overlap ticks and six discontinuities, spanning [0,1440000) at 48 kHz. The prepared source has 1,440,000 samples and zero gaps/overlaps. Both source hashes remain unchanged. Reproduce with `node scripts/research/qualify-sonoma-qc-amount.mjs` after building.

Evidence: `.avid-mcp-analysis/sonoma-qc-amount-c0ad7c43-495b-48d6-afe1-e4c5f39efc6d/evidence.json`. All independent timing fields and saved MCP readback matched. Unit tests cover gaps, overlaps, negative initial ticks, repeated frames, missing/reordered/invalid observations and inconsistent stored reports.
