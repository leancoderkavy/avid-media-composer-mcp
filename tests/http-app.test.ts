import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../src/http-app.js";

const servers: http.Server[] = [];

async function startServer(token = "unit-test-token"): Promise<string> {
  const server = createHttpServer({ authToken: token });
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
  it("refuses construction without a bearer token", () => {
    expect(() => createHttpServer({ authToken: "" })).toThrow("MCP_AUTH_TOKEN is required");
  });

  it("serves bounded public health and service metadata", async () => {
    const base = await startServer();
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect(await health.json()).toEqual({
      status: "ok",
      service: "avid-media-composer-mcp",
      version: "0.2.0",
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
    ["wrong token with equal length", "Bearer unit-test-tokes"],
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
        Authorization: "Bearer unit-test-token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ invalid: "json-rpc" }),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid JSON-RPC");
  });
});
