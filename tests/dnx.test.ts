import { describe, expect, it } from "vitest";
import { analyzeDnxTurnover } from "../src/analysis/dnx.js";

describe("DNx turnover QC", () => {
  it("reports DNx 4.0 target-host and high-bit-depth risks from supplied metadata", () => {
    const result = analyzeDnxTurnover({
      codec: "dnxhd",
      profile: "DNxHR HQX",
      dnxGeneration: "4.0",
      width: 3840,
      height: 2160,
      frameRate: 23.976,
      bitDepth: 12,
      chromaSubsampling: "4:2:2",
      pixelFormat: "yuv422p12le",
      targetMediaComposerVersion: "2025.6",
    });
    expect(result).toMatchObject({ recognizedAsDnx: true, declaredGeneration: "4.0", metadataCompleteness: "complete" });
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "DNX_4_TARGET_VERSION_RISK",
      "DNX_4_HIGH_BIT_DEPTH_VERIFY",
    ]));
    expect(result.limitations.join(" ")).toMatch(/does not decode/i);
  });

  it("does not infer a DNx generation from a codec name and rejects impossible metadata", () => {
    const result = analyzeDnxTurnover({ codec: "dnxhd", profile: "DNxHD 120" });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DNX_GENERATION_UNDECLARED" }),
      expect.objectContaining({ code: "DNX_TURNOVER_METADATA_INCOMPLETE" }),
    ]));
    expect(() => analyzeDnxTurnover({ frameRate: 0 })).toThrow(/frameRate/);
  });
});
