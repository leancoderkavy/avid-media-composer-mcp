import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrCreateInstallationId } from "../src/installation-id.js";

const testDir = join(tmpdir(), `avid-mcp-test-${Date.now()}`);

beforeEach(async () => {
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("installation ID", () => {
  it("generates a valid UUID when no existing ID is found", async () => {
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("reuses an existing installation ID", async () => {
    const configDir = join(testDir, ".config", "avid-media-composer-mcp");
    await mkdir(configDir, { recursive: true });
    const existingId = "12345678-1234-1234-1234-123456789abc";
    await writeFile(
      join(configDir, "avid-mcp-installation-id"),
      `${existingId}\n`,
      { mode: 0o600 },
    );

    process.env.HOME = testDir;
    const id = await getOrCreateInstallationId();
    expect(id).toBe(existingId);
  });

  it("generates a new ID if the existing one is malformed", async () => {
    const configDir = join(testDir, ".config", "avid-media-composer-mcp");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "avid-mcp-installation-id"), "invalid-id\n", { mode: 0o600 });

    process.env.HOME = testDir;
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(id).not.toBe("invalid-id");
  });

  it("returns a generated ID even if persistence fails", async () => {
    process.env.HOME = "/nonexistent-directory-that-cannot-be-created";
    process.env.TMPDIR = "/another-nonexistent-directory";

    const id = await getOrCreateInstallationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
