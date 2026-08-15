import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeOtio } from "../src/analysis/otio.js";

const fixture = path.resolve("tests/fixtures/sample-project/Timeline.otio");

describe("OTIO analysis", () => {
  it("performs bounded structural analysis and reports conformance risks", async () => {
    const result = await analyzeOtio(fixture);

    expect(result).toMatchObject({
      rootSchema: "Timeline",
      valid: true,
      analysisTruncated: false,
    });
    expect(result.counts).toMatchObject({ Timeline: 2, Track: 2, Clip: 2, Transition: 1 });
    expect(result.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Retimed external clip", mediaReferenceSchema: "ExternalReference" }),
      ]),
    );
    expect(result.mediaReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schema: "ExternalReference", targetUrl: "file:///media/A001_C001.mov" }),
        expect.objectContaining({ schema: "MissingReference" }),
      ]),
    );
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "OTIO_TRANSITIONS_PRESENT",
        "OTIO_RETIME_PRESENT",
        "OTIO_MULTICHANNEL_AUDIO_UNVERIFIED",
        "OTIO_MISSING_MEDIA_REFERENCE",
        "OTIO_NESTED_TIMELINE_PRESENT",
      ]),
    );
  });

  it("does not accept a truncated OTIO source as validated", async () => {
    await expect(analyzeOtio(fixture, { maxBytes: 1_024 })).rejects.toMatchObject({
      code: "OTIO_SOURCE_TRUNCATED",
    });
  });
});
