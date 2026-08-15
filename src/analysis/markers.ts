import { AvidMcpError } from "../errors.js";

export interface SourceMarkerInput {
  id?: string;
  timecode: string;
  text?: string;
  color?: string;
  svgOverlay?: string;
}

export interface SourceMarkerPackageInput {
  markers: readonly SourceMarkerInput[];
  sourceStartTimecode?: string;
  sourceEndTimecode?: string;
  frameRate?: number;
}

export interface MarkerWarning {
  code: string;
  message: string;
  markerIndex?: number;
}

export interface ValidatedSourceMarker {
  id?: string;
  timecode: string;
  text?: string;
  color?: string;
  svgOverlay?: string;
  frameNumber?: number;
}

export interface SourceMarkerPackageValidation {
  valid: boolean;
  markers: ValidatedSourceMarker[];
  warnings: MarkerWarning[];
  limitations: string[];
}

const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/;
const MAX_SVG_BYTES = 64 * 1024;
const ALLOWED_SVG_ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc",
  "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern",
]);

function nominalFrameRate(frameRate: number | undefined): number | undefined {
  if (frameRate === undefined) return undefined;
  if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 120) return undefined;
  return Math.round(frameRate);
}

/** Parses SMPTE-style timecode without claiming drop-frame conformance conversion. */
export function parseMarkerTimecode(timecode: string, frameRate?: number): number | undefined {
  const match = TIMECODE.exec(timecode.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const frames = Number(match[5]);
  const nominal = nominalFrameRate(frameRate);
  if (minutes > 59 || seconds > 59 || (nominal !== undefined && frames >= nominal)) return undefined;
  const base = nominal ?? 100;
  return ((hours * 3_600 + minutes * 60 + seconds) * base) + frames;
}

/**
 * Accepts only a small, static SVG subset. It deliberately rejects instead of
 * repairing unsafe markup, so callers never import a silently altered overlay.
 */
export function sanitizeMarkerSvg(svg: string): { valid: boolean; svg?: string; reason?: string } {
  const trimmed = svg.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { valid: false, reason: "SVG overlay is empty." };
  if (Buffer.byteLength(trimmed, "utf8") > MAX_SVG_BYTES) {
    return { valid: false, reason: `SVG overlay exceeds the ${MAX_SVG_BYTES}-byte limit.` };
  }
  if (/<!--[\s\S]*?-->|<!DOCTYPE|<!ENTITY|<\?|<\s*\/?\s*(script|style|foreignObject|iframe|object|embed|image|audio|video|animate(?:\w*)?)\b/i.test(trimmed)) {
    return { valid: false, reason: "SVG contains markup that is not permitted in a static marker overlay." };
  }
  if (/\s(?:on[a-z]+|style)\s*=|(?:javascript:|data:|vbscript:)|url\s*\(/i.test(trimmed)) {
    return { valid: false, reason: "SVG contains executable, style, or external-resource syntax." };
  }
  const root = /^<svg\b[^>]*>[\s\S]*<\/svg>$/i.test(trimmed);
  if (!root) return { valid: false, reason: "SVG must contain one complete <svg> root element." };
  const tags = trimmed.matchAll(/<\/?\s*([A-Za-z][\w:-]*)\b/g);
  for (const tag of tags) {
    const name = tag[1]?.toLowerCase();
    if (!name || !ALLOWED_SVG_ELEMENTS.has(name)) {
      return { valid: false, reason: `SVG element '${tag[1] ?? "unknown"}' is not permitted.` };
    }
  }
  const references = trimmed.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi);
  for (const reference of references) {
    const value = reference[2]?.trim() ?? "";
    if (!value.startsWith("#")) {
      return { valid: false, reason: "SVG may reference only local fragment identifiers." };
    }
  }
  return { valid: true, svg: trimmed };
}

function addWarning(
  warnings: MarkerWarning[],
  code: string,
  message: string,
  markerIndex?: number,
): void {
  warnings.push({ code, message, ...(markerIndex === undefined ? {} : { markerIndex }) });
}

/** Validates a local source-marker import package. It does not import or modify Media Composer data. */
export function validateSourceMarkerPackage(input: SourceMarkerPackageInput): SourceMarkerPackageValidation {
  if (!Array.isArray(input.markers)) {
    throw new AvidMcpError("MARKER_PACKAGE_INVALID", "markers must be an array");
  }
  const nominal = nominalFrameRate(input.frameRate);
  if (input.frameRate !== undefined && nominal === undefined) {
    throw new AvidMcpError("MARKER_FRAME_RATE_INVALID", "frameRate must be a finite value between 0 and 120", {
      frameRate: input.frameRate,
    });
  }
  const sourceStart = input.sourceStartTimecode === undefined
    ? undefined
    : parseMarkerTimecode(input.sourceStartTimecode, input.frameRate);
  const sourceEnd = input.sourceEndTimecode === undefined
    ? undefined
    : parseMarkerTimecode(input.sourceEndTimecode, input.frameRate);
  if (input.sourceStartTimecode !== undefined && sourceStart === undefined) {
    throw new AvidMcpError("MARKER_SOURCE_START_INVALID", "sourceStartTimecode is invalid", { timecode: input.sourceStartTimecode });
  }
  if (input.sourceEndTimecode !== undefined && sourceEnd === undefined) {
    throw new AvidMcpError("MARKER_SOURCE_END_INVALID", "sourceEndTimecode is invalid", { timecode: input.sourceEndTimecode });
  }
  if (sourceStart !== undefined && sourceEnd !== undefined && sourceEnd < sourceStart) {
    throw new AvidMcpError("MARKER_SOURCE_RANGE_INVALID", "sourceEndTimecode precedes sourceStartTimecode");
  }

  const warnings: MarkerWarning[] = [];
  const markers: ValidatedSourceMarker[] = [];
  for (const [markerIndex, marker] of input.markers.entries()) {
    const frameNumber = parseMarkerTimecode(marker.timecode, input.frameRate);
    if (frameNumber === undefined) {
      addWarning(warnings, "MARKER_TIMECODE_INVALID", "Marker timecode is not valid for the supplied frame rate.", markerIndex);
      continue;
    }
    if (marker.timecode.includes(";") && input.frameRate !== 29.97 && input.frameRate !== 59.94) {
      addWarning(warnings, "MARKER_DROP_FRAME_RATE_UNVERIFIED", "Drop-frame punctuation is present without a 29.97 or 59.94 frame rate.", markerIndex);
    }
    if ((sourceStart !== undefined && frameNumber < sourceStart) || (sourceEnd !== undefined && frameNumber > sourceEnd)) {
      addWarning(warnings, "MARKER_OUT_OF_BOUNDS", "Marker lies outside the declared source timecode range.", markerIndex);
    }
    let svgOverlay: string | undefined;
    if (marker.svgOverlay !== undefined) {
      const sanitized = sanitizeMarkerSvg(marker.svgOverlay);
      if (!sanitized.valid) {
        addWarning(warnings, "MARKER_SVG_REJECTED", sanitized.reason ?? "SVG overlay is unsafe.", markerIndex);
      } else {
        svgOverlay = sanitized.svg;
      }
    }
    markers.push({
      ...(marker.id === undefined ? {} : { id: marker.id }),
      timecode: marker.timecode.trim(),
      ...(marker.text === undefined ? {} : { text: marker.text }),
      ...(marker.color === undefined ? {} : { color: marker.color }),
      ...(svgOverlay === undefined ? {} : { svgOverlay }),
      ...(nominal === undefined ? {} : { frameNumber }),
    });
  }
  return {
    valid: warnings.every((warning) => warning.code !== "MARKER_TIMECODE_INVALID" && warning.code !== "MARKER_SVG_REJECTED"),
    markers,
    warnings,
    limitations: [
      "Validation is local and does not import markers into Media Composer.",
      "Drop-frame conversion and Media Composer SVG rendering require host-side verification.",
    ],
  };
}
