# Audio content offset research

`src/library/audio-sync.ts` adds a bounded content-offset estimator for the roadmap's sync-analysis work. It is not yet registered as an MCP tool. It accepts explicitly supplied 100 Hz RMS envelopes covering 2–60 seconds and searches at most ±5 seconds. The PCM envelope helper accepts normalized mono samples, computes complete 10 ms RMS windows and discards an incomplete last window.

For each lag, correlation is mean-centered and normalized over the overlapping portion, requiring at least one second and half of the shorter input. Positive offset means matching content occurs later in the comparison: `reference[i]` matches `comparison[i + lag]`. This explicit convention follows the positive-displacement form in [SciPy's correlation-lag definition](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.correlation_lags.html); no SciPy code or dependency is included.

Results distinguish insufficient signal, weak match, ambiguous alternatives, a best match at the search boundary, and a candidate needing review. Correlation 0.8 and a 0.05 margin over alternatives outside a 100 ms neighborhood are uncalibrated heuristics, not confidence probabilities. The five returned separated peaks expose competing offsets. Silence and constant envelopes do not yield a candidate. RMS comparison tolerates polarity inversion but loses waveform detail; nearby competing offsets can fall inside the excluded neighborhood.

## Evidence

`scripts/research/qualify-audio-sync.mjs` decodes the first channel of the first audio stream from the protected Sonoma preview MP4, resamples to 8 kHz, selects exactly 240,000 samples and constructs a controlled comparison with 1.23 seconds of leading silence, polarity inversion and gain 0.25. The original source hash is checked before and after. No media file is edited.

The first experiment using output `-t 30` returned 241,365 samples instead of 240,000 and failed its sample-count assertion. That result is not accepted as a 30-second sample window. The revised recipe uses `atrim=end_sample=240000` after resampling and explicitly resets decoded timestamps for this derived experiment. This is a sample-domain test, not proof of source-clock continuity.

The passing run is `.avid-mcp-analysis/audio-sync-468cd53f-bc2e-4696-8f44-83a9d263acef/evidence.json`: both directions recovered ±1.23 seconds with correlation 1 and 30 seconds of overlap. Silence and synthetic repeated-envelope controls produced insufficient-signal and ambiguous results. Unit coverage additionally checks search boundaries, unrelated content, minimum overlap, malformed PCM, and bounded inputs.

## Remaining integration and qualification

Expose comparison through the MCP with explicit media IDs, stream/channel selectors, source-hash checks before/after, bounded decoding, recorded sample/time origins, saved provenance, and cancellation through the analysis job infrastructure. Do not infer source-clock offsets from concatenated decoded samples when PTS is discontinuous. Qualify independent recordings, noise/compression, non-window-aligned delays, sparse/repeated sounds, clock drift, and multichannel behavior before broad accuracy claims. Native Avid sync edits and lip-sync verification remain separate work. No new MCP tool or npm release is claimed by this research.
