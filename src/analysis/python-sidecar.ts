import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AvidMcpError } from "../errors.js";
import type { DependencyStatus } from "../types.js";
import { runProcess } from "../process.js";

async function firstExisting(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Report a missing packaged sidecar without searching the client's folder.
    }
  }
  throw new AvidMcpError("PYTHON_SIDECAR_MISSING", "python/avid_inspector.py was not found", {
    candidates,
  });
}

export async function resolvePythonSidecar(): Promise<string> {
  return firstExisting([
    // src/analysis and dist/analysis share the same package-relative layout.
    fileURLToPath(new URL("../../python/avid_inspector.py", import.meta.url)),
  ]);
}

export interface PythonInspectorOptions {
  pythonExecutable: string;
  timeoutMs: number;
  maxDepth?: number;
  maxItems?: number;
}

async function callInspector(
  command: "probe" | "analyze-bin" | "analyze-aaf",
  options: PythonInspectorOptions,
  filePath?: string,
): Promise<unknown> {
  const sidecar = await resolvePythonSidecar();
  const args = ["-I", "-B", sidecar, command];
  if (filePath) args.push("--path", filePath);
  if (options.maxDepth !== undefined) args.push("--max-depth", String(options.maxDepth));
  if (options.maxItems !== undefined) args.push("--max-items", String(options.maxItems));

  const result = await runProcess(options.pythonExecutable, args, {
    timeoutMs: options.timeoutMs,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  if (result.exitCode !== 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = undefined;
    }
    throw new AvidMcpError("PYTHON_INSPECTOR_FAILED", `Python inspector failed (${command})`, {
      exitCode: result.exitCode,
      stderr: result.stderr.trim().slice(0, 8_000),
      ...(parsed ? { result: parsed } : {}),
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new AvidMcpError("PYTHON_INSPECTOR_INVALID_JSON", "Python inspector returned invalid JSON", {
      message: error instanceof Error ? error.message : String(error),
      stderr: result.stderr.trim().slice(0, 8_000),
    });
  }
}

export async function probePythonInspector(
  options: PythonInspectorOptions,
): Promise<DependencyStatus & { packages?: Record<string, string | null> }> {
  try {
    const output = (await callInspector("probe", options)) as {
      python?: string;
      packages?: Record<string, string | null>;
      ready?: boolean;
    };
    const packages = output.packages ?? {};
    const available = output.ready === true;
    return {
      available,
      executable: options.pythonExecutable,
      ...(output.python ? { version: output.python } : {}),
      packages,
      ...(!available ? { error: "pyavb and/or pyaaf2 is not installed" } : {}),
    };
  } catch (error) {
    return {
      available: false,
      executable: options.pythonExecutable,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function analyzeAvbWithPython(
  filePath: string,
  options: PythonInspectorOptions,
): Promise<unknown> {
  return callInspector("analyze-bin", options, filePath);
}

export function analyzeAafWithPython(
  filePath: string,
  options: PythonInspectorOptions,
): Promise<unknown> {
  return callInspector("analyze-aaf", options, filePath);
}
