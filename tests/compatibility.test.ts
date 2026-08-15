import { describe, expect, it } from "vitest";
import {
  AVID_RELEASE_TRACKS,
  evaluateCompatibility,
  resolveReleaseTrack,
} from "../src/compatibility/releases.js";
import {
  EXTENSION_CAPABILITY_MANIFEST,
  validateExtensionCapabilityManifest,
} from "../src/compatibility/extension-capabilities.js";
import { EDIT_ACTION_CATALOG } from "../src/edit/catalog.js";

describe("Media Composer release compatibility", () => {
  it("tracks the latest three supported release lines", () => {
    expect(AVID_RELEASE_TRACKS.map((track) => track.release)).toEqual([
      "2025.12",
      "2025.6",
      "2024.12",
    ]);
    expect(resolveReleaseTrack("2025.12.1")?.release).toBe("2025.12");
    expect(resolveReleaseTrack("2025.12.2")?.latestQualifiedPatch).toBe("2025.12.2");
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
        mediaComposerVersion: "2025.12.2",
        platform: "macos",
        operatingSystemVersion: "26.6",
        architecture: "arm64",
      }).status,
    ).toBe("qualified");
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.12.2",
        platform: "macos",
        operatingSystemVersion: "26.7",
        architecture: "arm64",
      }).status,
    ).toBe("unqualified");
  });

  it("keeps the current extension terminology tied to the 2025.12 line", () => {
    const current = resolveReleaseTrack("2025.12.2");
    expect(current).toMatchObject({
      extensionSurface: "extensions",
      verifiedOn: "2026-08-15",
      source: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
    });
    expect(resolveReleaseTrack("2025.6")?.extensionSurface).toBe("panel-sdk");
  });

  it("returns unknown when qualification inputs are incomplete", () => {
    expect(
      evaluateCompatibility({
        mediaComposerVersion: "2025.12",
        platform: "macos",
      }).status,
    ).toBe("unknown");
  });

  it("keeps compatibility provenance product-scoped and rejects cross-product release evidence", () => {
    for (const track of AVID_RELEASE_TRACKS) {
      expect(track.provenance.product).toBe("Media Composer");
      expect(track.provenance.sourceTitle).toContain("Media Composer");
      expect(track.provenance.sourceTitle).not.toMatch(/Pro Tools|Distributed Processing/i);
      expect(track.provenance.sourceUrl).toMatch(/^https:\/\/kb\.avid\.com\//);
      expect(track.provenance.evidence.releaseLine).toBe(track.release);
      expect(track.provenance.evidence.latestPatch).toBe(track.latestQualifiedPatch);
    }
    expect(resolveReleaseTrack("2025.12.2")?.provenance.evidence.latestPatch).toBe("2025.12.2");
  });

  it("covers every catalog action in the SDK capability manifest without claiming live support", () => {
    expect(EDIT_ACTION_CATALOG).toHaveLength(167);
    expect(EXTENSION_CAPABILITY_MANIFEST.catalogActionCount).toBe(167);
    expect(EXTENSION_CAPABILITY_MANIFEST.capabilities).toHaveLength(167);
    expect(validateExtensionCapabilityManifest()).toEqual([]);
    for (const capability of EXTENSION_CAPABILITY_MANIFEST.capabilities) {
      expect(capability.documentation).toBe("internal-catalog");
      expect(capability.sdkAccess).toBe("pending-avid-onboarding");
      expect(capability.implementation).toBe("not-started");
      expect(capability.sdkMethod).toBeNull();
      expect(capability.minimumHostVersion).toBeNull();
      expect(capability.hostEvidence).toHaveLength(0);
    }
  });
});
