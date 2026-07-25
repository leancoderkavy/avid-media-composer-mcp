import { readFile } from "node:fs/promises";

export interface DecodedText {
  encoding: "utf8" | "utf16le" | "utf16be" | "binary";
  text?: string;
  truncated: boolean;
  totalBytes: number;
}

function swapUtf16Bytes(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  for (let index = 0; index + 1 < copy.length; index += 2) {
    const value = copy[index];
    copy[index] = copy[index + 1] ?? 0;
    copy[index + 1] = value ?? 0;
  }
  return copy;
}

export async function decodeTextFile(
  filePath: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<DecodedText> {
  const full = await readFile(filePath);
  const truncated = full.length > maxBytes;
  const buffer = full.subarray(0, maxBytes);

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      encoding: "utf16le",
      text: buffer.subarray(2).toString("utf16le"),
      truncated,
      totalBytes: full.length,
    };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      encoding: "utf16be",
      text: swapUtf16Bytes(buffer.subarray(2)).toString("utf16le"),
      truncated,
      totalBytes: full.length,
    };
  }

  const sampleSize = Math.min(buffer.length, 16_384);
  let nulls = 0;
  let control = 0;
  for (let index = 0; index < sampleSize; index += 1) {
    const byte = buffer[index] ?? 0;
    if (byte === 0) nulls += 1;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  const nullRatio = sampleSize === 0 ? 0 : nulls / sampleSize;
  const controlRatio = sampleSize === 0 ? 0 : control / sampleSize;
  if (nullRatio > 0.2) {
    const oddNulls = [...buffer.subarray(0, sampleSize)].filter(
      (byte, index) => index % 2 === 1 && byte === 0,
    ).length;
    if (oddNulls > sampleSize * 0.3) {
      return {
        encoding: "utf16le",
        text: buffer.toString("utf16le"),
        truncated,
        totalBytes: full.length,
      };
    }
    return { encoding: "binary", truncated, totalBytes: full.length };
  }
  if (controlRatio > 0.08) {
    return { encoding: "binary", truncated, totalBytes: full.length };
  }
  return {
    encoding: "utf8",
    text: buffer.toString("utf8").replace(/^\uFEFF/, ""),
    truncated,
    totalBytes: full.length,
  };
}
