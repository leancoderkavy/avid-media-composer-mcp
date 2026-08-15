import { AvidMcpError } from "../errors.js";
import { decodeTextFile } from "./text.js";

export interface OtioWarning {
  code: string;
  message: string;
  path?: string;
}

export interface OtioMediaReference {
  schema: string;
  targetUrl?: string;
  path: string;
}

export interface OtioClipSummary {
  name?: string;
  path: string;
  mediaReferenceSchema?: string;
}

export interface OtioAnalysis {
  path: string;
  encoding: string;
  totalBytes: number;
  rootSchema?: string;
  valid: boolean;
  nodeCount: number;
  counts: Record<string, number>;
  clips: OtioClipSummary[];
  mediaReferences: OtioMediaReference[];
  warnings: OtioWarning[];
  limitations: string[];
  analysisTruncated: boolean;
}

export interface OtioAnalysisOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxItems?: number;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_ITEMS = 500;
const MAX_WARNINGS = 100;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaName(value: JsonRecord): string | undefined {
  const schema = value.OTIO_SCHEMA;
  if (typeof schema !== "string" || !schema.trim()) return undefined;
  return schema.split(".")[0]?.trim() || undefined;
}

function childPath(parent: string, key: string | number): string {
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

function isTimeEffect(schema: string, value: JsonRecord): boolean {
  if (/timewarp|freeze.?frame|timeeffect|retime|speed/i.test(schema)) return true;
  const effectName = value.effect_name;
  return typeof effectName === "string" && /timewarp|freeze|retime|speed/i.test(effectName);
}

function numberAboveTwo(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 2;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 2;
  }
  if (Array.isArray(value)) return value.length > 2;
  return false;
}

function hasMultichannelHint(value: JsonRecord): boolean {
  for (const [key, candidate] of Object.entries(value)) {
    if (/^(audio_)?channels?$|channel_?count$/i.test(key) && numberAboveTwo(candidate)) {
      return true;
    }
  }
  return false;
}

/**
 * Performs a bounded, structural read of an OTIO JSON document. This does not
 * claim to validate Avid import behavior or rewrite the source file.
 */
export async function analyzeOtio(
  filePath: string,
  options: OtioAnalysisOptions = {},
): Promise<OtioAnalysis> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_024) {
    throw new AvidMcpError("OTIO_MAX_BYTES_INVALID", "maxBytes must be an integer of at least 1024", {
      maxBytes,
    });
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new AvidMcpError("OTIO_MAX_DEPTH_INVALID", "maxDepth must be a positive integer", {
      maxDepth,
    });
  }
  if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
    throw new AvidMcpError("OTIO_MAX_ITEMS_INVALID", "maxItems must be a positive integer", {
      maxItems,
    });
  }

  const decoded = await decodeTextFile(filePath, maxBytes);
  if (decoded.text === undefined) {
    throw new AvidMcpError("OTIO_NOT_TEXT", "OTIO files must be UTF-8 or UTF-16 JSON text", {
      path: filePath,
      encoding: decoded.encoding,
    });
  }
  if (decoded.truncated) {
    throw new AvidMcpError(
      "OTIO_SOURCE_TRUNCATED",
      "OTIO file exceeds the configured read limit; structural validation was not attempted",
      { path: filePath, totalBytes: decoded.totalBytes, maxBytes },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.text) as unknown;
  } catch (error) {
    throw new AvidMcpError("OTIO_INVALID_JSON", "OTIO file is not valid JSON", {
      path: filePath,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw new AvidMcpError("OTIO_ROOT_INVALID", "OTIO root must be a JSON object", { path: filePath });
  }

  const warnings: OtioWarning[] = [];
  const counts: Record<string, number> = {};
  const clips: OtioClipSummary[] = [];
  const mediaReferences: OtioMediaReference[] = [];
  let nodeCount = 0;
  let analysisTruncated = false;
  let audioTrackCount = 0;
  let multichannelHint = false;
  let rootTimelineCount = 0;

  const addWarning = (code: string, message: string, path?: string): void => {
    if (warnings.some((warning) => warning.code === code && warning.path === path)) return;
    if (warnings.length >= MAX_WARNINGS) return;
    warnings.push({ code, message, ...(path ? { path } : {}) });
  };

  const walk = (value: unknown, currentPath: string, depth: number): void => {
    if (analysisTruncated) return;
    if (depth > maxDepth) {
      analysisTruncated = true;
      addWarning(
        "OTIO_DEPTH_LIMIT_REACHED",
        `Analysis stopped at the configured maximum depth of ${maxDepth}`,
        currentPath,
      );
      return;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        walk(value[index], childPath(currentPath, index), depth + 1);
        if (analysisTruncated) return;
      }
      return;
    }
    if (!isRecord(value)) return;

    const schema = schemaName(value);
    if (schema) {
      nodeCount += 1;
      if (nodeCount > maxItems) {
        analysisTruncated = true;
        addWarning(
          "OTIO_ITEM_LIMIT_REACHED",
          `Analysis stopped after ${maxItems} OTIO objects`,
          currentPath,
        );
        return;
      }
      counts[schema] = (counts[schema] ?? 0) + 1;

      if (schema === "Timeline") {
        rootTimelineCount += 1;
        if (currentPath !== "$") {
          addWarning(
            "OTIO_NESTED_TIMELINE_PRESENT",
            "Nested timelines may not retain their editorial structure when imported; confirm the Media Composer result manually.",
            currentPath,
          );
        }
      }
      if (schema === "Transition") {
        addWarning(
          "OTIO_TRANSITIONS_PRESENT",
          "Transitions require manual conformance verification after Media Composer import.",
          currentPath,
        );
      }
      if (/effect/i.test(schema) || isTimeEffect(schema, value)) {
        addWarning(
          "OTIO_EFFECTS_PRESENT",
          "Effects are represented structurally only; confirm supported effect mapping in Media Composer.",
          currentPath,
        );
      }
      if (isTimeEffect(schema, value)) {
        addWarning(
          "OTIO_RETIME_PRESENT",
          "Retime or speed-effect fidelity cannot be guaranteed by this read-only OTIO analysis.",
          currentPath,
        );
      }
      if (schema === "Track" && String(value.kind ?? "").toLowerCase() === "audio") {
        audioTrackCount += 1;
      }
      if (hasMultichannelHint(value) || (isRecord(value.metadata) && hasMultichannelHint(value.metadata))) {
        multichannelHint = true;
      }

      if (schema === "Clip") {
        const mediaReference = isRecord(value.media_reference) ? schemaName(value.media_reference) : undefined;
        if (clips.length < maxItems) {
          const name = typeof value.name === "string" && value.name ? value.name : undefined;
          clips.push({
            ...(name ? { name } : {}),
            path: currentPath,
            ...(mediaReference ? { mediaReferenceSchema: mediaReference } : {}),
          });
        }
      }
      if (/Reference$/i.test(schema)) {
        const targetUrl = typeof value.target_url === "string" && value.target_url ? value.target_url : undefined;
        mediaReferences.push({ schema, ...(targetUrl ? { targetUrl } : {}), path: currentPath });
        if (schema === "MissingReference") {
          addWarning(
            "OTIO_MISSING_MEDIA_REFERENCE",
            "A clip has a MissingReference and cannot be relinked from OTIO alone.",
            currentPath,
          );
        } else {
          addWarning(
            "OTIO_MEDIA_REFERENCE_PRESENT",
            "Media reference paths are reported but not resolved or relinked by this read-only analysis.",
            currentPath,
          );
        }
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "OTIO_SCHEMA") continue;
      walk(child, childPath(currentPath, key), depth + 1);
      if (analysisTruncated) return;
    }
  };

  walk(parsed, "$", 0);

  const rootSchema = schemaName(parsed);
  const valid = rootSchema === "Timeline";
  if (!rootSchema) {
    addWarning("OTIO_SCHEMA_MISSING", "The root object has no OTIO_SCHEMA marker.", "$");
  } else if (!valid) {
    addWarning(
      "OTIO_ROOT_NOT_TIMELINE",
      `Expected a Timeline root but found ${rootSchema}; inspect this OTIO container before interchange.`,
      "$",
    );
  }
  if (rootTimelineCount === 0) {
    addWarning("OTIO_TIMELINE_MISSING", "No Timeline object was found in the document.", "$");
  }
  if (audioTrackCount > 1 || multichannelHint) {
    addWarning(
      "OTIO_MULTICHANNEL_AUDIO_UNVERIFIED",
      "OTIO analysis cannot prove Media Composer multichannel audio routing or channel-order fidelity.",
    );
  }

  return {
    path: filePath,
    encoding: decoded.encoding,
    totalBytes: decoded.totalBytes,
    ...(rootSchema ? { rootSchema } : {}),
    valid,
    nodeCount,
    counts,
    clips,
    mediaReferences,
    warnings,
    limitations: [
      "This is a bounded structural OTIO JSON analysis, not an Avid Media Composer import or round-trip test.",
      "Effects, transitions, nested timelines, retimes, multichannel audio routing, and media relinking require post-import verification in Media Composer.",
      "No source media, OTIO file, project, bin, or timeline is modified.",
    ],
    analysisTruncated,
  };
}
