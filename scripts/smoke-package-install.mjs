import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const root = process.cwd();
const withPython = process.argv.includes("--with-python");
if (process.argv.slice(2).some(arg => arg !== "--with-python")) throw new Error("Unknown package smoke option");
const localPython = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = existsSync(localPython) ? localPython : process.env.AVID_MCP_PYTHON || (process.platform === "win32" ? "python" : "python3");

function npmInvocation(args) {
  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  return existsSync(npmCli)
    ? { command: process.execPath, args: [npmCli, ...args] }
    : { command: process.platform === "win32" ? "npm.cmd" : "npm", args };
}

function runNpm(args, cwd, capture = false) {
  const invocation = npmInvocation(args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`npm ${args.join(" ")} failed (${code})\n${stderr.trim()}\n${stdout.trim()}`));
    });
  });
}

const temporary = await mkdtemp(path.join(os.tmpdir(), "avid-mcp-package-smoke-"));
let tarball;
let client;

try {
  await runNpm(["run", "build"], root);
  const packed = await runNpm(["pack", "--json", "--ignore-scripts"], root, true);
  const packResult = JSON.parse(packed.stdout);
  const filename = packResult[0]?.filename;
  if (typeof filename !== "string" || path.basename(filename) !== filename) {
    throw new Error("npm pack returned an unsafe or missing filename");
  }
  tarball = path.resolve(root, filename);
  if (path.dirname(tarball) !== path.resolve(root)) {
    throw new Error("Refusing to use a tarball outside the repository root");
  }

  await writeFile(
    path.join(temporary, "package.json"),
    `${JSON.stringify({ name: "avid-mcp-package-smoke", private: true })}\n`,
    "utf8",
  );
  await runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    temporary,
  );

  const installedRoot = path.join(temporary, "node_modules", "avid-media-composer-mcp");
  await runNpm(["audit", "--omit=dev", "--audit-level=high"], temporary, true);
  const installedPackage = JSON.parse(
    await readFile(path.join(installedRoot, "package.json"), "utf8"),
  );
  if (installedPackage.bin?.["avid-media-composer-mcp"] !== "dist/index.js") {
    throw new Error("Installed package does not expose the expected CLI entry point");
  }

  // A client may launch MCP from a project containing a conflicting Python file.
  // Resolve in a separate process so the installed package and actual CWD are used.
  await mkdir(path.join(temporary, "python"));
  await writeFile(path.join(temporary, "python", "avid_inspector.py"), "raise RuntimeError('untrusted working-folder sidecar')\n");
  const packagedSidecar = path.join(installedRoot, "python", "avid_inspector.py");
  const resolverUrl = pathToFileURL(path.join(installedRoot, "dist", "analysis", "python-sidecar.js")).href;
  const resolveInstalled = () => spawnSync(process.execPath, ["--input-type=module", "--eval",
    `const {resolvePythonSidecar}=await import(${JSON.stringify(resolverUrl)}); console.log(await resolvePythonSidecar());`],
    {cwd:temporary, encoding:"utf8", timeout:10000, windowsHide:true});
  const resolved = resolveInstalled();
  if (resolved.error || resolved.status !== 0 || await realpath(resolved.stdout.trim()) !== await realpath(packagedSidecar)) {
    throw new Error("Installed inspector did not resolve exclusively inside its package");
  }
  await rename(packagedSidecar, `${packagedSidecar}.held`);
  try {
    const missing = resolveInstalled();
    if (missing.error || missing.status !== 1 || !missing.stderr.includes("PYTHON_SIDECAR_MISSING")) {
      throw new Error("Missing packaged inspector did not fail closed with a conflicting CWD script");
    }
  } finally {
    await rename(`${packagedSidecar}.held`, packagedSidecar);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(installedRoot, "dist", "index.js")],
    cwd: temporary,
    stderr: "pipe",
    env: {
      ...getDefaultEnvironment(),
      AVID_MCP_ALLOWED_ROOTS: path.resolve(root, "tests", "fixtures", "sample-project"),
      AVID_MCP_CAPABILITIES: "inspect",
      AVID_MCP_OUTPUT_ROOT: temporary,
      ...(withPython ? {AVID_MCP_PYTHON:python} : {}),
    },
  });
  client = new Client({ name: "avid-mcp-package-install-smoke", version: "1.0.0" });
  await client.connect(transport);
  const [tools, ping] = await Promise.all([
    client.listTools(),
    client.callTool({ name: "avid_ping", arguments: {} }),
  ]);
  if (tools.tools.length !== 131 || ping.isError || ping.structuredContent?.ok !== true) {
    throw new Error("Fresh package installation did not pass MCP discovery and ping");
  }
  // Tool count alone cannot detect schema changes from newly resolved dependencies.
  const checkoutClient = new Client({name:"avid-mcp-checkout-schema-reference",version:"1.0.0"});
  try {
    await checkoutClient.connect(new StdioClientTransport({
      command:process.execPath,args:[path.join(root,"dist","index.js")],cwd:temporary,stderr:"pipe",
      env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve(root,"tests","fixtures","sample-project"),AVID_MCP_CAPABILITIES:"inspect"},
    }));
    const reference=await checkoutClient.listTools();
    if(reference.nextCursor||tools.nextCursor)throw new Error("Package schema comparison requires complete discovery; implement pagination before increasing server page count");
    const byName=(a,b)=>a.name.localeCompare(b.name);
    if(!isDeepStrictEqual([...reference.tools].sort(byName),[...tools.tools].sort(byName))) {
      const expected=new Map(reference.tools.map(tool=>[tool.name,tool]));
      const changed=tools.tools.filter(tool=>!isDeepStrictEqual(expected.get(tool.name),tool)).map(tool=>tool.name);
      throw new Error(`Installed tool definitions differ from checkout: ${changed.join(", ") || "tool inventory changed"}`);
    }
  } finally {await checkoutClient.close();}
  const snapshotDirectory=path.join(temporary,"avid-mcp-library");
  await mkdir(snapshotDirectory,{recursive:true});
  const baseline="00000000-0000-4000-8000-000000000001",candidate="00000000-0000-4000-8000-000000000002";
  const fixtureMob={mobId:"sequence",name:"Before",mobType:"CompositionMob",usageCode:0,rate:30,duration:60,sourceBounds:{start:0,end:60},tracks:[{ordinal:0,index:1,mediaKind:"picture",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:30,sourceMobId:"source",sourceStart:90},{kind:"SCLP",timelineStart:30,timelineEnd:60,sourceMobId:"source",sourceStart:120}]}]};
  const record={revision:baseline,createdAt:"synthetic-package-fixture",bins:[{schema:1,file:path.resolve(root,"tests","fixtures","sample-project","Editorial.avb"),sha256:"a".repeat(64),mobs:[fixtureMob,{...fixtureMob,mobId:"second"}],warnings:[],complete:true,nodeCount:4,stateOrigin:"synthetic"}]};
  await writeFile(path.join(snapshotDirectory,`snapshot-${baseline}.json`),JSON.stringify(record));
  record.revision=candidate;for(const mob of record.bins[0].mobs)mob.name="After";
  await writeFile(path.join(snapshotDirectory,`snapshot-${candidate}.json`),JSON.stringify(record));
  const invoke=async(name,args)=>{const response=await client.callTool({name,arguments:args});if(response.isError||!response.structuredContent?.ok)throw new Error(`Installed pagination call failed: ${name}`);return response.structuredContent.data;};
  const discovered=await invoke("avid_saved_snapshots",{limit:1});
  const discoveredLast=await invoke("avid_saved_snapshots",{limit:1,after:discovered.nextAfter});
  if(discovered.snapshots[0]?.revision!==baseline||discoveredLast.snapshots[0]?.revision!==candidate||discoveredLast.nextAfter!==null)throw new Error("Installed snapshot discovery failed");
  const diff=await invoke("avid_diff_saved_snapshots",{baseline,candidate,limit:1});
  const diffLast=await invoke("avid_diff_saved_snapshots",{baseline,candidate,limit:1,after:diff.nextAfter});
  const usage=await invoke("avid_saved_source_usage",{revision:baseline,sourceMobId:"source",limit:3});
  const usageLast=await invoke("avid_saved_source_usage",{revision:baseline,sourceMobId:"source",limit:3,after:usage.nextAfter});
  const range=await invoke("avid_saved_timeline_range",{revision:baseline,mobId:"sequence",start:0,end:60,limit:1});
  const rangeLast=await invoke("avid_saved_timeline_range",{revision:baseline,mobId:"sequence",start:0,end:60,limit:1,after:range.nextAfter});
  if(diff.totalChanges!==2||diffLast.changes[0]?.index!==1||diffLast.nextAfter!==null||usage.totalReferences!==4||usageLast.usages[0]?.index!==3||usageLast.nextAfter!==null||rangeLast.results[0]?.overlapSourceStart!==120||rangeLast.nextAfter!==null)throw new Error("Installed snapshot pagination contract failed");
  if (withPython) {
    const inspectDependency = async () => {
      const result = await client.callTool({name:"avid_get_capabilities",arguments:{}});
      if (result.isError || !result.structuredContent?.ok) throw new Error("Installed capability request failed");
      return result.structuredContent.data?.dependencies?.pythonInspector;
    };
    const available = await inspectDependency();
    if (!available?.available || !available.packages?.pyavb || !available.packages?.pyaaf2) {
      throw new Error("Installed MCP did not execute the packaged Python inspector from the conflicting working folder");
    }
    await rename(packagedSidecar, `${packagedSidecar}.held`);
    try {
      const missing = await inspectDependency();
      if (missing?.available !== false || !missing.error?.includes("avid_inspector.py was not found")) {
        throw new Error("Installed MCP did not report missing packaged Python inspector without fallback");
      }
    } finally {
      await rename(`${packagedSidecar}.held`, packagedSidecar);
    }
    if (!(await inspectDependency())?.available) throw new Error("Restored packaged inspector did not recover");
  }
  const skillNames = ["avid-ingest-qc", "avid-selects", "avid-review-markers", "avid-turnover", "avid-export"];
  const toolNames = new Set(tools.tools.map(tool => tool.name));
  for (const name of skillNames) {
    const instructions = (await readFile(path.join(installedRoot, "skills", name, "SKILL.md"), "utf8")).replaceAll("\r\n", "\n");
    if (!instructions.startsWith(`---\nname: ${name}\n`) || !instructions.includes("\ndescription: ")) {
      throw new Error(`Packaged skill has invalid discovery metadata: ${name}`);
    }
    for (const [reference] of instructions.matchAll(/\bavid_[a-z_]+\b/g)) {
      if (!toolNames.has(reference)) throw new Error(`Packaged skill ${name} references missing tool ${reference}`);
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      package: `${installedPackage.name}@${installedPackage.version}`,
      tools: tools.tools.length,
      skills: skillNames.length,
      install: "fresh-tarball",
      toolDefinitions: "exact checkout match",
      snapshotPagination: "synthetic diff, usage and range continuation passed",
      sidecarIsolation: "package-only; missing package fails closed",
      pythonMcpIsolation: withPython ? "available; missing rejected; restored" : "not requested",
    }),
  );
} finally {
  await client?.close();
  const resolvedTemporary = path.resolve(temporary);
  if (!resolvedTemporary.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolvedTemporary).startsWith("avid-mcp-package-smoke-")) {
    throw new Error("Refusing cleanup outside the package smoke-test temporary directory");
  }
  await rm(resolvedTemporary, { recursive: true, force: true });
  if (tarball && path.dirname(tarball) === path.resolve(root)) {
    await rm(tarball, { force: true });
  }
}
