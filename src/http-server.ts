#!/usr/bin/env node

import { createHttpServer } from "./http-app.js";
import { telemetry } from "./telemetry.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const authToken = process.env.MCP_AUTH_TOKEN ?? "";

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

const httpServer = createHttpServer({ authToken });
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
