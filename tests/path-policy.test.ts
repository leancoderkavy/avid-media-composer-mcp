import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveReadablePath } from "../src/security/path-policy.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("allowed-root path policy", () => {
  it("accepts a canonical path inside an allowed root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-root-"));
    temporary.push(root);
    const filePath = path.join(root, "clip.ale");
    await writeFile(filePath, "Heading\n", "utf8");
    await expect(resolveReadablePath(filePath, [root], "file")).resolves.toBe(
      await realpath(filePath),
    );
  });

  it("rejects a sibling path with the same prefix", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-parent-"));
    temporary.push(parent);
    const allowed = path.join(parent, "project");
    const sibling = path.join(parent, "project-copy");
    await import("node:fs/promises").then(({ mkdir }) =>
      Promise.all([mkdir(allowed), mkdir(sibling)]),
    );
    await expect(resolveReadablePath(sibling, [allowed], "directory")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_ALLOWED_ROOTS",
    });
  });
});
