import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {createHash} from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile,readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {smokeAafPackage} from "./smoke-aaf-package.mjs";
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
  const {installRuntimeNotices,runtimeNoticePackages}=await import(pathToFileURL(path.join(installedRoot,"dist","library","runtime-notices.js")).href);
  const runtimeNoticeCache=path.join(temporary,"runtime-notice-cache"),runtimeNoticeFixture=path.join(runtimeNoticeCache,"runtime");
  for(const item of runtimeNoticePackages){const directory=path.join(runtimeNoticeFixture,"node_modules",item.name);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,"package.json"),JSON.stringify({name:item.name,version:item.version}));}
  const createdNotices=await installRuntimeNotices(runtimeNoticeCache,runtimeNoticeFixture),reusedNotices=await installRuntimeNotices(runtimeNoticeCache,runtimeNoticeFixture);
  if(createdNotices.packages.flatMap(p=>p.files).length!==4||!createdNotices.packages.every(p=>p.files.every(f=>f.created))||!reusedNotices.packages.every(p=>p.files.every(f=>!f.created)))throw new Error("Installed runtime notice publication/reuse failed");
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
  for(const format of ["generic","claude","cursor","vscode","lmstudio","codex"]){
    const generated=spawnSync(process.execPath,[path.join(installedRoot,"dist","cli.js"),
      "--client",format,"--root",path.resolve(root,"tests","fixtures","sample-project"),
      "--output",temporary,...(withPython&&path.isAbsolute(python)?["--python",python]:[])],
      {cwd:temporary,env:getDefaultEnvironment(),encoding:"utf8",timeout:10000,windowsHide:true});
    if(generated.error||generated.status!==0)throw new Error(`Installed ${format} setup failed: ${generated.stderr}`);
    const config=JSON.parse(generated.stdout);
    let entry=(format==="vscode"?config.servers:config.mcpServers)?.["avid-media-composer"];
    if(format==="codex"){
      if(config.command!=="codex"||!Array.isArray(config.args)||!isDeepStrictEqual(config.args.slice(0,3),["mcp","add","avid-media-composer"]))throw new Error("Installed Codex setup omitted add command");
      const separator=config.args.indexOf("--",3),env={};
      if(separator<3||(separator-3)%2!==0)throw new Error("Installed Codex setup has malformed environment arguments");
      for(let i=3;i<separator;i+=2){
        const value=config.args[i+1],equals=typeof value==="string"?value.indexOf("="):-1;
        if(config.args[i]!=="--env"||equals<1)throw new Error("Installed Codex setup has malformed environment assignment");
        const key=value.slice(0,equals);if(Object.hasOwn(env,key))throw new Error("Installed Codex setup repeats an environment key");
        env[key]=value.slice(equals+1);
      }
      entry={command:config.args[separator+1],args:config.args.slice(separator+2),env};
    }
    if(format==="vscode"){
      if(entry?.type!=="stdio")throw new Error("Installed VS Code setup omitted stdio type");
      delete entry.type;
    }
    if(!entry||entry.command!==process.execPath||!Array.isArray(entry.args)||entry.args.length!==1||!path.isAbsolute(entry.args[0])||await realpath(entry.args[0])!==await realpath(path.join(installedRoot,"dist","index.js"))||entry.env?.AVID_MCP_CAPABILITIES!=="inspect")throw new Error(`Installed ${format} setup selected an unexpected server or authority`);
    if(generatedEntry&&!isDeepStrictEqual(entry,generatedEntry))throw new Error(`Installed ${format} setup differs from generic configuration`);
    generatedEntry=entry;
  }
  const codexConfig=path.join(temporary,"codex-config.toml"),codexOriginal='model = "preserve-fixture"\n[mcp_servers.other]\ncommand = "preserve-other-server"\n';
  await writeFile(codexConfig,codexOriginal,{flag:"wx"});
  for(const mutation of [["--install"],["--update"],["--remove"],["--restore",path.join(temporary,"unused-backup.json")]]){
    const refused=spawnSync(process.execPath,[path.join(installedRoot,"dist","cli.js"),"--client","codex","--root",temporary,"--config",codexConfig,"--expected-sha256","a".repeat(64),...mutation],{cwd:temporary,env:getDefaultEnvironment(),encoding:"utf8",timeout:10000,windowsHide:true});
    if(refused.error||refused.status!==1)throw new Error(`Installed Codex JSON mutation was not refused: ${mutation[0]}`);
    if(await readFile(codexConfig,"utf8")!==codexOriginal)throw new Error("Installed setup modified Codex TOML through JSON lifecycle");
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
  if (tools.tools.length !== 139 || ping.isError || ping.structuredContent?.ok !== true) {
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
  const {verifySavedDualRollerTrim}=await import(pathToFileURL(path.join(installedRoot,"dist/native/trim-verifier.js")).href);
  const trimMob=structuredClone(fixtureMob);for(const node of trimMob.tracks[0].nodes)node.sourceTrackId=1;
  const trimBefore={schema:1,complete:true,warnings:[],mobs:[trimMob,{...trimMob,mobId:"source",mobType:"MasterMob",duration:1000,sourceBounds:{start:0,end:1000},tracks:[{ordinal:0,index:1,mediaKind:"picture",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:1000}]}]}]};
  const trimAfter=structuredClone(trimBefore);trimAfter.mobs[0].tracks[0].nodes[0].timelineEnd=31;trimAfter.mobs[0].tracks[0].nodes[1].timelineStart=31;trimAfter.mobs[0].tracks[0].nodes[1].sourceStart=121;
  const trimPlan={mobId:"sequence",cut:30,delta:1,trackOrdinals:[0]};
  if(!verifySavedDualRollerTrim(trimBefore,trimAfter,trimPlan).verified||!verifySavedDualRollerTrim(trimAfter,trimBefore,{...trimPlan,cut:31,delta:-1}).verified)throw new Error("Installed trim verification failed");
  trimAfter.mobs[0].name="Unexpected rename";let unrelatedRefused=false;
  try{verifySavedDualRollerTrim(trimBefore,trimAfter,trimPlan);}catch(error){unrelatedRefused=error.message.includes("exact requested trim");}
  if(!unrelatedRefused)throw new Error("Installed trim verifier accepted an unrelated edit");
  const record={revision:baseline,createdAt:"synthetic-package-fixture",bins:[{schema:1,file:path.resolve(root,"tests","fixtures","sample-project","Editorial.avb"),sha256:"a".repeat(64),mobs:[fixtureMob,{...fixtureMob,mobId:"second"}],warnings:[],complete:true,nodeCount:4,stateOrigin:"synthetic"}]};
  await writeFile(path.join(snapshotDirectory,`snapshot-${baseline}.json`),JSON.stringify(record));
  record.revision=candidate;for(const mob of record.bins[0].mobs)mob.name="After";
  await writeFile(path.join(snapshotDirectory,`snapshot-${candidate}.json`),JSON.stringify(record));
  const invoke=async(name,args)=>{const response=await client.callTool({name,arguments:args});if(response.isError||!response.structuredContent?.ok)throw new Error(`Installed pagination call failed: ${name}`);return response.structuredContent.data;};
  const collectionSource=path.resolve(root,"tests","fixtures","sample-project","Editorial.avb"),collectionBytes=await readFile(collectionSource),collectionId=createHash("sha256").update(collectionBytes).digest("hex");
  // Synthetic saved preparation records exercise installed recovery, not media conversion.
  const clockBad=path.join(snapshotDirectory,`source-clock-${baseline}`),clockGood=path.join(snapshotDirectory,`source-clock-${candidate}`);
  await mkdir(clockBad);await mkdir(clockGood);
  const clockDamaged=path.join(clockBad,"attempt.json"),clockAttempt=path.join(clockGood,"attempt.json"),clockOutput=path.join(await realpath(clockGood),"prepared.mov");
  await writeFile(clockDamaged,"damaged preparation record");
  const clockRecord={source:await realpath(collectionSource),sourceSha256:collectionId,videoStream:0,audioStream:1,output:clockOutput,recipe:"aresample=48000:async=1:first_pts=0",startedAt:"2026-09-06T00:00:00.000Z"};
  const clockRecordBytes=JSON.stringify(clockRecord);await writeFile(clockAttempt,clockRecordBytes);
  const clockPage=await invoke("avid_list_source_clock_attempts",{file:collectionSource,expectedSha256:collectionId,limit:1});
  if(clockPage.attempts.length||clockPage.unreadable!==1||clockPage.nextAfter!==baseline)throw new Error("Installed preparation discovery lost damaged-record continuation");
  const recoveredClockClient=new Client({name:"avid-installed-preparation-reconnect",version:"1.0"});
  try{
    await recoveredClockClient.connect(new StdioClientTransport({command:generatedEntry.command,args:generatedEntry.args,cwd:temporary,stderr:"pipe",env:{...getDefaultEnvironment(),...generatedEntry.env}}));
    const clockCall=async(name,args)=>{
      const response=await recoveredClockClient.callTool({name,arguments:args});
      if(response.isError||!response.structuredContent?.ok)throw new Error(`Installed preparation call failed: ${name}`);
      return response.structuredContent.data;
    };
    const next=await clockCall("avid_list_source_clock_attempts",{file:collectionSource,expectedSha256:collectionId,after:clockPage.nextAfter,limit:1});
    if(next.attempts[0]?.runId!==candidate||next.nextAfter!==null)throw new Error(`Installed preparation reconnect lost attempt: ${JSON.stringify(next)}`);
    const unresolved=await clockCall("avid_source_clock_status",{runId:candidate});
    if(unresolved.state!=="unresolved"||unresolved.workerState!=="unknown"||unresolved.outputSha256!==null)throw new Error("Installed unresolved attempt inferred completion");
    const outputBytes=Buffer.from("synthetic prepared bytes"),outputSha256=createHash("sha256").update(outputBytes).digest("hex");await writeFile(clockOutput,outputBytes);
    const {startedAt,...identity}=clockRecord;
    await writeFile(path.join(clockGood,"receipt.json"),JSON.stringify({...identity,outputSha256,verified:true,sourceUnchanged:true,hostImportVerified:false}));
    const completed=await clockCall("avid_source_clock_status",{runId:candidate});
    if(completed.state!=="receipt_matches_files"||completed.outputSha256!==outputSha256||completed.workerState!=="unknown")throw new Error("Installed preparation receipt binding failed");
    await writeFile(clockOutput,"changed synthetic output");
    const changed=await recoveredClockClient.callTool({name:"avid_source_clock_status",arguments:{runId:candidate}});
    if(!changed.isError||!JSON.stringify(changed).includes("Prepared output changed"))throw new Error("Installed preparation accepted changed output");
    if(await readFile(clockAttempt,"utf8")!==clockRecordBytes||await readFile(clockDamaged,"utf8")!=="damaged preparation record"||!isDeepStrictEqual(await readFile(collectionSource),collectionBytes))throw new Error("Installed preparation reads changed source or attempt records");
  }finally{await recoveredClockClient.close();}
  await writeFile(path.join(snapshotDirectory,`${collectionId}.json`),JSON.stringify({id:collectionId,file:collectionSource,bytes:collectionBytes.length,metadata:{format:{duration:"10"}},transcript:[]}));
  const collectionRecord={name:"Installed collection",selects:[{id:collectionId,start:2,end:5,label:"",tags:[],note:""}]};
  await writeFile(path.join(snapshotDirectory,`collection-${baseline}.json`),"damaged record");
  await writeFile(path.join(snapshotDirectory,`collection-${candidate}.json`),JSON.stringify(collectionRecord));
  const collectionPage=await invoke("avid_list_collections",{limit:1});
  if(collectionPage.results.length||collectionPage.omitted!==1||collectionPage.nextAfter!==baseline)throw new Error("Installed collection discovery lost damaged-record continuation");
  const collectionLast=await invoke("avid_list_collections",{after:collectionPage.nextAfter,limit:1});
  if(collectionLast.results[0]?.revision!==candidate||collectionLast.results[0]?.duration!==3||collectionLast.nextAfter!==null)throw new Error("Installed collection discovery failed");
  const recoveredCollection=await invoke("avid_read_collection",{revision:collectionLast.results[0].revision});
  if(!isDeepStrictEqual(recoveredCollection.selects,collectionRecord.selects))throw new Error("Installed collection read changed saved ranges");
  // The output directory is not a permitted media root in this generated client configuration.
  const outsideSource=path.join(temporary,"outside-media.bin");await writeFile(outsideSource,"out of scope");
  await writeFile(path.join(snapshotDirectory,`${collectionId}.json`),JSON.stringify({id:collectionId,file:outsideSource,bytes:12,metadata:{format:{duration:"10"}},transcript:[]}));
  const collectionDenied=await invoke("avid_list_collections",{});
  if(collectionDenied.results.length||collectionDenied.omitted!==2||JSON.stringify(collectionDenied).includes(collectionRecord.name)||JSON.stringify(collectionDenied).includes(outsideSource))throw new Error("Installed collection discovery exposed out-of-scope contents");
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
  const trimBaselineRevision="00000000-0000-4000-8000-000000000100",trimCandidateRevision="00000000-0000-4000-8000-000000000101";
  trimAfter.mobs[0].name=trimBefore.mobs[0].name;
  for(const [revision,value] of [[trimBaselineRevision,trimBefore],[trimCandidateRevision,trimAfter]]){
    const captured={revision,createdAt:"synthetic-installed-trim",bins:[{...record.bins[0],mobs:value.mobs}]};
    await writeFile(path.join(snapshotDirectory,`snapshot-${revision}.json`),JSON.stringify(captured));
  }
  const savedTrimArgs={baseline:trimBaselineRevision,candidate:trimCandidateRevision,baselineBin:record.bins[0].file,candidateBin:record.bins[0].file,mobId:"sequence",cut:30,delta:1,trackOrdinals:[0]};
  const savedTrim=await invoke("avid_verify_saved_trim",savedTrimArgs);
  if(savedTrim.verified!==true||savedTrim.cutAfter!==31||savedTrim.baseline!==trimBaselineRevision||savedTrim.candidate!==trimCandidateRevision)throw new Error("Installed MCP trim verification lost snapshot identity or result");
  const wrongTrim=await client.callTool({name:"avid_verify_saved_trim",arguments:{...savedTrimArgs,delta:-1}});
  if(!wrongTrim.isError||!JSON.stringify(wrongTrim).includes("exact requested trim"))throw new Error("Installed MCP accepted the wrong trim direction");
  if (withPython) {
    await smokeAafPackage({installedRoot,temporary,python});
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
      clientSetup: "five JSON formats and Codex argv agree; server from installed Codex argv connected from foreign working directory; JSON mutations preserve Codex TOML",
      snapshotPagination: "synthetic diff, usage, range and source-resolution continuation passed",
      sourceTrace: "installed stereo channels, clipped downstream offsets, unresolved endpoints and invalid-range refusal passed",
      faceNotices: "both packaged model licenses match pinned upstream bytes",
      originalNotices: "packaged original-project notices match recorded upstream bytes",
      cachedNotices: "six model notice mappings create and reuse from installed package",
      runtimeNotices: "two exact ONNX version mappings retain four verified notice files from installed package",
      inventoryReport: "installed stream/tag rendering and changed-source refusal preserve prior output",
      collectionDiscovery: "installed damaged-record continuation, saved-range readback and out-of-scope omission passed",
      preparationRecovery: "installed synthetic damaged-page reconnect, unresolved status, receipt/file matching and changed-output refusal passed; not media conversion",
      trimVerification: "installed forward/inverse decoded trim and unrelated-edit refusal passed",
      savedTrimMcp: "installed snapshot-pair verification and wrong-direction refusal passed",
      snapshotRecovery: "revision discovery to mob inventory to timeline query passed",
      sidecarIsolation: "package-only; missing package fails closed",
      pythonMcpIsolation: withPython ? "available; missing rejected; restored" : "not requested",
      aafAuthoring: withPython ? "installed two-source merge, stereo selects, graph/hash binding and stale-template refusal passed" : "not requested",
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
