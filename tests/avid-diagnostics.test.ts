import { describe, expect, it } from "vitest";
import { assessProductVersionEvidence, diagnoseAvidIntegrations } from "../src/integrations/avid-diagnostics.js";

describe("Avid specialized integration diagnostics", () => {
  it("reports local evidence without claiming provider-gated capability", async () => {
    const result = await diagnoseAvidIntegrations({ ama: "C:/AMA", nexis: "C:/NEXIS" }, async (candidate) => {
      if (candidate === "C:/AMA") return;
      throw new Error("not found");
    });
    expect(result.find((item) => item.surface === "ama")).toMatchObject({ availability: "installed" });
    expect(result.find((item) => item.surface === "nexis")).toMatchObject({ availability: "not-detected" });
    expect(result.find((item) => item.surface === "amt")).toMatchObject({ availability: "provider-gated" });
  });

  it("prevents another Avid product release from qualifying Media Composer", () => {
    expect(assessProductVersionEvidence("media-composer", "Pro Tools", "2025.12.2")).toMatchObject({ accepted: false });
    expect(assessProductVersionEvidence("media-composer", "Media Composer", "2025.12.1")).toEqual({ accepted: true });
  });
});
