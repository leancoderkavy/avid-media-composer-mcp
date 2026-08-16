import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeEdl } from "../src/analysis/edl.js";

const fixture = path.resolve("tests/fixtures/sample-project/Sequence.edl");
const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))));

async function temporaryEdl(contents: string | Buffer): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "avid-edl-"));
  temporary.push(root);
  const file = path.join(root, "test.edl");
  await writeFile(file, contents);
  return file;
}

describe("EDL analysis", () => {
  it("parses events, transitions, comments, and motion effects", async () => {
    const result = await analyzeEdl(fixture);
    expect(result.title).toBe("SAMPLE SEQUENCE");
    expect(result.frameCountMode).toBe("NON-DROP FRAME");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      eventNumber: "001",
      reel: "A001_C001",
      transition: "C",
      sourceIn: "01:00:00:00",
      clipName: "A001_C001",
    });
    expect(result.events[1]).toMatchObject({
      transition: "D",
      transitionDuration: "024",
      motionEffect: "M2   A001_C002  050.0 02:00:01:00",
    });
  });

  it("collects orphan comments, motion effects, and malformed event lines", async () => {
    const file = await temporaryEdl([
      "* ORPHAN COMMENT", "M2 A001 50.0 01:00:00:00", "garbage",
      "001 A001 V C 01:00:00:00 01:00:01:00 02:00:00:00 02:00:01:00",
      "* NOTE", "M2 A001 50.0 01:00:00:00", "002 too short",
    ].join("\n"));
    const result = await analyzeEdl(file);
    expect(result.events[0]).toMatchObject({ transition: "C", comments: ["* NOTE"], motionEffect: "M2 A001 50.0 01:00:00:00" });
    expect(result.unparsedLines).toEqual(expect.arrayContaining(["* ORPHAN COMMENT", "M2 A001 50.0 01:00:00:00", "garbage", "002 too short"]));
  });

  it("rejects binary input and text without CMX events", async () => {
    await expect(analyzeEdl(await temporaryEdl(Buffer.from([0, 1, 0, 2, 0, 3])))).rejects.toMatchObject({ code: "EDL_NOT_TEXT" });
    await expect(analyzeEdl(await temporaryEdl("TITLE: Empty\nFCM: DROP FRAME\n"))).rejects.toMatchObject({ code: "EDL_EVENTS_MISSING" });
  });

  it("reports bounded input and omits absent optional headers", async () => {
    const line = "001 A001 V C 01:00:00:00 01:00:01:00 02:00:00:00 02:00:01:00\n";
    const file = await temporaryEdl(line + " ".repeat(2000));
    const result = await analyzeEdl(file, 1024);
    expect(result).toMatchObject({ sourceTruncated: true, events: [expect.any(Object)] });
    expect(result.title).toBeUndefined();
    expect(result.frameCountMode).toBeUndefined();
  });
});
