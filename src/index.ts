#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { telemetry } from "./telemetry.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  telemetry.capture("mcp_server_started", {
    transport: "stdio",
    telemetry_enabled: telemetry.enabled,
  });
  console.error(
    JSON.stringify({
      type: "avid-media-composer-mcp-ready",
      version: "0.2.0",
      transport: "stdio",
      capabilities: [...config.capabilities].sort(),
      allowedRoots: config.allowedRoots,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      type: "avid-media-composer-mcp-fatal",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void telemetry.shutdown().finally(() => process.exit(0));
  });
}
