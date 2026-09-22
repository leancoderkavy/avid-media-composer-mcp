import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpServer } from "../src/http-app.js";
import packageJson from "../package.json" with { type: "json" };
import * as telemetryModule from "../src/telemetry.js";

const servers: http.Server[] = [];
const TEST_TOKEN = "unit-test-token-32-bytes-minimum!";

beforeEach(() => {
  vi.restoreAllMocks();
});

async function startServer(
  token = TEST_TOKEN,
  options: Omit<Parameters<typeof createHttpServer>[0], "authToken"> = {},
): Promise<string> {
  const server = createHttpServer({ authToken: token, ...options });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

describe("remote HTTP application", () => {
  it("refuses missing or weak bearer tokens", () => {
    expect(() => createHttpServer({ authToken: "" })).toThrow("at least 32 bytes");
    expect(() => createHttpServer({ authToken: "short" })).toThrow("at least 32 bytes");
  });

  it("serves bounded public health and service metadata", async () => {
    const base = await startServer();
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect(health.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(await health.json()).toEqual({
      status: "ok",
      service: "avid-media-composer-mcp",
      version: packageJson.version,
      transport: "streamable-http",
      liveAvidBridge: false,
    });

    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(await root.json()).toMatchObject({
      mcpEndpoint: "/mcp",
      authentication: "Bearer token required",
    });
  });

  it("returns JSON 404s without leaking server details", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/not-a-route`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic abc"],
    ["wrong token with equal length", `Bearer ${"x".repeat(Buffer.byteLength(TEST_TOKEN))}`],
    ["wrong token with different length", "Bearer short"],
  ])("rejects %s", async (_label, authorization) => {
    const base = await startServer();
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      ...(authorization ? { headers: { Authorization: authorization } } : {}),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("passes a correct bearer token to the MCP transport", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ invalid: "json-rpc" }),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid JSON-RPC");
  });

  it("requires JSON and rejects oversized request bodies", async () => {
    const base = await startServer(TEST_TOKEN, { maxRequestBytes: 32 });
    const headers = { Authorization: `Bearer ${TEST_TOKEN}` };

    const wrongType = await fetch(`${base}/mcp`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(wrongType.status).toBe(415);

    const oversized = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(64) }),
    });
    expect(oversized.status).toBe(413);
  });

  it("rate limits public requests without consuming the authenticated MCP quota", async () => {
    const base = await startServer(TEST_TOKEN, {
      publicRateLimitPerMinute: 2,
      authenticatedRateLimitPerMinute: 1,
    });
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const limited = await fetch(`${base}/health`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const authenticated = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ invalid: "json-rpc" }),
    });
    expect(authenticated.status).toBe(400);
  });

  it("keeps unauthorized traffic out of the authenticated MCP quota", async () => {
    const base = await startServer(TEST_TOKEN, {
      unauthorizedRateLimitPerMinute: 1,
      authenticatedRateLimitPerMinute: 1,
    });
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
    ).toBe(401);
    const limited = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    expect(limited.status).toBe(429);

    const authenticated = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ invalid: "json-rpc" }),
    });
    expect(authenticated.status).toBe(400);
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(429);
  });

  it("does not capture telemetry for health and root routes", async () => {
    const captureSpy = vi.spyOn(telemetryModule.telemetry, "capture");
    const base = await startServer();

    await fetch(`${base}/health`);
    await fetch(`${base}/`);

    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("keeps MCP session IDs out of telemetry", async () => {
    const captureSpy = vi.spyOn(telemetryModule.telemetry, "capture");
    const base = await startServer();

    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
        id: 1,
      }),
    });

    expect(response.ok).toBe(true);

    const calls = captureSpy.mock.calls.filter((call) => call[0] === "avid_mcp_request");
    expect(calls.length).toBeGreaterThan(0);

    const [_event, _properties, distinctId] = calls[0];
    expect(distinctId).toBeUndefined();
    expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(response.headers.get("mcp-session-id"));
  });

  it("keeps token fingerprints out of telemetry", async () => {
    const captureSpy = vi.spyOn(telemetryModule.telemetry, "capture");
    const base = await startServer();

    await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });

    const unauthorizedCalls = captureSpy.mock.calls.filter(
      (call) => call[0] === "avid_mcp_connection_attempt" && call[1].outcome === "unauthorized",
    );
    expect(unauthorizedCalls.length).toBeGreaterThan(0);

    const [_event, _properties, distinctId] = unauthorizedCalls[0];
    expect(distinctId).toBeUndefined();
    expect(JSON.stringify(captureSpy.mock.calls)).not.toContain(TEST_TOKEN);
  });
});
