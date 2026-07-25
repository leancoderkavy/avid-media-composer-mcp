import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerConfig } from "../src/config.js";
import { applyEditPlan, confirmationToken, previewEditPlan, validateEditPlan } from "../src/edit/plans.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    allowedRoots: [process.cwd()],
    capabilities: new Set(["inspect"]),
    pythonExecutable: "python",
    ffprobeExecutable: "ffprobe",
    maxFiles: 100,
    maxBins: 10,
    maxMediaFiles: 10,
    commandTimeoutMs: 2_000,
    ...overrides,
  };
}

describe("guarded edit plans", () => {
  it("creates a stable token and reports bridge blockers without applying", async () => {
    const plan = {
      operations: [{ action: "bin.create", arguments: { name: "Selects" } }],
    };
    const first = validateEditPlan(plan);
    const second = validateEditPlan({ operations: [{ arguments: { name: "Selects" }, action: "bin.create" }] });
    expect(confirmationToken(first)).toBe(confirmationToken(second));

    const preview = (await previewEditPlan(plan, config())) as {
      applied: boolean;
      readyToApply: boolean;
      blockers: string[];
    };
    expect(preview.applied).toBe(false);
    expect(preview.readyToApply).toBe(false);
    expect(preview.blockers.join(" ")).toContain("not configured");
  });

  it("rejects unrecognized operations", () => {
    expect(() =>
      validateEditPlan({ operations: [{ action: "timeline.magic", arguments: {} }] }),
    ).toThrow("Unknown edit action");
  });

  it("applies an exact token only through a live bridge advertising the operation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-bridge-"));
    temporary.push(root);
    await Promise.all([
      mkdir(path.join(root, "state"), { recursive: true }),
      mkdir(path.join(root, "requests"), { recursive: true }),
      mkdir(path.join(root, "responses"), { recursive: true }),
    ]);
    await writeFile(
      path.join(root, "state", "capabilities.json"),
      JSON.stringify({
        protocolVersion: 1,
        extensionVersion: "0.1.0-test",
        mediaComposerVersion: "2025.12-test",
        sessionId: "test-session",
        heartbeatAt: new Date().toISOString(),
        supportedActions: ["edit.applyPlan"],
        supportedEditOperations: ["bin.create"],
      }),
      "utf8",
    );

    const plan = validateEditPlan({
      projectId: "project-1",
      operations: [
        {
          action: "bin.create",
          arguments: { name: "Selects" },
          expectedState: { projectId: "project-1" },
        },
      ],
    });

    const simulator = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const files = await readdir(path.join(root, "requests"));
        const requestName = files.find((name) => name.endsWith(".json"));
        if (requestName) {
          const request = JSON.parse(
            await readFile(path.join(root, "requests", requestName), "utf8"),
          ) as { operationId: string };
          await writeFile(
            path.join(root, "responses", `${request.operationId}.json`),
            JSON.stringify({
              protocolVersion: 1,
              operationId: request.operationId,
              completedAt: new Date().toISOString(),
              ok: true,
              data: { createdBin: "Selects" },
            }),
            "utf8",
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("test bridge did not observe request");
    };

    const [result] = await Promise.all([
      applyEditPlan(
        plan,
        confirmationToken(plan),
        config({ bridgeDir: root, capabilities: new Set(["inspect", "edit"]) }),
        () => undefined,
      ),
      simulator(),
    ]);
    expect(result).toMatchObject({ applied: true, result: { createdBin: "Selects" } });
  });
});
