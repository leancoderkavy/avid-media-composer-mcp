#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    JSON.stringify({
      type: "avid-media-composer-mcp-ready",
      version: "0.1.0",
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
