import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerConfig } from "../src/config.js";
import { createBridgeAuthentication } from "../src/bridge/security.js";
import { applyEditPlan, confirmationToken, previewEditPlan, validateEditPlan } from "../src/edit/plans.js";

const temporary: string[] = [];
const bridgeAuth = {
  keyId: "edit-plan-tests",
  secret: "edit-plan-tests-secret-that-is-long-enough",
};
process.env.AVID_MCP_BRIDGE_AUTH_SECRET = bridgeAuth.secret;
process.env.AVID_MCP_BRIDGE_AUTH_KEY_ID = bridgeAuth.keyId;

function signed<T extends Record<string, unknown>>(document: T): T {
  return {
    ...document,
    authentication: createBridgeAuthentication(document, bridgeAuth),
  };
}

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

  it("rejects deeply nested, cyclic, or prototype-sensitive plan values", () => {
    let nested: Record<string, unknown> = {};
    for (let depth = 0; depth < 25; depth += 1) nested = { child: nested };
    expect(() =>
      validateEditPlan({ operations: [{ action: "bin.create", arguments: nested }] }),
    ).toThrow("nesting limit");

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      validateEditPlan({ operations: [{ action: "bin.create", arguments: cyclic }] }),
    ).toThrow("cycles");

    const unsafe = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(() =>
      validateEditPlan({ operations: [{ action: "bin.create", arguments: unsafe }] }),
    ).toThrow("unsafe object key");
  });

  it("requires expected-state guards before a live edit is considered", async () => {
    const plan = {
      operations: [{ action: "bin.create", arguments: { name: "Selects" } }],
    };
    await expect(
      applyEditPlan(plan, confirmationToken(validateEditPlan(plan)), config({ capabilities: new Set(["inspect", "edit"]) })),
    ).rejects.toMatchObject({ code: "EXPECTED_STATE_GUARD_REQUIRED" });
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
      JSON.stringify(signed({
        protocolVersion: 3,
        supportedProtocolVersions: [3],
        extensionId: "com.example.avid-mcp.test",
        installationId: "edit-plan-installation",
        extensionVersion: "0.1.0-test",
        mediaComposerVersion: "2025.12.1",
        platform: "windows",
        operatingSystemVersion: "Windows 11 24H2",
        architecture: "x64",
        sessionId: "test-session",
        heartbeatAt: new Date().toISOString(),
        stateRevision: "state-before-1",
        supportedActions: ["edit.applyPlan"],
        supportedEditOperations: ["bin.create"],
      })),
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

    let emittedPayload: Record<string, unknown> | undefined;
    const simulator = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const files = await readdir(path.join(root, "requests"));
        const requestName = files.find((name) => name.endsWith(".json"));
        if (requestName) {
          const request = JSON.parse(
            await readFile(path.join(root, "requests", requestName), "utf8"),
          ) as {
            operationId: string;
            clientSessionId: string;
            requestSequence: number;
            nonce: string;
            payload: Record<string, unknown>;
          };
          emittedPayload = request.payload;
          await writeFile(
            path.join(root, "responses", `${request.operationId}.json`),
            JSON.stringify(signed({
              protocolVersion: 3,
              operationId: request.operationId,
              clientSessionId: request.clientSessionId,
              requestSequence: request.requestSequence,
              requestNonce: request.nonce,
              completedAt: new Date().toISOString(),
              ok: true,
              data: {
                applied: 1,
                partialApply: false,
                preStateRevision: "before-1",
                postStateRevision: "after-1",
                undoGroupId: "undo-1",
                results: [
                  {
                    index: 0,
                    action: "bin.create",
                    status: "verified",
                    targetId: "bin-selects",
                    verified: true,
                  },
                ],
                outputs: { createdBin: "Selects" },
              },
            })),
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
    expect(result).toMatchObject({
      applied: true,
      result: {
        applied: 1,
        partialApply: false,
        outputs: { createdBin: "Selects" },
      },
    });
    expect(emittedPayload).toMatchObject({
      bridgePrecondition: {
        installationId: "edit-plan-installation",
        sessionId: "test-session",
        stateRevision: "state-before-1",
      },
    });
  });
});
