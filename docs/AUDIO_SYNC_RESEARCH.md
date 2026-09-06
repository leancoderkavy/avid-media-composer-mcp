# Audio content offset research

## Seven-export stereo qualification

`node scripts/research/qualify-audio-sync-matrix.mjs` tests all seven explicitly named original Sonoma exports serially through the built stdio MCP server. Each file is indexed, then both audio channels are individually compared using 30-second decoded windows starting at 0 and 1.23 seconds. The expected comparison-relative offset is -1.23 seconds. Every file's completed results are read through a fresh MCP connection, automatic replay is checked false, and its SHA-256 is checked before and after.

All 14 jobs passed on 2026-09-06, including both 4K exports and the 2.68 GB file. Every result returned `candidate`, -1.23 seconds and three supported, consistent windows; every selected channel was 48 kHz. All source hashes and reconnected results were unchanged. Full observations and tool responses are retained under `.avid-mcp-analysis/audio-sync-matrix-b97ca018-5052-45fd-b6d0-b9c0370abdaf/`, with acceptance in `evidence.json`. The script preserves observations before checking final acceptance, including failed jobs.

This broadens actual export/channel coverage for same-source content offsets. It does not qualify independent microphones, arbitrary sample rates, full-duration drift, source-clock alignment, audio/video lip sync or native editing. Production code is unchanged; build, harness syntax and actual matrix execution passed against the implementation whose resulting-main CI/CodeQL passed at `b63d1ea`.

`src/library/audio-sync.ts` adds a bounded content-offset estimator for the roadmap's sync-analysis work. It accepts explicitly supplied 100 Hz RMS envelopes covering 2–60 seconds and searches at most ±5 seconds. The PCM envelope helper accepts normalized mono samples, computes complete 10 ms RMS windows and discards an incomplete last window. It is available through `avid_start_analysis_job` with `kind: "audio_sync"`.

For each lag, correlation is mean-centered and normalized over the overlapping portion, requiring at least one second and half of the shorter input. Positive offset means matching content occurs later in the comparison: `reference[i]` matches `comparison[i + lag]`. This explicit convention follows the positive-displacement form in [SciPy's correlation-lag definition](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.correlation_lags.html); no SciPy code or dependency is included.

Results distinguish insufficient signal, weak match, ambiguous alternatives, a best match at the search boundary, and a candidate needing review. Correlation 0.8 and a 0.05 margin over alternatives outside a 100 ms neighborhood are uncalibrated heuristics, not confidence probabilities. The five returned separated peaks expose competing offsets. Silence and constant envelopes do not yield a candidate. RMS comparison tolerates polarity inversion but loses waveform detail; nearby competing offsets can fall inside the excluded neighborhood.

Otherwise strong candidates with at least six seconds in each input also receive three independently searched reference-window comparisons. Each requires 75% overlap; at least two windows must have correlation ≥0.8, a ≥0.05 separated-peak margin when an alternative exists and an interior search peak. A spread greater than 30 ms among supported windows, or a deviation greater than 30 ms from the overall best offset, returns `inconsistent_offset`; fewer than two supported windows returns `insufficient_window_support`. Two agreeing windows give explicit `partial_support` and leave the third unverified. Shorter or already weak/ambiguous inputs have consistency `not_assessed`. These are content-consistency heuristics, not a calibrated drift detector or clock correction.

## Evidence

`scripts/research/qualify-audio-sync.mjs` decodes the first channel of the first audio stream from the protected Sonoma preview MP4, resamples to 8 kHz, selects exactly 240,000 samples and constructs a controlled comparison with 1.23 seconds of leading silence, polarity inversion and gain 0.25. The original source hash is checked before and after. No media file is edited.

The first experiment using output `-t 30` returned 241,365 samples instead of 240,000 and failed its sample-count assertion. That result is not accepted as a 30-second sample window. The revised recipe uses `atrim=end_sample=240000` after resampling and explicitly resets decoded timestamps for this derived experiment. This is a sample-domain test, not proof of source-clock continuity.

The passing run is `.avid-mcp-analysis/audio-sync-468cd53f-bc2e-4696-8f44-83a9d263acef/evidence.json`: both directions recovered ±1.23 seconds with correlation 1 and 30 seconds of overlap. Silence and synthetic repeated-envelope controls produced insufficient-signal and ambiguous results. Unit coverage additionally checks search boundaries, unrelated content, minimum overlap, malformed PCM, and bounded inputs.

## MCP usage and provenance

Index both media files first, then call `avid_start_analysis_job`:

```json
{
  "job": {
    "kind": "audio_sync",
    "options": {
      "reference": {"id": "<indexed reference SHA-256>", "stream": 1, "channel": 0, "startSeconds": 0, "durationSeconds": 30},
      "comparison": {"id": "<indexed comparison SHA-256>", "stream": 1, "channel": 0, "startSeconds": 1.23, "durationSeconds": 30},
      "maxOffsetSeconds": 5
    }
  }
}
```

Stream indices are absolute ffprobe indices; channels are zero-based within the selected audio stream. Both are required. `startSeconds` selects a sample position from the decoded stream beginning, rounded down at its sample rate, with a maximum of 600 seconds. It does not seek to a container timestamp. Duration is 2–60 seconds. Supported sample rates are multiples of 100 from 100–192000 Hz. Out-of-range selections, incomplete sample coverage, invalid timing logs, out-of-range PCM, decoding failures, and source-hash changes refuse a result.

The worker records exact selected sample offsets/counts, PCM hashes, the extraction filter, and adjacent decoded timestamp gaps/overlaps. FFmpeg's observed timestamps are retained without claiming that they map to an Avid source timecode. `sourceClockOffset` is always null, including when content has a strong candidate. Poll `avid_analysis_job_status` and retain the job ID; `avid_analysis_job_history` and a fresh session can read the saved terminal result without reanalysis. `avid_cancel_analysis_job` uses the existing worker cancellation path. PCM now travels through a bounded binary pipe in memory, with no decoder scratch files on normal or cancelled runs.

The real stdio experiment `scripts/research/qualify-audio-sync-mcp.mjs` compared first-channel Sonoma windows at decoded-sample starts 0 and 1.23 seconds. It returned a -1.23-second content candidate, rejected an unavailable channel in a separate job, and read the identical saved result through a fresh MCP connection. Source hashes remained unchanged. Evidence: `.avid-mcp-analysis/audio-sync-mcp-7cea567c-b2b6-4a9d-ac3c-6addecfeedfd/evidence.json`.

This source also demonstrated why content offsets must not become clock edits: the reference window reported 10 timestamp discontinuities and 8192 overlapping samples; comparison reported 11 and 8384. Each contained exactly 1,440,000 decoded samples at 48 kHz. Neither result claimed a source-clock offset.

## Off-grid and degradation experiments

`scripts/research/qualify-audio-sync-variants.mjs` creates deterministic derivatives of the same decoded Sonoma channel. Delays of 1.231, 1.235 and 1.239 seconds produced candidates within 5 ms of their known delays. Noise amplitudes 0.005 and 0.02 after gain reduction to 0.25 retained candidates; amplitude 0.1 returned a weak match. A 32 kbit/s MP3 encode/decode round trip retained a candidate within 5 ms. These are observed fixture errors, not promised precision for other material.

The initial 0.5% speed-change diagnostic returned a strong whole-window candidate (correlation 0.8367) even though content offset varied. Evidence is retained in `.avid-mcp-analysis/audio-sync-variants-19eccb5a-227a-4119-bb51-fa27c187ad69/observations.json`. Adding window checks exposed strong offsets of 1.18 and 1.13 seconds and now returns `inconsistent_offset`. The first window was weak; the estimator does not claim all three windows verified. A first implementation requiring all three windows also rejected the clean half-bin delay because the first window's correlation was only 0.6725; the current rule requires at least two strong windows and exposes partial support rather than concealing that uncertainty.

Passing revised observations are in `.avid-mcp-analysis/audio-sync-variants-2c309749-e808-40a9-9ee2-a2d60a059c2c/evidence.json`. The real MCP job and reconnect experiment passed again after the consistency change in `.avid-mcp-analysis/audio-sync-mcp-ab3a2be8-f5ad-4ca8-a90c-9a3a8a41c70a/evidence.json`. Independent recordings and general drift accuracy remain unqualified.

## Remaining qualification

Qualify independent recordings, broader noise/compression, sparse/repeated sounds, clock drift, and multichannel behavior before broad accuracy claims. Native Avid sync edits and lip-sync verification remain separate work. No npm release is claimed.

## Distinct media IDs, stereo selection and installed package

`scripts/research/qualify-audio-sync-channels.mjs` builds a controlled 44.1 kHz stereo WAV in its owned experiment directory. Channel 0 contains deterministic noise; channel 1 contains the first Sonoma audio channel resampled, inverted/scaled by -0.25 and delayed by exactly 54,684 samples (1.24 seconds). It indexes both files and compares the MP4's absolute stream 1/channel 0 at 48 kHz against the WAV's stream 0/channel 1 at 44.1 kHz. The selected WAV window contains 1,377,684 samples per channel.

Real MCP jobs returned +1.24 seconds and -1.24 seconds in reverse, with 30 seconds of overlap. Selecting noise channel 0 returned a weak match; selecting nonexistent WAV stream 1 produced a failed job. A new MCP session recovered the identical completed result. Original and derived file hashes remained unchanged. Checkout evidence: `.avid-mcp-analysis/audio-sync-channels-6385ac09-0024-405f-982b-fe2a3211856f/evidence.json`.

The script also accepts an absolute installed `dist/index.js` entrypoint. The entire experiment passed again from a fresh development tarball installed outside the checkout, using this host's existing FFmpeg: `.avid-mcp-analysis/audio-sync-channels-8f8a845b-3641-4716-844c-eb03da9a1d01/evidence.json`. Installed `audio-sync.js`, `audio-sync-analysis.js`, `worker.js` and `process.js` hashes matched the tested checkout build. The tarball's SHA-256 is `c79762fc6fb75651dc28bf4c4fd0598cec06ebb5ad24ebcdc4ad00cd9e85fb91`; local installation details are in `.avid-mcp-analysis/audio-sync-installed-runtime.json`.

This is separate-file/channel/rate and fresh-package evidence, not independent microphone recordings, clock drift qualification, arbitrary multichannel layout coverage, clean-machine prerequisite installation, a model-selected workflow, or an npm publication. The development tarball retains the existing package version 1.1.0 and is not claimed to match the public registry release.

## Windows decoder cancellation and retained scratch

`scripts/research/qualify-audio-sync-cancel.mjs` starts a real 60-second Sonoma audio-sync job and a queued two-second job through HTTP MCP. Before explicit cancellation it observes the owned worker and an FFmpeg descendant through Windows process inventory. It then verifies a cancelled terminal record with user cancellation reason, worker exit and successful tree-termination attempt, followed by completion of the queued job. A fresh MCP session reads the same cancelled journal without automatic replay. A subsequent inventory confirms the observed process identities are absent (PID plus creation timestamp, not PID alone). This is observation before/after cancellation, not an atomic process-tree containment guarantee.

Evidence: `.avid-mcp-analysis/audio-sync-cancel-62ef2db2-4a45-4912-bb39-a124436ef050/evidence.json`. Source SHA-256 remained unchanged. The worker's forced termination skipped normal cleanup and left `reference.f32le` and `comparison.f32le`, each 11,520,000 bytes, in the owned experiment's `avid-mcp-library/audio-sync-c4gklS` directory. Their byte counts and hashes stayed stable across reconnect; the harness deliberately retained them as evidence. File completeness is not a successful analysis result, and the cancelled job exposes no result.

That disk-scratch implementation has been replaced by `runBinaryProcess`, which preserves stdout bytes and shares text execution's combined-output/time/tree-termination bounds. The decoder permits at most the expected PCM byte count plus 4 MiB of combined output allowance, then requires the exact PCM count. At the maximum supported range/rate, PCM is 46,080,000 bytes; buffering and conversion can use additional memory. This is not a measured global allocator ceiling. No scratch ownership/recovery machinery is needed for newly decoded PCM because it is never written to a file.

The updated cancellation harness passed with no `audio-sync-*` scratch directory in its owned library: `.avid-mcp-analysis/audio-sync-cancel-37911020-2084-4530-a2c9-a272cc2be904/evidence.json`. The normal real MCP/reconnect experiment also passed with bounded-memory provenance: `.avid-mcp-analysis/audio-sync-mcp-2cef15ce-0a54-48c2-bc10-1c9f48f8ad77/evidence.json`. Earlier retained experiment artifacts remain untouched; this change does not establish automatic reclamation of old files. Never infer deletion authority for arbitrary directories from a prefix or age. Abrupt server loss, global memory/disk budgets and native Mac cancellation remain unqualified.
