import { existsSync } from "node:fs";
import path from "node:path";
import type { Capability } from "./security/capabilities.js";
import { resolveCapabilities } from "./security/capabilities.js";

export interface ServerConfig {
  allowedRoots: string[];
  capabilities: ReadonlySet<Capability>;
  bridgeDir?: string;
  pythonExecutable: string;
  ffprobeExecutable: string;
  maxFiles: number;
  maxBins: number;
  maxMediaFiles: number;
  commandTimeoutMs: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function allowedRoots(value: string | undefined): string[] {
  const candidates = value
    ? value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean)
    : [process.cwd()];
  return [...new Set(candidates.map((entry) => path.resolve(entry)))];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const capabilities = resolveCapabilities(env.AVID_MCP_CAPABILITIES);
  const bridgeDir = env.AVID_MCP_BRIDGE_DIR?.trim();
  const localPython = path.resolve(
    process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return {
    allowedRoots: allowedRoots(env.AVID_MCP_ALLOWED_ROOTS),
    capabilities: capabilities.capabilities,
    ...(bridgeDir ? { bridgeDir: path.resolve(bridgeDir) } : {}),
    pythonExecutable:
      env.AVID_MCP_PYTHON?.trim() || (existsSync(localPython) ? localPython : "python"),
    ffprobeExecutable: env.AVID_MCP_FFPROBE?.trim() || "ffprobe",
    maxFiles: positiveInteger(env.AVID_MCP_MAX_FILES, 10_000, "AVID_MCP_MAX_FILES"),
    maxBins: positiveInteger(env.AVID_MCP_MAX_BINS, 100, "AVID_MCP_MAX_BINS"),
    maxMediaFiles: positiveInteger(env.AVID_MCP_MAX_MEDIA_FILES, 100, "AVID_MCP_MAX_MEDIA_FILES"),
    commandTimeoutMs: positiveInteger(
      env.AVID_MCP_COMMAND_TIMEOUT_MS,
      30_000,
      "AVID_MCP_COMMAND_TIMEOUT_MS",
    ),
  };
}
