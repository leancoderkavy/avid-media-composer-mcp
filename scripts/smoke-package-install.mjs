import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {createHash} from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile,readdir } from "node:fs/promises";
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
  const {MediaLibrary}=await import(pathToFileURL(path.join(installedRoot,"dist","library","media-library.js")).href);
  const {loadConfig}=await import(pathToFileURL(path.join(installedRoot,"dist","config.js")).href);
  const reportRoot=path.join(temporary,"report-fixture");await mkdir(reportRoot);
  const reportSource=path.join(reportRoot,"fixture.wav"),reportBytes=Buffer.from("installed inventory fixture"),reportId=createHash("sha256").update(reportBytes).digest("hex");
  await writeFile(reportSource,reportBytes);
  const reportLibrary=new MediaLibrary(loadConfig({AVID_MCP_ALLOWED_ROOTS:reportRoot,AVID_MCP_OUTPUT_ROOT:reportRoot,AVID_MCP_CAPABILITIES:"inspect,export"}));
  const reportDirectory=await reportLibrary.directory();
  await writeFile(path.join(reportDirectory,`${reportId}.json`),JSON.stringify({id:reportId,file:reportSource,bytes:reportBytes.length,transcript:[],metadata:{format:{duration:"1",tags:{make:"<camera>"}},streams:[{index:3,codec_type:"audio",codec_name:"pcm_s16le",channels:2}]}}));
  const inventory=await reportLibrary.report([reportId]),inventoryHtml=await readFile(inventory.output,"utf8");
  if(!inventoryHtml.includes("Stream 3")||!inventoryHtml.includes("pcm_s16le")||!inventoryHtml.includes("&lt;camera&gt;")||!inventoryHtml.includes('data-label="SHA-256"'))throw new Error("Installed inventory report lost stream, escaped tag or responsive field output");
  const reportFiles=(await readdir(reportDirectory)).sort();await writeFile(reportSource,"changed fixture");
  let staleRejected=false;try{await reportLibrary.report([reportId]);}catch(error){staleRejected=error.message.includes("Source changed since indexing");}
  if(!staleRejected||!isDeepStrictEqual(reportFiles,(await readdir(reportDirectory)).sort())||await readFile(inventory.output,"utf8")!==inventoryHtml)throw new Error("Installed inventory report did not preserve prior output on changed-source refusal");
  const {verifyFaceLicenses}=await import(pathToFileURL(path.join(installedRoot,"dist","library","face-runtime.js")).href);
  await verifyFaceLicenses(path.join(installedRoot,"docs","licenses"));
  const {installModelNotice}=await import(pathToFileURL(path.join(installedRoot,"dist","library","model-notices.js")).href);
  for(const model of ["Xenova/distilbart-cnn-6-6","onnx-community/whisper-base","Xenova/clip-vit-base-patch32","onnx-community/whisper-tiny","onnx-community/whisper-tiny.en","onnx-community/Florence-2-base-ft"]){
    const cache=path.join(temporary,"notice-cache");
    if(!(await installModelNotice(cache,model,"a".repeat(40))).created||(await installModelNotice(cache,model,"a".repeat(40))).created)throw new Error("Installed model notice creation/reuse failed");
  }
  const originalNotices=JSON.parse(await readFile(path.join(root,"docs","original-model-notices.json"),"utf8"));
  for(const notice of originalNotices){
    if(!/^docs\/licenses\/[a-z0-9-]+\.LICENSE$/.test(notice.file))throw new Error("Unexpected original notice path");
    const bytes=await readFile(path.join(installedRoot,notice.file));
    if(bytes.length!==notice.bytes||createHash("sha256").update(bytes).digest("hex")!==notice.sha256)throw new Error(`Packaged upstream notice differs: ${notice.file}`);
  }
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

  // Exercise the installed setup CLI from a foreign working directory, then
  // launch exactly the command it tells users to put into their MCP client.
  let generatedEntry;
  for(const format of ["generic","claude","cursor","vscode","lmstudio"]){
    const generated=spawnSync(process.execPath,[path.join(installedRoot,"dist","cli.js"),
      "--client",format,"--root",path.resolve(root,"tests","fixtures","sample-project"),
      "--output",temporary,...(withPython&&path.isAbsolute(python)?["--python",python]:[])],
      {cwd:temporary,env:getDefaultEnvironment(),encoding:"utf8",timeout:10000,windowsHide:true});
    if(generated.error||generated.status!==0)throw new Error(`Installed ${format} setup failed: ${generated.stderr}`);
    const config=JSON.parse(generated.stdout),entry=(format==="vscode"?config.servers:config.mcpServers)?.["avid-media-composer"];
    if(format==="vscode"){
      if(entry?.type!=="stdio")throw new Error("Installed VS Code setup omitted stdio type");
      delete entry.type;
    }
    if(!entry||entry.command!==process.execPath||!Array.isArray(entry.args)||entry.args.length!==1||!path.isAbsolute(entry.args[0])||await realpath(entry.args[0])!==await realpath(path.join(installedRoot,"dist","index.js"))||entry.env?.AVID_MCP_CAPABILITIES!=="inspect")throw new Error(`Installed ${format} setup selected an unexpected server or authority`);
    if(generatedEntry&&!isDeepStrictEqual(entry,generatedEntry))throw new Error(`Installed ${format} setup differs from generic configuration`);
    generatedEntry=entry;
  }
  const transport = new StdioClientTransport({
    command: generatedEntry.command,
    args: generatedEntry.args,
    cwd: temporary,
    stderr: "pipe",
    env: {
      ...getDefaultEnvironment(),
      ...generatedEntry.env,
      ...(withPython ? {AVID_MCP_PYTHON:python} : {}),
    },
  });
  client = new Client({ name: "avid-mcp-package-install-smoke", version: "1.0.0" });
  await client.connect(transport);
  const [tools, ping] = await Promise.all([
    client.listTools(),
    client.callTool({ name: "avid_ping", arguments: {} }),
  ]);
  if (tools.tools.length !== 135 || ping.isError || ping.structuredContent?.ok !== true) {
    throw new Error("Fresh package installation did not pass MCP discovery and ping");
  }
  const optionalProvider=await client.callTool({name:"avid_jumper_read",arguments:{operation:"health"}});
  if(!optionalProvider.isError||!JSON.stringify(optionalProvider).includes("Optional Jumper provider is not configured"))throw new Error("Unconfigured installed provider did not fail closed");
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
  const recoveredRevision=discovered.snapshots[0].revision;
  const recoveredMobs=await invoke("avid_saved_snapshot_mobs",{revision:recoveredRevision,limit:1});
  const recoveredMobsLast=await invoke("avid_saved_snapshot_mobs",{revision:recoveredRevision,limit:1,after:recoveredMobs.nextAfter});
  if(recoveredMobs.totalMobs!==2||recoveredMobs.mobs[0]?.mobId!=="sequence"||recoveredMobsLast.mobs[0]?.mobId!=="second"||recoveredMobsLast.nextAfter!==null)throw new Error("Installed snapshot mob discovery failed");
  const diff=await invoke("avid_diff_saved_snapshots",{baseline,candidate,limit:1});
  const diffLast=await invoke("avid_diff_saved_snapshots",{baseline,candidate,limit:1,after:diff.nextAfter});
  const usage=await invoke("avid_saved_source_usage",{revision:baseline,sourceMobId:"source",limit:3});
  const usageLast=await invoke("avid_saved_source_usage",{revision:baseline,sourceMobId:"source",limit:3,after:usage.nextAfter});
  const range=await invoke("avid_saved_timeline_range",{revision:recoveredRevision,mobId:recoveredMobs.mobs[0].mobId,start:0,end:60,limit:1});
  const rangeLast=await invoke("avid_saved_timeline_range",{revision:recoveredRevision,mobId:recoveredMobs.mobs[0].mobId,start:0,end:60,limit:1,after:range.nextAfter});
  if(diff.totalChanges!==2||diffLast.changes[0]?.index!==1||diffLast.nextAfter!==null||usage.totalReferences!==4||usageLast.usages[0]?.index!==3||usageLast.nextAfter!==null||rangeLast.results[0]?.overlapSourceStart!==120||rangeLast.nextAfter!==null)throw new Error("Installed snapshot pagination contract failed");
  const resolutionRevision="00000000-0000-4000-8000-000000000003";
  const resolutionMob={...fixtureMob,tracks:[{...fixtureMob.tracks[0],nodes:Array.from({length:12},(_,i)=>({kind:"SCLP",timelineStart:i*5,timelineEnd:(i+1)*5,sourceMobId:`source-${String(i).padStart(2,"0")}`,sourceStart:0}))}]};
  const sourceRecord=id=>({...fixtureMob,mobId:id,tracks:[]});
  const resolutionRecord={...record,revision:resolutionRevision,bins:[{...record.bins[0],mobs:[resolutionMob,sourceRecord("source-00"),sourceRecord("source-01"),sourceRecord("source-01")],nodeCount:12}]};
  await writeFile(path.join(snapshotDirectory,`snapshot-${resolutionRevision}.json`),JSON.stringify(resolutionRecord));
  const resolutionRows=[];let resolutionAfter=-1;
  for(let page=0;page<4;page++){
    const result=await invoke("avid_saved_source_resolution",{revision:resolutionRevision,after:resolutionAfter,limit:5});
    resolutionRows.push(...result.sources);
    if(result.nextAfter===null)break;
    if(result.nextAfter<=resolutionAfter)throw new Error("Installed source-resolution cursor did not advance");
    resolutionAfter=result.nextAfter;
  }
  if(resolutionRows.length!==12||new Set(resolutionRows.map(row=>row.sourceMobId)).size!==12||resolutionRows[0]?.status!=="resolved"||resolutionRows[1]?.status!=="ambiguous"||resolutionRows.slice(2).some(row=>row.status!=="unresolved"))throw new Error("Installed source-resolution pagination or classification failed");
  const traceRevision="00000000-0000-4000-8000-000000000004";
  const stereo={...fixtureMob,mobId:"stereo",tracks:[{ordinal:0,index:1,mediaKind:"sound",nodes:[1,2].map(channel=>({kind:"SCLP",timelineStart:0,timelineEnd:30,sourceMobId:"master",sourceTrackId:channel,sourceStart:5,channelCombiner:{channelIndex:channel,channelCount:2}}))}]};
  const master={...fixtureMob,mobId:"master",tracks:[1,2].map(channel=>({ordinal:channel-1,index:channel,mediaKind:"sound",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:60,sourceMobId:"external",sourceTrackId:channel,sourceStart:channel===1?7:9}]}))};
  const traceRecord={...record,revision:traceRevision,bins:[{...record.bins[0],mobs:[stereo,master],nodeCount:4}]};
  await writeFile(path.join(snapshotDirectory,`snapshot-${traceRevision}.json`),JSON.stringify(traceRecord));
  const trace=await invoke("avid_trace_saved_sources",{revision:traceRevision,mobId:"stereo",bin:traceRecord.bins[0].file,start:15,end:25});
  const mapped=trace.steps.map(step=>[step.depth,step.sourceTrackId,step.sourceStart,step.sourceEnd,step.status,step.channelCombiner?.channelIndex??null]);
  if(!trace.incomplete||!isDeepStrictEqual(mapped,[[0,1,20,30,"reference",1],[1,1,27,37,"unresolved",null],[0,2,20,30,"reference",2],[1,2,29,39,"unresolved",null]]))throw new Error("Installed stereo source trace lost channel identity or clipped offsets");
  const invalidTrace=await client.callTool({name:"avid_trace_saved_sources",arguments:{revision:traceRevision,mobId:"stereo",start:0,end:61}});
  if(!invalidTrace.isError)throw new Error("Installed source trace accepted a range beyond the mob duration");
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
      clientSetup: "five installed CLI formats agree; generated command connected from foreign working directory",
      snapshotPagination: "synthetic diff, usage, range and source-resolution continuation passed",
      sourceTrace: "installed stereo channels, clipped downstream offsets, unresolved endpoints and invalid-range refusal passed",
      faceNotices: "both packaged model licenses match pinned upstream bytes",
      originalNotices: "packaged original-project notices match recorded upstream bytes",
      cachedNotices: "six model notice mappings create and reuse from installed package",
      inventoryReport: "installed stream/tag rendering and changed-source refusal preserve prior output",
      snapshotRecovery: "revision discovery to mob inventory to timeline query passed",
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
