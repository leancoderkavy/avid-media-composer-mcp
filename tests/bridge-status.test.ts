import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBridgeStatus, sendBridgeCommand } from "../src/bridge/file-bridge.js";

const temporary: string[] = [];

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
  return {
    protocolVersion: 2,
    extensionVersion: "0.2.0-test",
    mediaComposerVersion: "2025.12.1",
    platform: "windows",
    operatingSystemVersion: "Windows 11 24H2",
    architecture: "x64",
    sessionId: "session-test",
    heartbeatAt: new Date().toISOString(),
    supportedActions: ["inspect.getState"],
    supportedEditOperations: [],
    ...overrides,
  };
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

  it("rejects protocol-v1 and malformed capability documents", async () => {
    const root = await bridgeDirectory(capability({ protocolVersion: 1 }));
    const status = await getBridgeStatus(root);
    expect(status.connected).toBe(false);
    expect(status.reason).toContain("different protocol version");
  });

  it("rejects invalid and stale heartbeats", async () => {
    const invalid = await bridgeDirectory(capability({ heartbeatAt: "not-a-date" }));
    expect((await getBridgeStatus(invalid)).reason).toContain("not a valid timestamp");

    const stale = await bridgeDirectory(
      capability({ heartbeatAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    const staleStatus = await getBridgeStatus(stale);
    expect(staleStatus.connected).toBe(false);
    expect(staleStatus.reason).toContain("stale");
  });

  it("fails closed for an unqualified OS/release combination", async () => {
    const root = await bridgeDirectory(
      capability({ operatingSystemVersion: "Windows 10 22H2" }),
    );
    const status = await getBridgeStatus(root);
    expect(status.connected).toBe(false);
    expect(status.compatibility?.status).toBe("unqualified");
    expect(status.reason).toContain("outside the qualified");
  });

  it("connects only with a fresh, fully qualified capability declaration", async () => {
    const root = await bridgeDirectory(
      capability({
        mediaComposerVersion: "2025.6",
        operatingSystemVersion: "Windows 10 22H2",
      }),
    );
    const status = await getBridgeStatus(root);
    expect(status.connected).toBe(true);
    expect(status.compatibility?.status).toBe("qualified");
    expect(status.heartbeatAgeMs).toBeLessThan(15_000);
  });

  it("rejects commands the connected extension does not advertise", async () => {
    const root = await bridgeDirectory(capability());
    await expect(sendBridgeCommand(root, "edit.applyPlan", {}, 100, "unsupported")).rejects.toMatchObject({
      code: "BRIDGE_ACTION_UNSUPPORTED",
    });
  });

  it("rejects malformed and mismatched bridge responses", async () => {
    const root = await bridgeDirectory(capability());
    await mkdir(path.join(root, "responses"), { recursive: true });
    await writeFile(
      path.join(root, "responses", "malformed.json"),
      JSON.stringify({ protocolVersion: 2, operationId: "someone-else", ok: true }),
      "utf8",
    );

    await expect(
      sendBridgeCommand(root, "inspect.getState", {}, 100, "malformed"),
    ).rejects.toMatchObject({ code: "BRIDGE_INVALID_RESPONSE" });
  });

  it("surfaces extension failures and accepts valid successful responses", async () => {
    const root = await bridgeDirectory(capability());
    await mkdir(path.join(root, "responses"), { recursive: true });
    await writeFile(
      path.join(root, "responses", "failed.json"),
      JSON.stringify({
        protocolVersion: 2,
        operationId: "failed",
        completedAt: new Date().toISOString(),
        ok: false,
        error: { code: "AVID_REJECTED", message: "Avid rejected the operation" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "responses", "success.json"),
      JSON.stringify({
        protocolVersion: 2,
        operationId: "success",
        completedAt: new Date().toISOString(),
        ok: true,
        result: { project: "Demo" },
      }),
      "utf8",
    );

    await expect(
      sendBridgeCommand(root, "inspect.getState", {}, 100, "failed"),
    ).rejects.toMatchObject({ code: "AVID_REJECTED" });
    await expect(
      sendBridgeCommand(root, "inspect.getState", {}, 100, "success"),
    ).resolves.toMatchObject({ ok: true, result: { project: "Demo" } });
  });

  it("times out when the extension does not produce a response", async () => {
    const root = await bridgeDirectory(capability());
    await expect(
      sendBridgeCommand(root, "inspect.getState", {}, 1, "timeout"),
    ).rejects.toMatchObject({ code: "BRIDGE_TIMEOUT" });
  });
});
