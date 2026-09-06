import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBridgeStatus, sendBridgeCommand } from "../src/bridge/file-bridge.js";
import {
  bridgeAuthConfig,
  createBridgeAuthentication,
} from "../src/bridge/security.js";

const temporary: string[] = [];
// These tests validate response semantics, not one-second hosted-filesystem
// scheduling. Keep a bounded shared budget for the producer and consumer.
const responseBudgetMs = 5_000;
const auth = {
  keyId: "bridge-status-tests",
  secret: "bridge-status-tests-secret-that-is-long-enough",
};
process.env.AVID_MCP_BRIDGE_AUTH_SECRET = auth.secret;
process.env.AVID_MCP_BRIDGE_AUTH_KEY_ID = auth.keyId;

function signed<T extends Record<string, unknown>>(document: T): T {
  return {
    ...document,
    authentication: createBridgeAuthentication(document, auth),
  };
}

async function bridgeDirectory(capabilities?: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "avid-bridge-status-"));
  temporary.push(root);
  await mkdir(path.join(root, "state"), { recursive: true });
  if (capabilities) {
    await writeFile(
      path.join(root, "state", "capabilities.json"),
      JSON.stringify(capabilities),
      "utf8",
    );
  }
  return root;
}

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return signed({
    protocolVersion: 3,
    supportedProtocolVersions: [3],
    extensionId: "com.example.avid-mcp.test",
    installationId: "test-installation",
    extensionVersion: "0.3.0-test",
    mediaComposerVersion: "2025.12.1",
    platform: "windows",
    operatingSystemVersion: "Windows 11 24H2",
    architecture: "x64",
    sessionId: "e43c2d32-6f7d-46c5-9a27-a4f0339ebb39",
    heartbeatAt: new Date().toISOString(),
    stateRevision: "state-test-1",
    supportedActions: ["inspect.getState"],
    supportedEditOperations: [],
    ...overrides,
  });
}

async function respond(
  root: string,
  operationId: string,
  responseData: Record<string, unknown>,
  transformResponse: (response: Record<string, unknown>) => Record<string, unknown> = (response) =>
    response,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  while (Date.now() - started < responseBudgetMs) {
    const names = await readdir(path.join(root, "requests"));
    const name = names.find((entry) => entry === operationId + ".json");
    if (name) {
      const request = JSON.parse(
        await readFile(path.join(root, "requests", name), "utf8"),
      ) as Record<string, unknown>;
      const response = transformResponse(signed({
        protocolVersion: 3,
        operationId,
        clientSessionId: request.clientSessionId,
        requestSequence: request.requestSequence,
        requestNonce: request.nonce,
        completedAt: new Date().toISOString(),
        ...responseData,
      }));
      const responsePath = path.join(root, "responses", operationId + ".json");
      await writeFile(
        responsePath + ".tmp",
        JSON.stringify(response),
        {encoding:"utf8",flag:"wx"},
      );
      await rename(responsePath + ".tmp", responsePath);
      return request;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Test bridge did not observe ${operationId} request within ${responseBudgetMs}ms (elapsed ${Date.now()-started}ms)`);
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("Media Composer bridge status", () => {
  it("distinguishes unconfigured and unavailable bridge state", async () => {
    expect(await getBridgeStatus(undefined)).toMatchObject({
      configured: false,
      connected: false,
    });
    const root = await bridgeDirectory();
    expect(await getBridgeStatus(root)).toMatchObject({
      configured: true,
      connected: false,
    });
  });

  it("rejects v2, malformed, unsigned, and non-negotiating capability documents", async () => {
    const v2 = await bridgeDirectory({ protocolVersion: 2 });
    expect((await getBridgeStatus(v2)).reason).toContain("invalid");

    const unsigned = { ...capability() };
    delete unsigned.authentication;
    const root = await bridgeDirectory(unsigned);
    expect((await getBridgeStatus(root)).connected).toBe(false);

    const noV3 = await bridgeDirectory(capability({ supportedProtocolVersions: [4] }));
    expect((await getBridgeStatus(noV3)).connected).toBe(false);
  });

  it("requires a configured secret and a valid authenticated capability heartbeat", async () => {
    const savedSecret = process.env.AVID_MCP_BRIDGE_AUTH_SECRET;
    delete process.env.AVID_MCP_BRIDGE_AUTH_SECRET;
    const root = await bridgeDirectory(capability());
    expect((await getBridgeStatus(root)).reason).toContain("authentication is not configured");
    process.env.AVID_MCP_BRIDGE_AUTH_SECRET = savedSecret;

    const status = await getBridgeStatus(root);
    expect(status).toMatchObject({
      connected: true,
      negotiatedProtocolVersion: 3,
      capabilities: { installationId: "test-installation", stateRevision: "state-test-1" },
    });
  });

  it("rejects invalid and stale heartbeats plus unqualified hosts", async () => {
    const invalid = await bridgeDirectory(capability({ heartbeatAt: "not-a-date" }));
    expect((await getBridgeStatus(invalid)).reason).toContain("not a valid timestamp");

    const stale = await bridgeDirectory(
      capability({ heartbeatAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    expect((await getBridgeStatus(stale)).reason).toContain("stale");

    const unqualified = await bridgeDirectory(
      capability({ operatingSystemVersion: "Windows 10 22H2" }),
    );
    expect((await getBridgeStatus(unqualified)).reason).toContain("outside the qualified");
  });

  it("rejects commands the authenticated extension does not advertise", async () => {
    const root = await bridgeDirectory(capability());
    await expect(sendBridgeCommand(root, "edit.applyPlan", {}, 100, "unsupported")).rejects.toMatchObject({
      code: "BRIDGE_ACTION_UNSUPPORTED",
    });
  });

  it("atomically sends signed envelopes with a unique nonce and increasing request sequence", async () => {
    const root = await bridgeDirectory(capability());
    await mkdir(path.join(root, "requests"), { recursive: true });
    await mkdir(path.join(root, "responses"), { recursive: true });

    const firstResponder = respond(root, "first", {
      ok: true,
      data: { stateRevision: "revision-1", project: { id: "project-1" }, state: {} },
    });
    const first = await sendBridgeCommand(root, "inspect.getState", {}, responseBudgetMs, "first");
    const firstRequest = await firstResponder;
    expect(first).toMatchObject({ ok: true, data: { stateRevision: "revision-1" } });
    expect(firstRequest).toMatchObject({
      protocolVersion: 3,
      clientSessionId: expect.any(String),
      requestSequence: expect.any(Number),
      nonce: expect.any(String),
      expiresAt: expect.any(String),
      authentication: { algorithm: "hmac-sha256", keyId: auth.keyId },
    });

    const secondResponder = respond(root, "second", {
      ok: true,
      data: { stateRevision: "revision-2", project: { id: "project-1" }, state: {} },
    });
    await sendBridgeCommand(root, "inspect.getState", {}, responseBudgetMs, "second");
    const secondRequest = await secondResponder;
    expect(secondRequest.requestSequence).toBe((firstRequest.requestSequence as number) + 1);
    expect(secondRequest.nonce).not.toBe(firstRequest.nonce);
  });

  it("rejects an authenticated response that is not bound to the request nonce", async () => {
    const root = await bridgeDirectory(capability());
    await mkdir(path.join(root, "requests"), { recursive: true });
    await mkdir(path.join(root, "responses"), { recursive: true });
    const responder = respond(
      root,
      "replayed",
      {
        ok: true,
        data: { stateRevision: "revision-1", state: {} },
      },
      (response) => signed({
        ...response,
        requestNonce: "b4d57513-90d0-4c55-9f3a-aa3f3655107d",
      }),
    );
    await expect(sendBridgeCommand(root, "inspect.getState", {}, responseBudgetMs, "replayed")).rejects.toMatchObject({
      code: "BRIDGE_REPLAY_DETECTED",
    });
    await responder;
  });

  it("surfaces extension failures and validates complete edit evidence", async () => {
    const root = await bridgeDirectory(
      capability({
        supportedActions: ["edit.applyPlan"],
        supportedEditOperations: ["bin.create"],
      }),
    );
    await mkdir(path.join(root, "requests"), { recursive: true });
    await mkdir(path.join(root, "responses"), { recursive: true });

    const failedResponder = respond(root, "failed", {
      ok: false,
      error: { code: "BIN_LOCKED", message: "The bin is locked" },
    });
    await expect(sendBridgeCommand(root, "edit.applyPlan", {}, responseBudgetMs, "failed")).rejects.toMatchObject({
      code: "BIN_LOCKED",
    });
    await failedResponder;

    const invalidResponder = respond(root, "incomplete-edit", {
      ok: true,
      data: { applied: 1 },
    });
    await expect(
      sendBridgeCommand(root, "edit.applyPlan", {}, responseBudgetMs, "incomplete-edit"),
    ).rejects.toMatchObject({ code: "BRIDGE_INVALID_RESPONSE" });
    await invalidResponder;
  });

  it("fails closed for unsafe operation identifiers and verifies test configuration", async () => {
    expect(bridgeAuthConfig()).toEqual(auth);
    const root = await bridgeDirectory(capability());
    await expect(
      sendBridgeCommand(root, "inspect.getState", {}, 100, "../unsafe"),
    ).rejects.toMatchObject({ code: "BRIDGE_INVALID_OPERATION_ID" });
  });
});
