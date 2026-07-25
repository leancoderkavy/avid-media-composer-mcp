import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ServerConfig } from "../config.js";
import { errorDetails } from "../errors.js";
import { analyzeAafWithPython, analyzeAvbWithPython, probePythonInspector } from "./python-sidecar.js";
import { analyzeAle } from "./ale.js";
import { analyzeConfigurationFile } from "./configuration.js";
import { analyzeEdl } from "./edl.js";
import { inventoryFiles, type FileInventory } from "./file-inventory.js";
import { analyzeMediaFile, probeFfprobe } from "./media.js";

export interface ProjectAnalysisOptions {
  includeHashes: boolean;
  includeConfigurations: boolean;
  includeBins: boolean;
  includeAaf: boolean;
  includeMediaMetadata: boolean;
  deepMediaAnalysis: boolean;
  pythonMaxDepth: number;
  pythonMaxItems: number;
}

interface ItemAnalysis {
  path: string;
  status: "analyzed" | "unavailable" | "failed";
  data?: unknown;
  error?: ReturnType<typeof errorDetails>;
}

export interface ProjectAnalysis {
  root: string;
  generatedAt: string;
  inventory: FileInventory;
  safety: {
    lockedBins: Array<{ bin: string; lock: string }>;
    orphanLocks: string[];
    sourceMediaModified: false;
  };
  dependencies: {
    pythonInspector: Awaited<ReturnType<typeof probePythonInspector>>;
    ffprobe: Awaited<ReturnType<typeof probeFfprobe>>;
  };
  configurations: ItemAnalysis[];
  bins: ItemAnalysis[];
  aafFiles: ItemAnalysis[];
  aleFiles: ItemAnalysis[];
  edlFiles: ItemAnalysis[];
  mediaFiles: ItemAnalysis[];
  coverage: {
    truncated: boolean;
    limits: {
      maxFiles: number;
      maxBins: number;
      maxMediaFiles: number;
    };
    analyzed: Record<string, number>;
    unavailable: Record<string, number>;
    failed: Record<string, number>;
    notes: string[];
  };
}

async function capture(pathValue: string, work: () => Promise<unknown>): Promise<ItemAnalysis> {
  try {
    return { path: pathValue, status: "analyzed", data: await work() };
  } catch (error) {
    const details = errorDetails(error);
    const unavailable = new Set([
      "EXECUTABLE_NOT_FOUND",
      "PYTHON_SIDECAR_MISSING",
      "PYTHON_INSPECTOR_FAILED",
    ]).has(details.code);
    return {
      path: pathValue,
      status: unavailable ? "unavailable" : "failed",
      error: details,
    };
  }
}

function countStatuses(groups: Record<string, ItemAnalysis[]>): {
  analyzed: Record<string, number>;
  unavailable: Record<string, number>;
  failed: Record<string, number>;
} {
  const analyzed: Record<string, number> = {};
  const unavailable: Record<string, number> = {};
  const failed: Record<string, number> = {};
  for (const [name, items] of Object.entries(groups)) {
    analyzed[name] = items.filter((item) => item.status === "analyzed").length;
    unavailable[name] = items.filter((item) => item.status === "unavailable").length;
    failed[name] = items.filter((item) => item.status === "failed").length;
  }
  return { analyzed, unavailable, failed };
}

function findLocks(inventory: FileInventory): {
  lockedBins: Array<{ bin: string; lock: string }>;
  orphanLocks: string[];
} {
  const bins = new Map(
    inventory.files
      .filter((file) => file.kind === "bin")
      .map((file) => [path.join(path.dirname(file.relativePath), path.parse(file.relativePath).name).toLowerCase(), file.relativePath]),
  );
  const lockedBins: Array<{ bin: string; lock: string }> = [];
  const orphanLocks: string[] = [];
  for (const lock of inventory.files.filter((file) => file.kind === "bin-lock")) {
    const key = path.join(path.dirname(lock.relativePath), path.parse(lock.relativePath).name).toLowerCase();
    const bin = bins.get(key);
    if (bin) lockedBins.push({ bin, lock: lock.relativePath });
    else orphanLocks.push(lock.relativePath);
  }
  return { lockedBins, orphanLocks };
}

export async function analyzeProject(
  root: string,
  config: ServerConfig,
  options: ProjectAnalysisOptions,
): Promise<ProjectAnalysis> {
  const inventory = await inventoryFiles(root, {
    maxFiles: config.maxFiles,
    includeHashes: options.includeHashes,
  });
  const pythonOptions = {
    pythonExecutable: config.pythonExecutable,
    timeoutMs: config.commandTimeoutMs,
    maxDepth: options.pythonMaxDepth,
    maxItems: options.pythonMaxItems,
  };
  const [pythonInspector, ffprobe] = await Promise.all([
    probePythonInspector(pythonOptions),
    probeFfprobe(config.ffprobeExecutable, config.commandTimeoutMs),
  ]);

  const configurations: ItemAnalysis[] = [];
  if (options.includeConfigurations) {
    const candidates = inventory.files.filter((file) =>
      ["project", "settings", "sidecar"].includes(file.kind),
    );
    for (const file of candidates) {
      configurations.push(
        await capture(file.relativePath, () => analyzeConfigurationFile(file.absolutePath)),
      );
    }
  }

  const bins: ItemAnalysis[] = [];
  if (options.includeBins) {
    for (const file of inventory.files.filter((item) => item.kind === "bin").slice(0, config.maxBins)) {
      if (!pythonInspector.available) {
        bins.push({
          path: file.relativePath,
          status: "unavailable",
          error: {
            code: "PYTHON_INSPECTOR_UNAVAILABLE",
            message: pythonInspector.error ?? "pyavb is unavailable",
          },
        });
      } else {
        bins.push(
          await capture(file.relativePath, () =>
            analyzeAvbWithPython(file.absolutePath, pythonOptions),
          ),
        );
      }
    }
  }

  const aafFiles: ItemAnalysis[] = [];
  if (options.includeAaf) {
    for (const file of inventory.files.filter((item) => item.kind === "aaf").slice(0, config.maxBins)) {
      if (!pythonInspector.available) {
        aafFiles.push({
          path: file.relativePath,
          status: "unavailable",
          error: {
            code: "PYTHON_INSPECTOR_UNAVAILABLE",
            message: pythonInspector.error ?? "pyaaf2 is unavailable",
          },
        });
      } else {
        aafFiles.push(
          await capture(file.relativePath, () =>
            analyzeAafWithPython(file.absolutePath, pythonOptions),
          ),
        );
      }
    }
  }

  const aleFiles: ItemAnalysis[] = [];
  for (const file of inventory.files.filter((item) => item.kind === "ale")) {
    aleFiles.push(await capture(file.relativePath, () => analyzeAle(file.absolutePath)));
  }

  const edlFiles: ItemAnalysis[] = [];
  for (const file of inventory.files.filter((item) => item.kind === "edl")) {
    edlFiles.push(await capture(file.relativePath, () => analyzeEdl(file.absolutePath)));
  }

  const mediaFiles: ItemAnalysis[] = [];
  if (options.includeMediaMetadata) {
    for (const file of inventory.files
      .filter((item) => item.kind === "media")
      .slice(0, config.maxMediaFiles)) {
      if (!ffprobe.available) {
        mediaFiles.push({
          path: file.relativePath,
          status: "unavailable",
          error: {
            code: "FFPROBE_UNAVAILABLE",
            message: ffprobe.error ?? "ffprobe is unavailable",
          },
        });
      } else {
        mediaFiles.push(
          await capture(file.relativePath, () =>
            analyzeMediaFile(file.absolutePath, {
              executable: config.ffprobeExecutable,
              timeoutMs: config.commandTimeoutMs,
              deep: options.deepMediaAnalysis,
              includeHash: options.includeHashes,
            }),
          ),
        );
      }
    }
  }

  const groups = { configurations, bins, aafFiles, aleFiles, edlFiles, mediaFiles };
  const statusCounts = countStatuses(groups);
  const notes: string[] = [
    "AVP/AVS semantics are only decoded when text-like; binary files are fingerprinted and string-extracted because Avid does not publish those formats.",
    "AVB parsing uses the independent pyavb project and is not an Avid-supported API.",
    "Live Media Composer state is not included in this offline report unless a verified Extension bridge is connected.",
  ];
  if (inventory.countsByKind.bin > config.maxBins) {
    notes.push(`Bin analysis limited to ${config.maxBins} of ${inventory.countsByKind.bin} bins.`);
  }
  if (inventory.countsByKind.media > config.maxMediaFiles && options.includeMediaMetadata) {
    notes.push(
      `Media metadata analysis limited to ${config.maxMediaFiles} of ${inventory.countsByKind.media} files.`,
    );
  }

  return {
    root,
    generatedAt: new Date().toISOString(),
    inventory,
    safety: { ...findLocks(inventory), sourceMediaModified: false },
    dependencies: { pythonInspector, ffprobe },
    configurations,
    bins,
    aafFiles,
    aleFiles,
    edlFiles,
    mediaFiles,
    coverage: {
      truncated: inventory.truncated,
      limits: {
        maxFiles: config.maxFiles,
        maxBins: config.maxBins,
        maxMediaFiles: config.maxMediaFiles,
      },
      ...statusCounts,
      notes,
    },
  };
}

export interface DiscoveredProject {
  directory: string;
  projectFiles: string[];
  binCount: number;
  settingsCount: number;
  lockCount: number;
}

export async function discoverProjects(
  searchRoot: string,
  maxDepth: number,
  maxDirectories: number,
): Promise<{ projects: DiscoveredProject[]; directoriesScanned: number; truncated: boolean }> {
  const queue: Array<{ directory: string; depth: number }> = [{ directory: searchRoot, depth: 0 }];
  const projects: DiscoveredProject[] = [];
  let directoriesScanned = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (directoriesScanned >= maxDirectories) {
      truncated = true;
      break;
    }
    directoriesScanned += 1;
    const entries = await readdir(current.directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const projectFiles = names.filter((name) => path.extname(name).toLowerCase() === ".avp");
    if (projectFiles.length > 0) {
      projects.push({
        directory: current.directory,
        projectFiles,
        binCount: names.filter((name) => path.extname(name).toLowerCase() === ".avb").length,
        settingsCount: names.filter((name) => path.extname(name).toLowerCase() === ".avs").length,
        lockCount: names.filter((name) => path.extname(name).toLowerCase() === ".lck").length,
      });
    }

    if (current.depth < maxDepth) {
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
        }
      }
    }
  }

  return { projects, directoriesScanned, truncated };
}
