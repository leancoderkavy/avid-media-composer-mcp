import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/index.js")],
  cwd: process.cwd(),
  stderr: "pipe",
  env: {
    ...getDefaultEnvironment(),
    AVID_MCP_ALLOWED_ROOTS: path.resolve("tests/fixtures/sample-project"),
    AVID_MCP_CAPABILITIES: "inspect",
  },
});
const client = new Client({ name: "avid-mcp-built-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const [tools, resources, prompts, ping] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listPrompts(),
    client.callTool({ name: "avid_ping", arguments: {} }),
  ]);
  if (tools.tools.length !== 111) throw new Error(`Expected 111 tools, got ${tools.tools.length}`);
  if (resources.resources.length !== 1) {
    throw new Error(`Expected 1 resource, got ${resources.resources.length}`);
  }
  if (prompts.prompts.length !== 2) {
    throw new Error(`Expected 2 prompts, got ${prompts.prompts.length}`);
  }
  if (ping.isError || ping.structuredContent?.ok !== true) {
    throw new Error("Built server ping failed");
  }
  console.log(
    JSON.stringify({
      ok: true,
      transport: "stdio",
      tools: tools.tools.length,
      resources: resources.resources.length,
      prompts: prompts.prompts.length,
    }),
  );
} finally {
  await client.close();
}
