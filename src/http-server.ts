#!/usr/bin/env node

import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const authToken = process.env.MCP_AUTH_TOKEN ?? "";

if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  console.error("[avid-media-composer-mcp] PORT must be an integer from 0 to 65535");
  process.exit(1);
}

if (!authToken) {
  console.error(
    "[avid-media-composer-mcp] Refusing to start remote transport without MCP_AUTH_TOKEN.",
  );
  process.exit(1);
}

function isAuthorized(request: http.IncomingMessage): boolean {
  const header = request.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(authToken);
  const candidate = Buffer.from(supplied);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export function createHttpServer(): http.Server {
  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "avid-media-composer-mcp",
        version: "0.2.0",
        transport: "streamable-http",
        liveAvidBridge: false,
      });
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      sendJson(response, 200, {
        service: "avid-media-composer-mcp",
        version: "0.2.0",
        mcpEndpoint: "/mcp",
        authentication: "Bearer token required",
        scope:
          "Hosted inspection and compatibility service. Local project files and Media Composer control require a local deployment and Extension bridge.",
      });
      return;
    }

    if (pathname !== "/mcp") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(
        response,
        401,
        { error: "Unauthorized" },
        { "WWW-Authenticate": 'Bearer realm="avid-media-composer-mcp"' },
      );
      return;
    }

    const server = createServer(loadConfig());
    const transport = new StreamableHTTPServerTransport();
    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      // SDK 1.29's Node transport declaration is structurally compatible at runtime but conflicts
      // with exactOptionalPropertyTypes because its optional callback getters include undefined.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error(
        "[avid-media-composer-mcp] HTTP request failed:",
        error instanceof Error ? error.message : String(error),
      );
      if (!response.headersSent) {
        sendJson(response, 500, { error: "Internal server error" });
      }
    }
  });
}

const httpServer = createHttpServer();
httpServer.listen(port, "0.0.0.0", () => {
  const address = httpServer.address();
  const selectedPort = typeof address === "object" && address ? address.port : port;
  console.error(
    `[avid-media-composer-mcp] Streamable HTTP listening on 0.0.0.0:${selectedPort}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
