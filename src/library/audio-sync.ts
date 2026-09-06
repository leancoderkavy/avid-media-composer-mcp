/** Content-offset candidates only. Positive lag means the matching content occurs
 * later in comparison than reference: reference[i] matches comparison[i + lag]. */
export interface AudioOffsetCandidate {
  lagBins: number;
  offsetSeconds: number;
  correlation: number;
  overlapSeconds: number;
}

const BINS_PER_SECOND = 100;
const MAX_BINS = 6000;

/** Fixed 10 ms RMS windows of normalized mono PCM. Partial final windows are
 * discarded; callers must retain decoding/stream/time-origin provenance. */
export function audioEnvelope(pcm: Float32Array, sampleRate: number): Float64Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 100 || sampleRate > 192000)
    throw new Error("Sample rate must be an integer from 100 to 192000");
  if (!pcm.length || pcm.length > sampleRate * 60) throw new Error("PCM must contain at most 60 seconds");
  const result = new Float64Array(Math.floor(pcm.length * BINS_PER_SECOND / sampleRate));
  // Round each absolute 10 ms boundary up to a sample. Never accumulate a
  // rounded width: fractional-rate windows must not drift over long inputs.
  let bin = 0, start = 0, end = Math.ceil(sampleRate / BINS_PER_SECOND), sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i]!;
    if (!Number.isFinite(value) || Math.abs(value) > 1) throw new Error("PCM must be finite and normalized to [-1, 1]");
    sum += value * value;
    if (bin < result.length && i + 1 === end) {
      result[bin++] = Math.sqrt(sum / (end - start)); sum = 0; start = end;
      end = Math.ceil((bin + 1) * sampleRate / BINS_PER_SECOND);
    }
  }
  return result;
}

/** Direct overlap-normalized, mean-centered envelope correlation. Thresholds are
 * conservative heuristics, not calibrated probabilities or accuracy guarantees. */
export function estimateAudioOffset(reference: Float64Array, comparison: Float64Array, maxOffsetSeconds = 5) {
  if (!Number.isFinite(maxOffsetSeconds) || maxOffsetSeconds < 0.01 || maxOffsetSeconds > 5)
    throw new Error("Offset search must be between 0.01 and 5 seconds");
  for (const values of [reference, comparison]) {
    if (values.length < 200 || values.length > MAX_BINS) throw new Error("Each envelope must contain 2 to 60 seconds at 100 Hz");
    for (const value of values) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid RMS envelope");
  }
  const limit = Math.floor(maxOffsetSeconds * BINS_PER_SECOND);
  const minOverlap = Math.max(100, Math.ceil(Math.min(reference.length, comparison.length) / 2));
  const rank = (windowStart: number, windowEnd: number, requiredOverlap: number) => {
  const scores: AudioOffsetCandidate[] = [];
  for (let lag = -limit; lag <= limit; lag++) {
    const start = Math.max(windowStart, -lag), end = Math.min(windowEnd, comparison.length - lag), count = end - start;
    if (count < requiredOverlap) continue;
    let x = 0, y = 0;
    for (let i = start; i < end; i++) { x += reference[i]!; y += comparison[i + lag]!; }
    x /= count; y /= count;
    let xx = 0, yy = 0, xy = 0;
    for (let i = start; i < end; i++) {
      const a = reference[i]! - x, b = comparison[i + lag]! - y;
      xx += a * a; yy += b * b; xy += a * b;
    }
    if (xx / count < 1e-10 || yy / count < 1e-10) continue;
    scores.push({lagBins: lag, offsetSeconds: lag / BINS_PER_SECOND,
      correlation: Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))), overlapSeconds: count / BINS_PER_SECOND});
  }
  scores.sort((a, b) => b.correlation - a.correlation || Math.abs(a.lagBins) - Math.abs(b.lagBins) || a.lagBins - b.lagBins);
  const peaks: AudioOffsetCandidate[] = [];
  for (const score of scores) {
    if (peaks.every(peak => Math.abs(peak.lagBins - score.lagBins) > 10)) peaks.push(score);
    if (peaks.length === 5) break;
  }
  return peaks;
  };
  const peaks = rank(0, reference.length, minOverlap);
  const best = peaks[0] ?? null, competitor = peaks[1] ?? null;
  const margin = best && competitor ? best.correlation - competitor.correlation : null;
  const initialStatus = !best ? "insufficient_signal" : best.correlation < 0.8 ? "weak_match"
    : Math.abs(best.lagBins) === limit ? "search_boundary"
    : margin !== null && margin < 0.05 ? "ambiguous" : "candidate";
  // Three independently searched windows expose changing offsets that a high
  // whole-clip correlation can hide. This diagnoses inconsistency, not its cause.
  const windows = [];
  if (initialStatus === "candidate" && Math.min(reference.length, comparison.length) >= 600) {
    for (let n = 0; n < 3; n++) {
      const start = Math.floor(reference.length * n / 3), end = Math.floor(reference.length * (n + 1) / 3);
      const ranked = rank(start, end, Math.max(100, Math.ceil((end - start) * 0.75)));
      const first = ranked[0] ?? null, second = ranked[1] ?? null;
      const peakMargin = first && second ? first.correlation - second.correlation : null;
      windows.push({startSeconds: start / BINS_PER_SECOND, endSeconds: end / BINS_PER_SECOND, best: first, peakMargin,
        supported: !!first && first.correlation >= 0.8 && Math.abs(first.lagBins) < limit && (peakMargin === null || peakMargin >= 0.05)});
    }
  }
  const supported = windows.filter(window => window.supported).map(window => window.best!.lagBins);
  const spreadBins = supported.length >= 2 ? Math.max(...supported) - Math.min(...supported) : null;
  const deviationBins = best && supported.length ? Math.max(...supported.map(lag => Math.abs(lag - best.lagBins))) : null;
  const consistency = {status: windows.length === 0 ? "not_assessed" : spreadBins === null ? "insufficient_support" : spreadBins > 3 || deviationBins! > 3 ? "inconsistent" : supported.length === 3 ? "consistent" : "partial_support",
    windows, supportedWindows: supported.length, spreadSeconds: spreadBins === null ? null : spreadBins / BINS_PER_SECOND, maximumSpreadSeconds: 0.03,
    maximumDeviationFromBestSeconds: deviationBins === null ? null : deviationBins / BINS_PER_SECOND,
    meaning: "Three independently searched reference windows with at least 75% overlap; at least two strong unambiguous windows must agree. Partial support leaves another window unverified. Disagreement can reflect drift, edits, repetition or noise; it does not measure or correct a clock rate. Only assessed for otherwise strong candidates with at least six seconds per input."};
  const status = initialStatus !== "candidate" ? initialStatus : consistency.status === "inconsistent" ? "inconsistent_offset"
    : consistency.status === "insufficient_support" ? "insufficient_window_support" : "candidate";
  return {status, best, alternatives: peaks.slice(1), peakMargin: margin, resolutionSeconds: 0.01,
    consistency,
    searchedOffsetSeconds: limit / BINS_PER_SECOND, minimumOverlapSeconds: minOverlap / BINS_PER_SECOND,
    reviewRequired: true, verifiedSync: false,
    convention: "Positive offset means matching content occurs later in comparison; reference[i] matches comparison[i + lag]. Offsets are relative to decoded window starts.",
    limitations: ["RMS envelope comparison, not sample-accurate waveform alignment", "Repeated or unrelated sounds can produce false matches",
      "No clock drift, timestamp discontinuity, channel selection, source timecode or audio/video lip-sync validation",
      "Alternative peaks exclude a 100 ms neighborhood; thresholds are uncalibrated heuristics"]};
}
