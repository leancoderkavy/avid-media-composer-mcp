import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeTextFile } from "./text.js";
import { sha256File } from "./file-inventory.js";

export interface ConfigurationAnalysis {
  path: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  encoding: string;
  truncated: boolean;
  text?: {
    lineCount: number;
    content: string;
    keyValues: Record<string, string>;
    xmlElements: string[];
    parsedJson?: unknown;
  };
  binary?: {
    magicHex: string;
    entropyBitsPerByte: number;
    nullByteRatio: number;
    asciiStrings: string[];
    utf16LeStrings: string[];
  };
}

function entropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (const byte of buffer) counts[byte] = (counts[byte] ?? 0) + 1;
  let result = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const probability = count / buffer.length;
    result -= probability * Math.log2(probability);
  }
  return Number(result.toFixed(4));
}

function extractStrings(text: string, expression: RegExp, limit = 500): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(expression)) {
    const value = match[0]?.trim();
    if (value && !values.includes(value)) values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function parseKeyValues(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\s*([^#;][^:=\t]{0,120}?)\s*(?:=|:|\t)\s*(.*?)\s*$/);
    if (!match?.[1]) continue;
    result[match[1].trim()] = match[2] ?? "";
    if (Object.keys(result).length >= 500) break;
  }
  return result;
}

export async function analyzeConfigurationFile(
  filePath: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<ConfigurationAnalysis> {
  const decoded = await decodeTextFile(filePath, maxBytes);
  const base = {
    path: filePath,
    extension: path.extname(filePath).toLowerCase(),
    sizeBytes: decoded.totalBytes,
    sha256: await sha256File(filePath),
    encoding: decoded.encoding,
    truncated: decoded.truncated,
  };

  if (decoded.text !== undefined) {
    const lines = decoded.text.split(/\r?\n/);
    let parsedJson: unknown;
    if (decoded.text.trim().startsWith("{") || decoded.text.trim().startsWith("[")) {
      try {
        parsedJson = JSON.parse(decoded.text);
      } catch {
        // A non-JSON text configuration is still useful as raw decoded text.
      }
    }
    const xmlElements = [
      ...new Set(
        [...decoded.text.matchAll(/<([A-Za-z_][\w:.-]*)\b/g)]
          .map((match) => match[1])
          .filter((value): value is string => value !== undefined),
      ),
    ].slice(0, 500);
    return {
      ...base,
      text: {
        lineCount: lines.length,
        content: decoded.text,
        keyValues: parseKeyValues(lines),
        xmlElements,
        ...(parsedJson !== undefined ? { parsedJson } : {}),
      },
    };
  }

  const full = await readFile(filePath);
  const buffer = full.subarray(0, maxBytes);
  let nulls = 0;
  for (const byte of buffer) if (byte === 0) nulls += 1;
  return {
    ...base,
    binary: {
      magicHex: buffer.subarray(0, 32).toString("hex"),
      entropyBitsPerByte: entropy(buffer),
      nullByteRatio: buffer.length === 0 ? 0 : Number((nulls / buffer.length).toFixed(6)),
      asciiStrings: extractStrings(buffer.toString("latin1"), /[\x20-\x7e]{4,}/g),
      utf16LeStrings: extractStrings(buffer.toString("utf16le"), /[\x20-\x7e]{4,}/g),
    },
  };
}
