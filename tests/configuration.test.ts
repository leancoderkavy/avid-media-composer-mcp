import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeConfigurationFile } from "../src/analysis/configuration.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("configuration analysis", () => {
  it("decodes text and extracts structured clues", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-config-"));
    temporary.push(root);
    const filePath = path.join(root, "Project.avp");
    await writeFile(filePath, "FrameRate=23.976\n<ColorSpace>Rec709</ColorSpace>\n", "utf8");

    const result = await analyzeConfigurationFile(filePath);
    expect(result.encoding).toBe("utf8");
    expect(result.text?.keyValues.FrameRate).toBe("23.976");
    expect(result.text?.xmlElements).toContain("ColorSpace");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fingerprints opaque binary data without pretending it is decoded", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-binary-"));
    temporary.push(root);
    const filePath = path.join(root, "User.avs");
    await writeFile(filePath, Buffer.from([0, 1, 2, 3, 0, 255, 128, 0, 9, 0, 4, 0]));

    const result = await analyzeConfigurationFile(filePath);
    expect(result.encoding).toBe("binary");
    expect(result.binary?.magicHex).toBe("0001020300ff800009000400");
    expect(result.text).toBeUndefined();
  });

  it("reads only the configured prefix of oversized files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-bounded-config-"));
    temporary.push(root);
    const filePath = path.join(root, "Large.avs");
    const largeBinary = Buffer.alloc(1024 * 1024);
    for (let index = 0; index < largeBinary.length; index += 1) {
      largeBinary[index] = index % 4;
    }
    await writeFile(filePath, largeBinary);

    const result = await analyzeConfigurationFile(filePath, 1024);
    expect(result.sizeBytes).toBe(1024 * 1024);
    expect(result.truncated).toBe(true);
    expect(result.binary?.magicHex).toHaveLength(64);
  });

  it("parses JSON configurations and tolerates JSON-looking plain text", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-json-config-"));
    temporary.push(root);
    const valid = path.join(root, "valid.avp");
    const invalid = path.join(root, "invalid.avp");
    await Promise.all([
      writeFile(valid, '{"format":"1080p24","enabled":true}', "utf8"),
      writeFile(invalid, "{not-json}\nRate: 24\n# ignored=true\n", "utf8"),
    ]);
    const parsed = await analyzeConfigurationFile(valid);
    expect(parsed.text?.parsedJson).toEqual({ format: "1080p24", enabled: true });
    const fallback = await analyzeConfigurationFile(invalid);
    expect(fallback.text?.parsedJson).toBeUndefined();
    expect(fallback.text?.keyValues).toEqual({ Rate: "24" });
  });

  it("extracts unique ASCII and UTF-16 strings from binary prefixes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-string-config-"));
    temporary.push(root);
    const filePath = path.join(root, "strings.avs");
    const binary = Buffer.concat([
      Buffer.from([0, 1, 2, 0, 3, 4, 0, 5]), Buffer.from("ASCII_VALUE"), Buffer.from([0, 0, 0, 255, 0]),
    ]);
    await writeFile(filePath, binary);
    const result = await analyzeConfigurationFile(filePath);
    expect(result.binary?.asciiStrings).toContain("ASCII_VALUE");
    expect(result.binary?.utf16LeStrings).toBeDefined();
    expect(result.binary?.entropyBitsPerByte).toBeGreaterThan(0);
  });
});
