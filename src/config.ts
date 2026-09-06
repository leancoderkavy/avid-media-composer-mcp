import { existsSync } from "node:fs";
import path from "node:path";
import type { Capability } from "./security/capabilities.js";
import { resolveCapabilities } from "./security/capabilities.js";

export interface ServerConfig {
  jumperEnvironment?: NodeJS.ProcessEnv;
  nativeBinary?: string;
  outputRoot?: string;
  ffmpegExecutable?: string;
  modelDirectory?: string;
  allowedRoots: string[];
  capabilities: ReadonlySet<Capability>;
  bridgeDir?: string;
  pythonExecutable: string;
  ffprobeExecutable: string;
  maxFiles: number;
  maxBins: number;
  maxMediaFiles: number;
  commandTimeoutMs: number;
  ctmsRegistryUrl?: string;
  ctmsAllowedOrigins?: string[];
  ctmsAccessToken?: string;
  ctmsMaxResponseBytes?: number;
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
  const ctmsRegistryUrl = env.AVID_MCP_CTMS_REGISTRY_URL?.trim();
  const ctmsAccessToken = env.AVID_MCP_CTMS_ACCESS_TOKEN?.trim();
  const localPython = path.resolve(
    process.cwd(),
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return {
    jumperEnvironment:Object.fromEntries(["AVID_MCP_JUMPER_URL","AVID_MCP_JUMPER_LICENSE_KEY","AVID_MCP_JUMPER_BINARY","AVID_MCP_JUMPER_SHA256","AVID_MCP_JUMPER_IDENTITY"].filter(key=>env[key]!==undefined).map(key=>[key,env[key]])),
    ...(env.AVID_MCP_NATIVE_BINARY?.trim() ? { nativeBinary: path.resolve(env.AVID_MCP_NATIVE_BINARY.trim()) } : {}),
    ...(env.AVID_MCP_OUTPUT_ROOT?.trim() ? { outputRoot: path.resolve(env.AVID_MCP_OUTPUT_ROOT.trim()) } : {}),
    ffmpegExecutable: env.AVID_MCP_FFMPEG?.trim() || "ffmpeg",
    ...(env.AVID_MCP_MODEL_DIR?.trim() ? { modelDirectory: path.resolve(env.AVID_MCP_MODEL_DIR.trim()) } : {}),
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
    ...(ctmsRegistryUrl ? { ctmsRegistryUrl } : {}),
    ctmsAllowedOrigins: (env.AVID_MCP_CTMS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...(ctmsAccessToken ? { ctmsAccessToken } : {}),
    ctmsMaxResponseBytes: positiveInteger(
      env.AVID_MCP_CTMS_MAX_RESPONSE_BYTES,
      2 * 1024 * 1024,
      "AVID_MCP_CTMS_MAX_RESPONSE_BYTES",
    ),
  };
}
