import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectInstallations } from "../src/compatibility/installations.js";

describe("Media Composer installation discovery", () => {
  it("detects an explicit Windows application and retains standard candidates", async () => {
    const configured = path.resolve("fixtures", "AvidMediaComposer.exe");
    const result = await detectInstallations(
      "windows",
      {
        AVID_MCP_APPLICATION_PATH: configured,
        ProgramFiles: "D:\\Programs",
      },
      async (candidate) => {
        if (candidate !== configured) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    );
    expect(result.detected).toEqual([configured]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "environment", exists: true }),
        expect.objectContaining({
          path: path.join(
            "D:\\Programs",
            "Avid",
            "Avid Media Composer",
            "AvidMediaComposer.exe",
          ),
          exists: false,
          applicationBundle: false,
        }),
      ]),
    );
  });

  it("returns macOS application candidates without reporting nonexistent paths", async () => {
    const result = await detectInstallations("macos", {}, async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    expect(result.detected).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.path)).toEqual([
      "/Applications/Avid Media Composer/AvidMediaComposer.app",
      "/Applications/Avid Media Composer.app",
    ]);
    expect(result.candidates.every((candidate) => candidate.applicationBundle)).toBe(true);
  });

  it("labels a configured macOS application bundle without inventing a binary path", async () => {
    const configured = path.resolve("fixtures", "Avid Media Composer.APP");
    const result = await detectInstallations(
      "macos",
      { AVID_MCP_APPLICATION_PATH: configured },
      async (candidate) => {
        if (candidate !== configured) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    );
    expect(result.detected).toEqual([configured]);
    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        path: configured,
        source: "environment",
        applicationBundle: true,
        exists: true,
      }),
    );
  });

  it("deduplicates an environment path matching a standard location", async () => {
    const standard = path.join(
      "C:\\Program Files",
      "Avid",
      "Avid Media Composer",
      "AvidMediaComposer.exe",
    );
    const result = await detectInstallations(
      "windows",
      { AVID_MCP_APPLICATION_PATH: standard, ProgramFiles: "C:\\Program Files" },
      async () => undefined,
    );
    expect(new Set(result.candidates.map((candidate) => candidate.path)).size).toBe(
      result.candidates.length,
    );
  });
});
