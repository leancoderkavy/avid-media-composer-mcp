#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { telemetry } from "./telemetry.js";
import { SERVER_VERSION } from "./version.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  let shutdown: Promise<void> | undefined;
  const close = () => {
    shutdown ??= (async () => {
      try { await server.close(); }
      finally { await telemetry.shutdown(); }
      // Worker handles keep the loop alive until their cancellation/exit journals
      // settle. A forced process.exit here would abandon that cleanup.
    })().catch((error: unknown) => {
      console.error(JSON.stringify({type:"avid-media-composer-mcp-shutdown-error",error:error instanceof Error?error.message:String(error)}));
      process.exitCode = 1;
    });
  };
  process.stdin.once("end", close);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, close);
  telemetry.capture("avid_mcp_server_started", {
    transport: "stdio",
    telemetry_enabled: telemetry.enabled,
  });
  console.error(
    JSON.stringify({
      type: "avid-media-composer-mcp-ready",
      version: SERVER_VERSION,
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
