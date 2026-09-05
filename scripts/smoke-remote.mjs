import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.MCP_URL;
const token = process.env.MCP_AUTH_TOKEN;
if (!endpoint || !token) {
  throw new Error("MCP_URL and MCP_AUTH_TOKEN are required");
}

const healthUrl = new URL("/health", endpoint);
const health = await fetch(healthUrl);
if (!health.ok) throw new Error(`Health check returned ${health.status}`);

const unauthenticated = await fetch(endpoint, { method: "POST" });
if (unauthenticated.status !== 401) {
  throw new Error(`Expected unauthenticated /mcp to return 401, got ${unauthenticated.status}`);
}

const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "avid-remote-smoke", version: "1.0.0" });
await client.connect(transport);
try {
  const [tools, capabilities] = await Promise.all([
    client.listTools(),
    client.callTool({ name: "avid_get_capabilities", arguments: {} }),
  ]);
  if (tools.tools.length !== 95 || capabilities.isError) {
    throw new Error("Remote MCP protocol validation failed");
  }
  console.log(
    JSON.stringify({
      ok: true,
      endpoint,
      health: await health.json(),
      unauthorizedStatus: unauthenticated.status,
      tools: tools.tools.length,
    }),
  );
} finally {
  await client.close();
}
