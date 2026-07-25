import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AvidMcpError } from "../errors.js";

function normalizeForComparison(value: string): string {
  const normalized = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isWithin(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizeForComparison(candidate);
  const normalizedRoot = normalizeForComparison(root);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

export async function resolveReadablePath(
  input: string,
  allowedRoots: readonly string[],
  expected: "file" | "directory" | "either" = "either",
): Promise<string> {
  if (!input.trim()) {
    throw new AvidMcpError("INVALID_PATH", "Path must not be empty");
  }

  let resolved: string;
  try {
    resolved = await realpath(path.resolve(input));
  } catch {
    throw new AvidMcpError("PATH_NOT_FOUND", `Path does not exist: ${input}`);
  }

  const canonicalRoots = await Promise.all(
    allowedRoots.map(async (root) => {
      try {
        return await realpath(path.resolve(root));
      } catch {
        return path.resolve(root);
      }
    }),
  );
  if (!canonicalRoots.some((root) => isWithin(resolved, root))) {
    throw new AvidMcpError("PATH_OUTSIDE_ALLOWED_ROOTS", "Path is outside AVID_MCP_ALLOWED_ROOTS", {
      path: resolved,
      allowedRoots: canonicalRoots,
    });
  }

  const info = await stat(resolved);
  if (expected === "file" && !info.isFile()) {
    throw new AvidMcpError("EXPECTED_FILE", `Expected a file: ${resolved}`);
  }
  if (expected === "directory" && !info.isDirectory()) {
    throw new AvidMcpError("EXPECTED_DIRECTORY", `Expected a directory: ${resolved}`);
  }
  return resolved;
}
