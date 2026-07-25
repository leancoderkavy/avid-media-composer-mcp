import { AvidMcpError } from "../errors.js";
import { decodeTextFile } from "./text.js";

export interface EdlEvent {
  eventNumber: string;
  reel: string;
  track: string;
  transition: string;
  transitionDuration?: string;
  sourceIn: string;
  sourceOut: string;
  recordIn: string;
  recordOut: string;
  comments: string[];
  clipName?: string;
  motionEffect?: string;
  raw: string;
}

export interface EdlAnalysis {
  path: string;
  encoding: string;
  title?: string;
  frameCountMode?: string;
  events: EdlEvent[];
  unparsedLines: string[];
  sourceTruncated: boolean;
}

const TIMECODE = /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/;

function parseEvent(line: string): EdlEvent | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 8 || !/^\d+$/.test(tokens[0] ?? "")) return undefined;

  const timecodeIndexes = tokens
    .map((token, index) => (TIMECODE.test(token) ? index : -1))
    .filter((index) => index >= 0);
  if (timecodeIndexes.length < 4) return undefined;
  const indexes = timecodeIndexes.slice(-4);
  const firstTimecodeIndex = indexes[0];
  if (firstTimecodeIndex === undefined || firstTimecodeIndex < 4) return undefined;

  const sourceIn = tokens[indexes[0] ?? -1];
  const sourceOut = tokens[indexes[1] ?? -1];
  const recordIn = tokens[indexes[2] ?? -1];
  const recordOut = tokens[indexes[3] ?? -1];
  if (!sourceIn || !sourceOut || !recordIn || !recordOut) return undefined;

  const transitionParts = tokens.slice(3, firstTimecodeIndex);
  const transition = transitionParts[0] ?? "";
  const transitionDuration = transitionParts.slice(1).join(" ") || undefined;
  return {
    eventNumber: tokens[0] ?? "",
    reel: tokens[1] ?? "",
    track: tokens[2] ?? "",
    transition,
    ...(transitionDuration ? { transitionDuration } : {}),
    sourceIn,
    sourceOut,
    recordIn,
    recordOut,
    comments: [],
    raw: line,
  };
}

export async function analyzeEdl(filePath: string, maxBytes = 16 * 1024 * 1024): Promise<EdlAnalysis> {
  const decoded = await decodeTextFile(filePath, maxBytes);
  if (decoded.text === undefined) {
    throw new AvidMcpError("EDL_NOT_TEXT", "EDL file could not be decoded as text", {
      path: filePath,
      encoding: decoded.encoding,
    });
  }

  const events: EdlEvent[] = [];
  const unparsedLines: string[] = [];
  let title: string | undefined;
  let frameCountMode: string | undefined;

  for (const raw of decoded.text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^TITLE\s*:/i.test(line)) {
      title = line.replace(/^TITLE\s*:\s*/i, "");
      continue;
    }
    if (/^FCM\s*:/i.test(line)) {
      frameCountMode = line.replace(/^FCM\s*:\s*/i, "");
      continue;
    }
    if (/^\*/.test(line)) {
      const current = events.at(-1);
      if (!current) {
        unparsedLines.push(line);
        continue;
      }
      current.comments.push(line);
      const clipMatch = line.match(/^\*\s*(?:FROM|TO)\s+CLIP\s+NAME\s*:\s*(.+)$/i);
      if (clipMatch?.[1]) current.clipName = clipMatch[1].trim();
      continue;
    }
    if (/^M2\s+/i.test(line)) {
      const current = events.at(-1);
      if (current) current.motionEffect = line;
      else unparsedLines.push(line);
      continue;
    }

    const event = parseEvent(line);
    if (event) events.push(event);
    else unparsedLines.push(line);
  }

  if (events.length === 0) {
    throw new AvidMcpError("EDL_EVENTS_MISSING", "No CMX-style EDL events were found", {
      path: filePath,
    });
  }

  return {
    path: filePath,
    encoding: decoded.encoding,
    ...(title !== undefined ? { title } : {}),
    ...(frameCountMode !== undefined ? { frameCountMode } : {}),
    events,
    unparsedLines,
    sourceTruncated: decoded.truncated,
  };
}
