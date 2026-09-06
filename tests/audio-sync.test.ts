import {describe, expect, it} from "vitest";
import {audioEnvelope, estimateAudioOffset} from "../src/library/audio-sync.js";

function signal(length = 2000) {
  let state = 42;
  return Float64Array.from({length}, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return 0.02 + state / 2 ** 32 * 0.7; });
}
describe("audio content offset candidates", () => {
  it("uses comparison-minus-reference offsets, with gain and polarity independent RMS", () => {
    const source = signal(), delayed = new Float64Array(source.length + 123);
    delayed.set(source.map(value => value * 0.25), 123);
    const forward = estimateAudioOffset(source, delayed), reverse = estimateAudioOffset(delayed, source);
    expect(forward.status).toBe("candidate"); expect(forward.best?.offsetSeconds).toBe(1.23);
    expect(reverse.status).toBe("candidate"); expect(reverse.best?.offsetSeconds).toBe(-1.23);
    expect(forward.best?.correlation).toBeCloseTo(1);
    const pcm = Float32Array.from([0.5, -0.5, 0.25, -0.25]);
    expect([...audioEnvelope(pcm, 200)]).toEqual([0.5, 0.25]);
  });
  it("retains ambiguity for repeated content and refuses silence or constant envelopes", () => {
    const repeating = Float64Array.from({length: 2000}, (_, i) => (i % 40) / 40);
    expect(estimateAudioOffset(repeating, repeating).status).toBe("ambiguous");
    for (const level of [0, 0.5, 1e-7]) {
      const flat = new Float64Array(2000).fill(level);
      expect(estimateAudioOffset(flat, flat).status).toBe("insufficient_signal");
    }
  });
  it("flags a best match at the search boundary instead of accepting it", () => {
    const source = signal(), delayed = new Float64Array(2500); delayed.set(source, 500);
    expect(estimateAudioOffset(source, delayed).status).toBe("search_boundary");
  });
  it("reports weak unrelated matches and enforces useful overlap", () => {
    const source = signal(), other = signal(4000).slice(2000);
    expect(estimateAudioOffset(source, other).status).toBe("weak_match");
    const result = estimateAudioOffset(source, source.slice(500));
    expect(result.best?.offsetSeconds).toBe(-5);
    expect(result.best!.overlapSeconds).toBeGreaterThanOrEqual(result.minimumOverlapSeconds);
  });
  it("bounds work and rejects invalid samples rather than inventing a result", () => {
    expect(() => estimateAudioOffset(signal(6001), signal())).toThrow();
    expect(() => estimateAudioOffset(signal(199), signal())).toThrow();
    expect(() => estimateAudioOffset(signal(), signal(), Infinity)).toThrow();
    expect(() => estimateAudioOffset(signal(), signal(), 6)).toThrow();
    const invalid = signal(); invalid[1] = NaN;
    expect(() => estimateAudioOffset(invalid, signal())).toThrow();
    expect(() => audioEnvelope(new Float32Array([2]), 100)).toThrow();
    expect(() => audioEnvelope(new Float32Array([NaN]), 100)).toThrow();
    for (const rate of [99, 192001, 22050.5, NaN]) expect(() => audioEnvelope(new Float32Array([0]), rate)).toThrow();
  });
  it("covers fractional 10 ms sample boundaries without cumulative drift or fractional tail counts", () => {
    const impulse = new Float32Array(441); impulse[220] = 1;
    const bins = audioEnvelope(impulse, 22050);
    expect(bins.length).toBe(2); expect(bins[0]).toBeCloseTo(1 / Math.sqrt(221), 12); expect(bins[1]).toBe(0);
    expect(audioEnvelope(new Float32Array(220), 22050).length).toBe(0);
    expect(audioEnvelope(new Float32Array(221), 22050).length).toBe(1);
    for (const rate of [11025, 22050, 44101]) {
      const minute = new Float32Array(rate * 60).fill(0.5);
      const result = audioEnvelope(minute, rate);
      expect(result.length).toBe(6000); expect(result.every(value => value === 0.5)).toBe(true);
    }
    const tail = new Float32Array(442); tail[441] = NaN;
    expect(() => audioEnvelope(tail, 22050)).toThrow("finite");
  });
  it("withholds a constant-offset candidate when strong windows disagree", () => {
    const raw = signal(6000), source = Float64Array.from(raw, (_, i) => {
      let sum = 0; for (let n = 0; n < 20; n++) sum += raw[Math.min(raw.length - 1, i + n)]!;
      return sum / 20;
    });
    const comparison = Float64Array.from(source, (_, i) => source[Math.max(0, i - Math.floor(i / 2000) * 5)]!);
    const result = estimateAudioOffset(source, comparison);
    expect(result.best!.correlation).toBeGreaterThan(0.8);
    expect(result.status).toBe("inconsistent_offset");
    expect(result.consistency.supportedWindows).toBe(3);
    expect(result.consistency.spreadSeconds).toBe(0.1);
  });
  it("distinguishes partial support, insufficient support and unassessed short clips", () => {
    const source = signal(3000); source.fill(0.1, 0, 1000);
    const partial = estimateAudioOffset(source, source);
    expect(partial.status).toBe("candidate"); expect(partial.consistency.status).toBe("partial_support");
    expect(partial.consistency.supportedWindows).toBe(2);
    expect(partial.consistency.maximumDeviationFromBestSeconds).toBe(0);
    source.fill(0.1, 1000, 2000);
    const insufficient = estimateAudioOffset(source, source);
    expect(insufficient.best!.correlation).toBeCloseTo(1);
    expect(insufficient.status).toBe("insufficient_window_support");
    expect(insufficient.consistency.supportedWindows).toBe(1);
    const short = signal(200);
    expect(estimateAudioOffset(short, short).consistency.status).toBe("not_assessed");
  });
});
