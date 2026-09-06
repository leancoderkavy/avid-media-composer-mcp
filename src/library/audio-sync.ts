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
  if (!Number.isInteger(sampleRate) || sampleRate < 100 || sampleRate > 192000 || sampleRate % BINS_PER_SECOND !== 0)
    throw new Error("Sample rate must be a supported multiple of 100");
  if (!pcm.length || pcm.length > sampleRate * 60) throw new Error("PCM must contain at most 60 seconds");
  const width = sampleRate / BINS_PER_SECOND;
  const result = new Float64Array(Math.floor(pcm.length / width));
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i]!;
    if (!Number.isFinite(value) || Math.abs(value) > 1) throw new Error("PCM must be finite and normalized to [-1, 1]");
    sum += value * value;
    if ((i + 1) % width === 0) { result[Math.floor(i / width)] = Math.sqrt(sum / width); sum = 0; }
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
  const scores: AudioOffsetCandidate[] = [];
  for (let lag = -limit; lag <= limit; lag++) {
    const start = Math.max(0, -lag), end = Math.min(reference.length, comparison.length - lag), count = end - start;
    if (count < minOverlap) continue;
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
  const best = peaks[0] ?? null, competitor = peaks[1] ?? null;
  const margin = best && competitor ? best.correlation - competitor.correlation : null;
  const status = !best ? "insufficient_signal" : best.correlation < 0.8 ? "weak_match"
    : Math.abs(best.lagBins) === limit ? "search_boundary"
    : margin !== null && margin < 0.05 ? "ambiguous" : "candidate";
  return {status, best, alternatives: peaks.slice(1), peakMargin: margin, resolutionSeconds: 0.01,
    searchedOffsetSeconds: limit / BINS_PER_SECOND, minimumOverlapSeconds: minOverlap / BINS_PER_SECOND,
    reviewRequired: true, verifiedSync: false,
    convention: "Positive offset means matching content occurs later in comparison; reference[i] matches comparison[i + lag]. Offsets are relative to decoded window starts.",
    limitations: ["RMS envelope comparison, not sample-accurate waveform alignment", "Repeated or unrelated sounds can produce false matches",
      "No clock drift, timestamp discontinuity, channel selection, source timecode or audio/video lip-sync validation",
      "Alternative peaks exclude a 100 ms neighborhood; thresholds are uncalibrated heuristics"]};
}
