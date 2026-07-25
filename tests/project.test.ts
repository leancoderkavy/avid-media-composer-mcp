import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ServerConfig } from "../src/config.js";
import { analyzeProject, discoverProjects } from "../src/analysis/project.js";

const fixture = path.resolve("tests/fixtures/sample-project");
const pythonExecutable = path.resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);

const config: ServerConfig = {
  allowedRoots: [fixture],
  capabilities: new Set(["inspect"]),
  pythonExecutable,
  ffprobeExecutable: "ffprobe",
  maxFiles: 1_000,
  maxBins: 20,
  maxMediaFiles: 20,
  commandTimeoutMs: 10_000,
};

describe("project analysis", () => {
  it("reports project structure, interchange data, and bin locks", async () => {
    const result = await analyzeProject(fixture, config, {
      includeHashes: true,
      includeConfigurations: true,
      includeBins: false,
      includeAaf: false,
      includeMediaMetadata: false,
      deepMediaAnalysis: false,
      pythonMaxDepth: 6,
      pythonMaxItems: 100,
    });
    expect(result.inventory.countsByKind.project).toBe(1);
    expect(result.inventory.countsByKind.bin).toBe(1);
    expect(result.safety.lockedBins).toEqual([
      { bin: "Editorial.avb", lock: "Editorial.lck" },
    ]);
    expect(result.aleFiles[0]?.status).toBe("analyzed");
    expect(result.edlFiles[0]?.status).toBe("analyzed");
    expect(result.safety.sourceMediaModified).toBe(false);
  });

  it("discovers directories containing AVP files", async () => {
    const result = await discoverProjects(path.dirname(fixture), 2, 100);
    expect(result.projects.some((project) => project.directory === fixture)).toBe(true);
  });
});
