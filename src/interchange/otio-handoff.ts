import { createHash } from "node:crypto";
import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AvidMcpError } from "../errors.js";
import { sha256File } from "../analysis/file-inventory.js";
import { analyzeOtio, type OtioAnalysis } from "../analysis/otio.js";

export interface OtioHandoffOptions {
  /** Roots from which a file: media reference may be described.  No media is copied. */
  allowedMediaRoots: readonly string[];
  includeChecksums?: boolean;
  maxMediaReferences?: number;
  maxChecksumBytes?: number;
}

export interface OtioMediaManifestEntry {
  referencePath: string;
  targetUrl?: string;
  status: "missing-reference" | "non-file-reference" | "outside-allowed-roots" | "not-found" | "not-file" | "linked-file" | "checksum-skipped";
  sizeBytes?: number;
  sha256?: string;
}

export interface OtioHandoffPreview {
  format: "avid-mcp-otio-handoff/v1";
  source: { path: string; sha256: string };
  analysis: OtioAnalysis;
  mediaManifest: OtioMediaManifestEntry[];
  blockers: string[];
  warnings: string[];
  readyForManualImport: boolean;
  limitations: string[];
}

function isWithin(candidate: string, root: string): boolean {
  const normalizedCandidate = path.resolve(candidate).replace(/[\\/]+$/, "");
  const normalizedRoot = path.resolve(root).replace(/[\\/]+$/, "");
  const candidateValue = process.platform === "win32" ? normalizedCandidate.toLowerCase() : normalizedCandidate;
  const rootValue = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  return candidateValue === rootValue || candidateValue.startsWith(`${rootValue}${path.sep}`);
}

function localFilePath(targetUrl: string): string | undefined {
  try {
    const url = new URL(targetUrl);
    if (url.protocol !== "file:") return undefined;
    // fileURLToPath rejects malformed URLs and safely handles percent encoding.
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Creates a reviewable, non-mutating OTIO handoff manifest. It deliberately
 * does not claim that an OTIO timeline will import or relink in Media Composer.
 */
export async function previewOtioHandoff(
  otioPath: string,
  options: OtioHandoffOptions,
): Promise<OtioHandoffPreview> {
  const maxMediaReferences = options.maxMediaReferences ?? 500;
  const maxChecksumBytes = options.maxChecksumBytes ?? 4 * 1024 * 1024 * 1024;
  if (!Number.isSafeInteger(maxMediaReferences) || maxMediaReferences < 1) {
    throw new AvidMcpError("OTIO_HANDOFF_MAX_REFERENCES_INVALID", "maxMediaReferences must be a positive integer");
  }
  if (!Number.isSafeInteger(maxChecksumBytes) || maxChecksumBytes < 0) {
    throw new AvidMcpError("OTIO_HANDOFF_MAX_CHECKSUM_BYTES_INVALID", "maxChecksumBytes must be a non-negative integer");
  }
  const allowedRoots = await Promise.all(options.allowedMediaRoots.map(async (root) => realpath(path.resolve(root)).catch(() => path.resolve(root))));
  const analysis = await analyzeOtio(otioPath, { maxItems: maxMediaReferences });
  const sourcePath = await realpath(otioPath);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!analysis.valid) blockers.push("OTIO root is not a Timeline.");
  if (analysis.analysisTruncated) blockers.push("OTIO analysis reached its configured bound.");
  for (const warning of analysis.warnings) {
    if (["OTIO_MISSING_MEDIA_REFERENCE", "OTIO_RETIME_PRESENT", "OTIO_TRANSITIONS_PRESENT", "OTIO_NESTED_TIMELINE_PRESENT"].includes(warning.code)) {
      warnings.push(warning.message);
    }
  }
  const references = analysis.mediaReferences.slice(0, maxMediaReferences);
  if (analysis.mediaReferences.length > references.length) blockers.push("Media-reference manifest was bounded before all references were examined.");
  const mediaManifest: OtioMediaManifestEntry[] = [];
  for (const reference of references) {
    if (reference.schema === "MissingReference") {
      mediaManifest.push({ referencePath: reference.path, status: "missing-reference" });
      blockers.push(`Missing media reference at ${reference.path}.`);
      continue;
    }
    if (!reference.targetUrl) {
      mediaManifest.push({ referencePath: reference.path, status: "non-file-reference" });
      warnings.push(`Media reference at ${reference.path} has no usable file URL.`);
      continue;
    }
    const mediaPath = localFilePath(reference.targetUrl);
    if (!mediaPath) {
      mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "non-file-reference" });
      warnings.push(`Media reference at ${reference.path} is not a local file URL and was not fetched.`);
      continue;
    }
    if (!allowedRoots.some((root) => isWithin(mediaPath, root))) {
      mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "outside-allowed-roots" });
      blockers.push(`Media reference at ${reference.path} is outside the allowed media roots.`);
      continue;
    }
    try {
      const link = await lstat(mediaPath);
      if (link.isSymbolicLink()) {
        mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "outside-allowed-roots" });
        blockers.push(`Media reference at ${reference.path} is a symlink and was not followed.`);
        continue;
      }
      const info = await stat(mediaPath);
      if (!info.isFile()) {
        mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "not-file" });
        blockers.push(`Media reference at ${reference.path} is not a regular file.`);
        continue;
      }
      if (options.includeChecksums && info.size <= maxChecksumBytes) {
        mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "linked-file", sizeBytes: info.size, sha256: await sha256File(mediaPath) });
      } else {
        mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: options.includeChecksums ? "checksum-skipped" : "linked-file", sizeBytes: info.size });
        if (options.includeChecksums) warnings.push(`Checksum skipped for ${reference.path}: file exceeds configured limit.`);
      }
    } catch {
      mediaManifest.push({ referencePath: reference.path, targetUrl: reference.targetUrl, status: "not-found" });
      blockers.push(`Media reference at ${reference.path} could not be found.`);
    }
  }
  return {
    format: "avid-mcp-otio-handoff/v1",
    source: { path: sourcePath, sha256: await sha256File(sourcePath) },
    analysis,
    mediaManifest,
    blockers: unique(blockers),
    warnings: unique(warnings),
    readyForManualImport: blockers.length === 0,
    limitations: [
      "This manifest does not generate or modify OTIO, AAF, ALE, bins, projects, or timelines.",
      "Media Composer import, relinking, effects, retimes, transitions, and audio routing require a real-host round-trip test.",
      "Only local file: media references under explicitly supplied allowed roots are inspected; remote references are never fetched.",
    ],
  };
}

/** Stable digest for callers that persist a preview without storing media paths or credentials. */
export function otioHandoffDigest(preview: OtioHandoffPreview): string {
  return createHash("sha256").update(JSON.stringify(preview)).digest("hex");
}
