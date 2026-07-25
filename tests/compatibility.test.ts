import { describe, expect, it } from "vitest";
import {
  AVID_RELEASE_TRACKS,
  evaluateCompatibility,
  resolveReleaseTrack,
} from "../src/compatibility/releases.js";

describe("Media Composer release compatibility", () => {
  it("tracks the latest three supported release lines", () => {
    expect(AVID_RELEASE_TRACKS.map((track) => track.release)).toEqual([
      "2025.12",
      "2025.6",
      "2024.12",
    ]);
    expect(resolveReleaseTrack("2025.12.1")?.release).toBe("2025.12");
    expect(resolveReleaseTrack("2024.12.6")?.supportTier).toBe("long-term-maintenance");
  });

  it("qualifies Windows 11 for 2025.12 and rejects Windows 10", () => {
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.12.1",
        platform: "windows",
        operatingSystemVersion: "Windows 11 24H2",
        architecture: "x64",
      }).status,
    ).toBe("qualified");
    const windows10 = evaluateCompatibility({
      mediaComposerVersion: "2025.12",
      platform: "windows",
      operatingSystemVersion: "Windows 10 22H2",
      architecture: "x64",
    });
    expect(windows10.status).toBe("unqualified");
    expect(windows10.issues.join(" ")).toContain("Windows 10");
  });

  it("preserves Windows 10 support for 2025.6 and 2024.12", () => {
    for (const mediaComposerVersion of ["2025.6", "2024.12.6"]) {
      expect(
        evaluateCompatibility({
          mediaComposerVersion,
          platform: "windows",
          operatingSystemVersion: "Windows 10 22H2",
          architecture: "x64",
        }).status,
      ).toBe("qualified");
    }
  });

  it("enforces release-specific macOS ceilings", () => {
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.6",
        platform: "macos",
        operatingSystemVersion: "15.5",
        architecture: "arm64",
      }).status,
    ).toBe("qualified");
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.6",
        platform: "macos",
        operatingSystemVersion: "15.6",
        architecture: "arm64",
      }).status,
    ).toBe("unqualified");
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.12.1",
        platform: "macos",
        operatingSystemVersion: "26.2",
        architecture: "arm64",
      }).status,
    ).toBe("qualified");
  });

  it("returns unknown when qualification inputs are incomplete", () => {
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.12",
        platform: "macos",
      }).status,
    ).toBe("unknown");
  });
});
