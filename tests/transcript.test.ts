import { describe, expect, it } from "vitest";
import { compareTranscriptRevisions, inspectTranscriptRevision } from "../src/analysis/transcript.js";

describe("local transcript revision QC", () => {
  it("reports gaps, overlaps, confidence, and speakers without echoing transcript text", () => {
    const qc = inspectTranscriptRevision({
      tokens: [
        { text: "private dialogue", startSeconds: 0, endSeconds: 0.5, speaker: "A", confidence: 0.9 },
        { text: "still private", startSeconds: 1.2, endSeconds: 1.5, speaker: "B", confidence: 0.4 },
        { text: "overlap", startSeconds: 1.4, endSeconds: 1.7, speaker: "B" },
      ],
    });
    expect(qc).toMatchObject({ tokenCount: 3, gapCount: 1, overlapCount: 1, lowConfidenceCount: 1, speakerLabelCount: 2 });
    expect(JSON.stringify(qc)).not.toContain("private dialogue");
  });

  it("compares matching tokens by aggregate timing and speaker changes", () => {
    const comparison = compareTranscriptRevisions(
      { tokens: [
        { text: "Hello", startSeconds: 0, endSeconds: 0.3, speaker: "A" },
        { text: "world", startSeconds: 0.3, endSeconds: 0.8, speaker: "A" },
      ] },
      { tokens: [
        { text: "hello", startSeconds: 0.1, endSeconds: 0.4, speaker: "B" },
        { text: "new", startSeconds: 0.4, endSeconds: 0.6, speaker: "B" },
        { text: "world", startSeconds: 0.6, endSeconds: 1.1, speaker: "A" },
      ] },
    );
    expect(comparison).toMatchObject({ commonTokenCount: 2, insertedTokenCount: 1, removedTokenCount: 0, timingChangedTokenCount: 2, speakerChangedTokenCount: 1 });
    expect(JSON.stringify(comparison)).not.toContain("hello");
  });

  it("enforces a bounded comparison budget", () => {
    const revision = { tokens: Array.from({ length: 3 }, (_, index) => ({ text: String(index), startSeconds: index, endSeconds: index + 0.5 })) };
    expect(() => compareTranscriptRevisions(revision, revision, { maxComparisonCells: 4 })).toThrow(/bounded-work/i);
  });

  it("rejects invalid text, timing, confidence, and QC limits", () => {
    expect(() => inspectTranscriptRevision({ tokens: [{ text: "  ", startSeconds: 0, endSeconds: 1 }] })).toThrow(/non-empty/);
    expect(() => inspectTranscriptRevision({ tokens: [{ text: "x", startSeconds: -1, endSeconds: 1 }] })).toThrow(/timing/);
    expect(() => inspectTranscriptRevision({ tokens: [{ text: "x", startSeconds: 0, endSeconds: Number.NaN }] })).toThrow(/timing/);
    expect(() => inspectTranscriptRevision({ tokens: [{ text: "x", startSeconds: 0, endSeconds: 1, confidence: 2 }] })).toThrow(/confidence/);
    expect(() => inspectTranscriptRevision({ tokens: [], }, { gapThresholdSeconds: -1 })).toThrow(/gapThresholdSeconds/);
    expect(() => compareTranscriptRevisions({ tokens: [] }, { tokens: [] }, { maxComparisonCells: 0 })).toThrow(/positive integer/);
  });

  it("reports invalid durations and follows both LCS backtracking directions", () => {
    const qc = inspectTranscriptRevision({ tokens: [{ text: "x", startSeconds: 2, endSeconds: 1, speaker: " " }] });
    expect(qc).toMatchObject({ invalidDurationCount: 1, speakerLabelCount: 0 });
    const comparison = compareTranscriptRevisions(
      { tokens: [{ text: "a", startSeconds: 0, endSeconds: 1 }, { text: "b", startSeconds: 1, endSeconds: 2 }] },
      { tokens: [{ text: "b", startSeconds: 1, endSeconds: 2 }, { text: "c", startSeconds: 2, endSeconds: 3 }] },
    );
    expect(comparison).toMatchObject({ commonTokenCount: 1, insertedTokenCount: 1, removedTokenCount: 1 });
  });
});
