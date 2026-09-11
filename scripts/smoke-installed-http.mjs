import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Exercise the installed entry from a foreign cwd, without inheriting provider
// credentials, telemetry configuration or native/write capabilities.
export async function smokeInstalledHttp({ installedRoot, fixtureRoot, expectedTools, expectedAle }) {
  assert.ok(path.isAbsolute(installedRoot) && path.isAbsolute(fixtureRoot));
  assert.ok(expectedTools.length > 0 && expectedAle.rowCount > 0);
  const alePath = path.join(fixtureRoot, "Clips.ale");
  const digest = async () => createHash("sha256").update(await readFile(alePath)).digest("hex");
  const before = await digest();
  const token = randomBytes(32).toString("hex");
  const started = performance.now();
  const child = spawn(process.execPath, [path.join(installedRoot, "dist/http-server.js")], {
    cwd: fixtureRoot,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...getDefaultEnvironment(), PORT: "0", MCP_AUTH_TOKEN: token,
      AVID_MCP_ALLOWED_ROOTS: fixtureRoot, AVID_MCP_CAPABILITIES: "inspect",
    },
  });
  let stderr = "", spawnError;
  child.on("error", error => { spawnError = error; });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-65536); });
  const client = new Client({ name: "avid-installed-http-smoke", version: "1.0.0" });
  let transport;
  try {
    let port;
    const deadline = Date.now() + 20_000;
    while (!port && Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Installed HTTP server exited before readiness");
      const match = /Streamable HTTP listening on 0\.0\.0\.0:(\d+)/.exec(stderr);
      if (match) port = Number(match[1]);
      else await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, "Installed HTTP server did not report a valid port");
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200);
    for (const authorization of [undefined, "Bearer invalid-smoke-token"]) {
      const response = await fetch(`${base}/mcp`, {
        method: "POST", signal: AbortSignal.timeout(5000),
        headers: authorization ? { Authorization: authorization } : {},
      });
      assert.equal(response.status, 401, "Installed HTTP must reject absent and incorrect credentials");
    }
    transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport, { timeout: 10000 });
    const connectionMs = Math.round(performance.now() - started);
    const tools = await client.listTools({}, { timeout: 10000 });
    assert.equal(tools.nextCursor, undefined, "Installed HTTP comparison requires complete discovery");
    const byName = (a, b) => a.name.localeCompare(b.name);
    assert.deepEqual([...tools.tools].sort(byName), [...expectedTools].sort(byName), "Installed HTTP tool definitions differ from stdio");
    const ping = await client.callTool({ name: "avid_ping", arguments: {} }, undefined, { timeout: 10000 });
    assert.ok(!ping.isError && ping.structuredContent?.ok === true, "Installed HTTP ping failed");
    const analysis = await client.callTool({ name: "avid_analyze_ale", arguments: { ale_path: alePath } }, undefined, { timeout: 10000 });
    assert.ok(!analysis.isError && analysis.structuredContent?.ok === true, "Installed HTTP ALE analysis failed");
    assert.deepEqual(analysis.structuredContent.data, expectedAle, "Installed HTTP ALE result differs from stdio");
    assert.equal(await digest(), before, "Installed HTTP analysis changed source bytes");
    return { ok: true, tools: tools.tools.length, connectionMs, unauthorizedStatus: 401, incorrectTokenStatus: 401, aleRows: expectedAle.rowCount, sourceUnchanged: true };
  } catch (error) {
    // Never include the random credential in retained diagnostics.
    throw new Error(`Installed HTTP smoke failed: ${stderr.replaceAll(token, "[redacted]")}`, { cause: error });
  } finally {
    // Bound cleanup independently of a broken HTTP endpoint.
    try { await client.close(); } finally {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Installed HTTP child did not stop")), 5000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
          if (child.exitCode !== null || child.signalCode !== null) { clearTimeout(timer); resolve(); }
        });
      }
    }
  }
}
