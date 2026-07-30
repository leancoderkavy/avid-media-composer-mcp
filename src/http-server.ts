#!/usr/bin/env node

import { createHttpServer } from "./http-app.js";
import { telemetry } from "./telemetry.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const authToken = process.env.MCP_AUTH_TOKEN ?? "";

function optionalPositiveInteger(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.error(`[avid-media-composer-mcp] ${name} must be a positive integer`);
    process.exit(1);
  }
  return parsed;
}

if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  console.error("[avid-media-composer-mcp] PORT must be an integer from 0 to 65535");
  process.exit(1);
}

if (Buffer.byteLength(authToken, "utf8") < 32) {
  console.error(
    "[avid-media-composer-mcp] Refusing to start remote transport unless MCP_AUTH_TOKEN contains at least 32 bytes.",
  );
  process.exit(1);
}

const publicRateLimitPerMinute = optionalPositiveInteger(
  "AVID_MCP_PUBLIC_RATE_LIMIT_PER_MINUTE",
);
const unauthorizedRateLimitPerMinute = optionalPositiveInteger(
  "AVID_MCP_UNAUTHORIZED_RATE_LIMIT_PER_MINUTE",
);
const authenticatedRateLimitPerMinute = optionalPositiveInteger(
  "AVID_MCP_AUTHENTICATED_RATE_LIMIT_PER_MINUTE",
);

const httpServer = createHttpServer({
  authToken,
  ...(publicRateLimitPerMinute !== undefined ? { publicRateLimitPerMinute } : {}),
  ...(unauthorizedRateLimitPerMinute !== undefined ? { unauthorizedRateLimitPerMinute } : {}),
  ...(authenticatedRateLimitPerMinute !== undefined
    ? { authenticatedRateLimitPerMinute }
    : {}),
});
httpServer.listen(port, "0.0.0.0", () => {
  const address = httpServer.address();
  const selectedPort = typeof address === "object" && address ? address.port : port;
  console.error(
    `[avid-media-composer-mcp] Streamable HTTP listening on 0.0.0.0:${selectedPort}`,
  );
  telemetry.capture("avid_mcp_server_started", {
    transport: "streamable-http",
    telemetry_enabled: telemetry.enabled,
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => {
      void telemetry.shutdown().finally(() => process.exit(0));
    });
  });
}
