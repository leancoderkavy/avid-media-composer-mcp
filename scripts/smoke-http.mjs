import { spawn } from "node:child_process";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = "local-http-smoke-token-32-bytes-minimum";

async function listeningPort() {
  const deadline=Date.now()+20_000;
  while(Date.now()<deadline){
    if(spawnError)throw spawnError;
    if(child.exitCode!==null||child.signalCode!==null)throw new Error("HTTP child exited before readiness");
    const match=/Streamable HTTP listening on 0\.0\.0\.0:(\d+)/.exec(stderr);
    if(match){const port=Number(match[1]);if(port>0&&port<=65535)return port;throw new Error("Invalid listener port");}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error("HTTP child did not report a listener within 20 seconds");
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if(child.exitCode!==null||child.signalCode!==null)throw new Error("HTTP child exited during health observation");
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(1000)});
      if (response.ok) return response.json();
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError ?? new Error("HTTP server did not become healthy");
}

const child = spawn(process.execPath, [path.resolve("dist/http-server.js")], {
  windowsHide:true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: "0",
    MCP_AUTH_TOKEN: token,
    AVID_MCP_ALLOWED_ROOTS: path.resolve("tests/fixtures/sample-project"),
    AVID_MCP_CAPABILITIES: "inspect",
  },
});
let stderr = "";
let spawnError;
child.on('error',error=>{spawnError=error;});
child.stderr.on("data", (chunk) => {stderr=(stderr+chunk).slice(-65536);});

try {
  const baseUrl = `http://127.0.0.1:${await listeningPort()}`;
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
    if (tools.tools.length !== 142 || ping.isError || ping.structuredContent?.ok !== true) {
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
    try{await transport.terminateSession();}finally{await client.close();}
  }
} catch(error) {
  throw new Error(`HTTP smoke failed; child exit=${child.exitCode}, signal=${child.signalCode}\n${stderr}`,{cause:error});
} finally {
  if(child.pid&&child.exitCode===null&&child.signalCode===null)child.kill();
  await new Promise((resolve) => {
    if (!child.pid||child.exitCode !== null||child.signalCode!==null) resolve();
    else child.once("exit", resolve);
  });
}

if (child.exitCode && child.exitCode !== 0 && child.exitCode !== null) {
  throw new Error(`HTTP server exited with ${child.exitCode}\n${stderr}`);
}
