import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeAle } from "../src/analysis/ale.js";

const fixture = path.resolve("tests/fixtures/sample-project/Clips.ale");

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
});
