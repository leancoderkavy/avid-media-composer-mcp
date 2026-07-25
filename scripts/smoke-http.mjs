import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = "local-http-smoke-token";

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolve) => listener.close(resolve));
  if (!port) throw new Error("Could not allocate a smoke-test port");
  return port;
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError ?? new Error("HTTP server did not become healthy");
}

const port = await unusedPort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.resolve("dist/http-server.js")], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(port),
    MCP_AUTH_TOKEN: token,
    AVID_MCP_ALLOWED_ROOTS: path.resolve("tests/fixtures/sample-project"),
    AVID_MCP_CAPABILITIES: "inspect",
  },
});
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));

try {
  const health = await waitForHealth(`${baseUrl}/health`);
  const unauthorized = await fetch(`${baseUrl}/mcp`, { method: "POST" });
  if (unauthorized.status !== 401) {
    throw new Error(`Expected unauthenticated MCP request to return 401, got ${unauthorized.status}`);
  }

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "avid-http-smoke", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const ping = await client.callTool({ name: "avid_ping", arguments: {} });
    if (tools.tools.length !== 19 || ping.isError || ping.structuredContent?.ok !== true) {
      throw new Error("Authenticated Streamable HTTP MCP validation failed");
    }
    console.log(
      JSON.stringify({
        ok: true,
        health,
        unauthorizedStatus: unauthorized.status,
        tools: tools.tools.length,
      }),
    );
  } finally {
    await client.close();
  }
} finally {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
}

if (child.exitCode && child.exitCode !== 0 && child.exitCode !== null) {
  throw new Error(`HTTP server exited with ${child.exitCode}\n${stderr}`);
}
