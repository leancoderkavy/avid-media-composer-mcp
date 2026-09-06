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
    expect(() => audioEnvelope(new Float32Array([0]), 44101)).toThrow();
  });
});
