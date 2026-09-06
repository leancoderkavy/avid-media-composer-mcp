# Audio content offset research

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

The worker records exact selected sample offsets/counts, PCM hashes, the extraction filter, and adjacent decoded timestamp gaps/overlaps. FFmpeg's observed timestamps are retained without claiming that they map to an Avid source timecode. `sourceClockOffset` is always null, including when content has a strong candidate. Poll `avid_analysis_job_status` and retain the job ID; `avid_analysis_job_history` and a fresh session can read the saved terminal result without reanalysis. `avid_cancel_analysis_job` uses the existing worker cancellation path. Normal completion/failure removes temporary PCM; abrupt termination may leave an owned scratch directory and does not prove complete artifact cleanup.

The real stdio experiment `scripts/research/qualify-audio-sync-mcp.mjs` compared first-channel Sonoma windows at decoded-sample starts 0 and 1.23 seconds. It returned a -1.23-second content candidate, rejected an unavailable channel in a separate job, and read the identical saved result through a fresh MCP connection. Source hashes remained unchanged. Evidence: `.avid-mcp-analysis/audio-sync-mcp-7cea567c-b2b6-4a9d-ac3c-6addecfeedfd/evidence.json`.

This source also demonstrated why content offsets must not become clock edits: the reference window reported 10 timestamp discontinuities and 8192 overlapping samples; comparison reported 11 and 8384. Each contained exactly 1,440,000 decoded samples at 48 kHz. Neither result claimed a source-clock offset.

## Off-grid and degradation experiments

`scripts/research/qualify-audio-sync-variants.mjs` creates deterministic derivatives of the same decoded Sonoma channel. Delays of 1.231, 1.235 and 1.239 seconds produced candidates within 5 ms of their known delays. Noise amplitudes 0.005 and 0.02 after gain reduction to 0.25 retained candidates; amplitude 0.1 returned a weak match. A 32 kbit/s MP3 encode/decode round trip retained a candidate within 5 ms. These are observed fixture errors, not promised precision for other material.

The initial 0.5% speed-change diagnostic returned a strong whole-window candidate (correlation 0.8367) even though content offset varied. Evidence is retained in `.avid-mcp-analysis/audio-sync-variants-19eccb5a-227a-4119-bb51-fa27c187ad69/observations.json`. Adding window checks exposed strong offsets of 1.18 and 1.13 seconds and now returns `inconsistent_offset`. The first window was weak; the estimator does not claim all three windows verified. A first implementation requiring all three windows also rejected the clean half-bin delay because the first window's correlation was only 0.6725; the current rule requires at least two strong windows and exposes partial support rather than concealing that uncertainty.

Passing revised observations are in `.avid-mcp-analysis/audio-sync-variants-2c309749-e808-40a9-9ee2-a2d60a059c2c/evidence.json`. The real MCP job and reconnect experiment passed again after the consistency change in `.avid-mcp-analysis/audio-sync-mcp-ab3a2be8-f5ad-4ca8-a90c-9a3a8a41c70a/evidence.json`. Independent recordings and general drift accuracy remain unqualified.

## Remaining qualification

Qualify independent recordings, noise/compression, non-window-aligned delays, sparse/repeated sounds, clock drift, and multichannel behavior before broad accuracy claims. Exercise cancellation during this specific decoder's active FFmpeg process and abrupt scratch cleanup; the job framework alone is not that operation-specific evidence. Native Avid sync edits and lip-sync verification remain separate work. No npm release is claimed.
