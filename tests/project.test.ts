import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

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

  it("reports bounded unavailable analyzers, orphan locks, and truncation notes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-project-coverage-"));
    temporary.push(root);
    await Promise.all([
      writeFile(path.join(root, "Project.avp"), "Format=1080p24\n", "utf8"),
      writeFile(path.join(root, "One.avb"), "bin", "utf8"),
      writeFile(path.join(root, "Two.avb"), "bin", "utf8"),
      writeFile(path.join(root, "Orphan.lck"), "lock", "utf8"),
      writeFile(path.join(root, "Turnover.aaf"), "aaf", "utf8"),
      writeFile(path.join(root, "Picture.mov"), "media", "utf8"),
      writeFile(path.join(root, "Bad.ale"), "not an ALE", "utf8"),
      writeFile(path.join(root, "Bad.edl"), "TITLE: Empty\n", "utf8"),
    ]);
    const unavailableConfig: ServerConfig = {
      ...config,
      allowedRoots: [root],
      pythonExecutable: "definitely-missing-python",
      ffprobeExecutable: "definitely-missing-ffprobe",
      maxBins: 1,
      maxMediaFiles: 0,
      commandTimeoutMs: 500,
    };
    const result = await analyzeProject(root, unavailableConfig, {
      includeHashes: false,
      includeConfigurations: false,
      includeBins: true,
      includeAaf: true,
      includeMediaMetadata: true,
      deepMediaAnalysis: true,
      pythonMaxDepth: 1,
      pythonMaxItems: 1,
    });

    expect(result.bins).toEqual([expect.objectContaining({ status: "unavailable" })]);
    expect(result.aafFiles).toEqual([expect.objectContaining({ status: "unavailable" })]);
    expect(result.mediaFiles).toHaveLength(0);
    expect(result.safety.orphanLocks).toEqual(["Orphan.lck"]);
    expect(result.coverage.notes.join(" ")).toMatch(/Bin analysis limited.*Media metadata analysis limited/);
  });

  it("marks discovery as truncated before scanning beyond its directory budget", async () => {
    const result = await discoverProjects(path.dirname(fixture), 2, 0);
    expect(result).toMatchObject({ projects: [], directoriesScanned: 0, truncated: true });
  });
});
