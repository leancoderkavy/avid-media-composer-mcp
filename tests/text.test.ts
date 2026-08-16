import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeTextFile, readFilePrefix } from "../src/analysis/text.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function fixture(name: string, contents: string | Buffer): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "avid-text-"));
  temporary.push(root);
  const file = path.join(root, name);
  await writeFile(file, contents);
  return file;
}

describe("bounded text decoding", () => {
  it("rejects invalid prefix limits and handles empty files", async () => {
    const empty = await fixture("empty.txt", "");
    await expect(readFilePrefix(empty, 0)).rejects.toThrow(/positive integer/);
    await expect(readFilePrefix(empty, 1.5)).rejects.toThrow(/positive integer/);
    await expect(decodeTextFile(empty)).resolves.toMatchObject({ encoding: "utf8", text: "", totalBytes: 0 });
  });

  it("decodes explicit little- and big-endian UTF-16 byte order marks", async () => {
    const le = await fixture("le.txt", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Avid", "utf16le")]));
    const beBody = Buffer.from("Avid", "utf16le");
    for (let index = 0; index < beBody.length; index += 2) {
      [beBody[index], beBody[index + 1]] = [beBody[index + 1] ?? 0, beBody[index] ?? 0];
    }
    const be = await fixture("be.txt", Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]));
    await expect(decodeTextFile(le)).resolves.toMatchObject({ encoding: "utf16le", text: "Avid" });
    await expect(decodeTextFile(be)).resolves.toMatchObject({ encoding: "utf16be", text: "Avid" });
  });

  it("recognizes BOM-less UTF-16LE and rejects control-heavy binary", async () => {
    const utf16 = await fixture("heuristic.txt", Buffer.from("Media Composer", "utf16le"));
    const binary = await fixture("binary.dat", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16, 17]));
    await expect(decodeTextFile(utf16)).resolves.toMatchObject({ encoding: "utf16le", text: "Media Composer" });
    const decodedBinary = await decodeTextFile(binary);
    expect(decodedBinary.encoding).toBe("binary");
    expect(decodedBinary.text).toBeUndefined();
  });

  it("strips a UTF-8 BOM and reports truncation", async () => {
    const file = await fixture("utf8.txt", "\uFEFFabcdef");
    await expect(decodeTextFile(file, 5)).resolves.toMatchObject({ encoding: "utf8", text: "ab", truncated: true });
  });
});
