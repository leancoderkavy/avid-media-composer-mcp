import { describe, expect, it } from "vitest";
import { parseMarkerTimecode, sanitizeMarkerSvg, validateSourceMarkerPackage } from "../src/analysis/markers.js";

describe("source marker package validation", () => {
  it("keeps safe static SVG and reports source-range and timecode problems", () => {
    const result = validateSourceMarkerPackage({
      frameRate: 24,
      sourceStartTimecode: "01:00:00:00",
      sourceEndTimecode: "01:00:10:00",
      markers: [
        { id: "inside", timecode: "01:00:02:12", svgOverlay: "<svg><rect width=\"10\" height=\"10\"/></svg>" },
        { id: "outside", timecode: "00:59:59:23" },
        { id: "bad", timecode: "01:00:00:24" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inside", frameNumber: 86460, svgOverlay: expect.stringContaining("<rect") }),
    ]));
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      "MARKER_OUT_OF_BOUNDS",
      "MARKER_TIMECODE_INVALID",
    ]));
  });

  it("rejects executable and external-resource SVG rather than rewriting it", () => {
    for (const svg of [
      "<svg><script>alert(1)</script></svg>",
      "<svg onload=\"alert(1)\"></svg>",
      "<svg><image href=\"https://example.test/a.png\"/></svg>",
      "<svg><path style=\"fill:url(https://example.test/a)\"/></svg>",
    ]) {
      expect(sanitizeMarkerSvg(svg)).toMatchObject({ valid: false });
    }
    const result = validateSourceMarkerPackage({
      markers: [{ timecode: "01:00:00:00", svgOverlay: "<svg><script/></svg>" }],
    });
    expect(result.valid).toBe(false);
    expect(result.markers[0]?.svgOverlay).toBeUndefined();
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MARKER_SVG_REJECTED" })]));
  });

  it("parses timecode conservatively and identifies unverified drop-frame punctuation", () => {
    expect(parseMarkerTimecode("01:00:00:00", 24)).toBe(86400);
    expect(parseMarkerTimecode("01:00:00:24", 24)).toBeUndefined();
    const result = validateSourceMarkerPackage({
      frameRate: 25,
      markers: [{ timecode: "01:00:00;00" }],
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MARKER_DROP_FRAME_RATE_UNVERIFIED" }),
    ]));
  });

  it("rejects invalid package ranges and frame rates", () => {
    expect(() => validateSourceMarkerPackage({ markers: null as never })).toThrow(/markers must be an array/);
    expect(() => validateSourceMarkerPackage({ markers: [], frameRate: Number.NaN })).toThrow(/frameRate/);
    expect(() => validateSourceMarkerPackage({ markers: [], sourceStartTimecode: "bad" })).toThrow(/sourceStartTimecode/);
    expect(() => validateSourceMarkerPackage({ markers: [], sourceEndTimecode: "00:99:00:00" })).toThrow(/sourceEndTimecode/);
    expect(() => validateSourceMarkerPackage({
      markers: [], frameRate: 24, sourceStartTimecode: "01:00:10:00", sourceEndTimecode: "01:00:00:00",
    })).toThrow(/precedes/);
    expect(parseMarkerTimecode("00:60:00:00", 24)).toBeUndefined();
    expect(parseMarkerTimecode("00:00:60:00", 24)).toBeUndefined();
    expect(parseMarkerTimecode("00:00:00:99")).toBe(99);
  });

  it("rejects malformed, oversized, and non-static SVG variants", () => {
    const cases = [
      "",
      `<svg>${"x".repeat(64 * 1024)}</svg>`,
      "<rect/>",
      "<svg><filter/></svg>",
      "<svg><use href=\"https://example.test/item\"/></svg>",
      "<svg><use xlink:href=\"local\"/></svg>",
      "<?xml version=\"1.0\"?><svg></svg>",
    ];
    for (const svg of cases) expect(sanitizeMarkerSvg(svg).valid, svg.slice(0, 30)).toBe(false);
    expect(sanitizeMarkerSvg("\uFEFF <svg><defs><path id=\"p\" href=\"#p\"/></defs></svg>")).toMatchObject({ valid: true });
  });

  it("keeps optional marker metadata without inventing frame numbers", () => {
    const result = validateSourceMarkerPackage({ markers: [{ id: "m", timecode: "00:00:01:00", text: "note", color: "blue" }] });
    expect(result).toMatchObject({ valid: true, markers: [{ id: "m", timecode: "00:00:01:00", text: "note", color: "blue" }] });
    expect(result.markers[0]?.frameNumber).toBeUndefined();
  });
});
