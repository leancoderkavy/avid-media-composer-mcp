import { AvidMcpError } from "../errors.js";

export interface DnxTurnoverMetadata {
  codec?: string;
  profile?: string;
  dnxGeneration?: "legacy" | "4.0" | "unknown";
  width?: number;
  height?: number;
  frameRate?: number;
  bitDepth?: number;
  chromaSubsampling?: string;
  pixelFormat?: string;
  colorSpace?: string;
  colorTransfer?: string;
  targetMediaComposerVersion?: string;
}

export interface DnxTurnoverFinding {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface DnxTurnoverAnalysis {
  recognizedAsDnx: boolean;
  declaredGeneration: "legacy" | "4.0" | "unknown";
  metadataCompleteness: "complete" | "partial" | "minimal";
  findings: DnxTurnoverFinding[];
  limitations: string[];
}

function parseReleaseLine(version: string | undefined): [number, number] | undefined {
  if (!version) return undefined;
  const match = /^(\d{4})\.(\d{1,2})/.exec(version.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2])];
}

function isBefore2025_12(version: string | undefined): boolean | undefined {
  const parsed = parseReleaseLine(version);
  if (!parsed) return undefined;
  return parsed[0] < 2025 || (parsed[0] === 2025 && parsed[1] < 12);
}

/**
 * Evaluates supplied metadata only. It neither reads essence nor claims that a
 * given profile can be decoded, imported, or rendered by Media Composer.
 */
export function analyzeDnxTurnover(metadata: DnxTurnoverMetadata): DnxTurnoverAnalysis {
  const codecHint = `${metadata.codec ?? ""} ${metadata.profile ?? ""}`.toLowerCase();
  const recognizedAsDnx = /dnx|vc-3/.test(codecHint);
  const findings: DnxTurnoverFinding[] = [];
  const supplied = [metadata.width, metadata.height, metadata.frameRate, metadata.bitDepth, metadata.chromaSubsampling, metadata.pixelFormat]
    .filter((value) => value !== undefined).length;
  const metadataCompleteness = supplied >= 6 ? "complete" : supplied >= 3 ? "partial" : "minimal";

  if (!recognizedAsDnx) {
    findings.push({ code: "DNX_CODEC_UNCONFIRMED", severity: "warning", message: "Supplied codec/profile metadata does not identify DNx or VC-3." });
  }
  if (metadata.dnxGeneration === "unknown" || metadata.dnxGeneration === undefined) {
    findings.push({ code: "DNX_GENERATION_UNDECLARED", severity: "warning", message: "DNx generation is not declared; codec names alone are insufficient proof of DNx 4.0 behavior." });
  }
  if (metadata.dnxGeneration === "4.0") {
    findings.push({ code: "DNX_4_METADATA_ONLY", severity: "info", message: "DNx 4.0 was declared by the caller; validate the exact profile on the target Media Composer host." });
    const olderTarget = isBefore2025_12(metadata.targetMediaComposerVersion);
    if (olderTarget === true) {
      findings.push({ code: "DNX_4_TARGET_VERSION_RISK", severity: "warning", message: "The target release predates Media Composer 2025.12; confirm DNx 4.0 recognition in a qualified host before turnover." });
    } else if (olderTarget === undefined) {
      findings.push({ code: "DNX_TARGET_VERSION_UNPARSEABLE", severity: "warning", message: "No parseable target Media Composer release was supplied for DNx 4.0 compatibility review." });
    }
    if (metadata.bitDepth !== undefined && metadata.bitDepth > 10) {
      findings.push({ code: "DNX_4_HIGH_BIT_DEPTH_VERIFY", severity: "warning", message: "High-bit-depth DNx 4.0 turnover requires target-host and downstream-pipeline verification." });
    }
  }
  if (metadataCompleteness !== "complete") {
    findings.push({ code: "DNX_TURNOVER_METADATA_INCOMPLETE", severity: "warning", message: "Raster, rate, bit depth, chroma, and pixel-format metadata should accompany a DNx turnover." });
  }
  if (metadata.frameRate !== undefined && (!Number.isFinite(metadata.frameRate) || metadata.frameRate <= 0 || metadata.frameRate > 120)) {
    throw new AvidMcpError("DNX_FRAME_RATE_INVALID", "frameRate must be a finite value between 0 and 120", { frameRate: metadata.frameRate });
  }
  for (const [field, value] of [["width", metadata.width], ["height", metadata.height], ["bitDepth", metadata.bitDepth]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new AvidMcpError("DNX_DIMENSION_INVALID", `${field} must be a positive integer`, { field, value });
    }
  }
  return {
    recognizedAsDnx,
    declaredGeneration: metadata.dnxGeneration ?? "unknown",
    metadataCompleteness,
    findings,
    limitations: [
      "This is supplied-metadata QC only; it does not decode, transcode, inspect essence, or prove Media Composer import support.",
      "DNx profile, naming, bit-depth, color, and target-host behavior must be verified with the exact Media Composer version and downstream delivery path.",
    ],
  };
}
