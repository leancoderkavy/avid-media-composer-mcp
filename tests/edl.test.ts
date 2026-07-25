import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeEdl } from "../src/analysis/edl.js";

const fixture = path.resolve("tests/fixtures/sample-project/Sequence.edl");

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
});
