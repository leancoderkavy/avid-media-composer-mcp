import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeAle } from "../src/analysis/ale.js";

const fixture = path.resolve("tests/fixtures/sample-project/Clips.ale");
const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))));

async function temporaryAle(contents: string | Buffer): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "avid-ale-"));
  temporary.push(root);
  const file = path.join(root, "test.ale");
  await writeFile(file, contents);
  return file;
}

describe("ALE analysis", () => {
  it("parses headings, columns, and every data row", async () => {
    const result = await analyzeAle(fixture);
    expect(result.headings).toMatchObject({
      FIELD_DELIM: "TABS",
      VIDEO_FORMAT: "1080",
      FPS: "23.976",
    });
    expect(result.columns).toContain("MOB ID");
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]).toMatchObject({
      Name: "A001_C001",
      Tracks: "V1A1A2",
      "Source File": String.raw`D:\Camera\A001_C001.mov`,
    });
    expect(result.sourceTruncated).toBe(false);
  });

  it("warns for duplicate headings, extra columns and non-tab delimiters", async () => {
    const file = await temporaryAle("Heading\nFIELD_DELIM\tCOMMA\nFIELD_DELIM\tSPACES\nColumn\nName\tTape\nIgnored\tLine\nData\nClip\tA001\textra\n");
    const result = await analyzeAle(file);
    expect(result.rows[0]).toMatchObject({ Name: "Clip", Tape: "A001", __extra: "extra" });
    expect(result.warnings.join(" ")).toMatch(/Duplicate heading.*Ignored additional Column line.*extra value.*not fully supported/);
  });

  it("rejects binary ALE and missing or out-of-order columns", async () => {
    await expect(analyzeAle(await temporaryAle(Buffer.from([0, 1, 0, 2, 0, 3])))).rejects.toMatchObject({ code: "ALE_NOT_TEXT" });
    await expect(analyzeAle(await temporaryAle("Data\nvalue\n"))).rejects.toMatchObject({ code: "ALE_COLUMNS_MISSING" });
    await expect(analyzeAle(await temporaryAle("Heading\nFPS\t24\n"))).rejects.toMatchObject({ code: "ALE_COLUMNS_MISSING" });
  });

  it("reports absent FIELD_DELIM and bounded source reads", async () => {
    const file = await temporaryAle("Column\nName\nData\nClip\n" + " ".repeat(2000));
    const result = await analyzeAle(file, 1024);
    expect(result.sourceTruncated).toBe(true);
    expect(result.warnings).toContain("FIELD_DELIM heading is absent");
  });
});
