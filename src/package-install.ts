import path from "node:path";
import {packageTreeHash} from "./package-lifecycle.js";
import {mkdir,writeFile,realpath,stat} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport,getDefaultEnvironment} from "@modelcontextprotocol/sdk/client/stdio.js";
import {sha256File} from "./analysis/file-inventory.js";
import {readBoundedJson} from "./security/bounded-read.js";
import {runProcess} from "./process.js";

export function validatePackageInstall(archive:string,root:string,expectedSha256:string){
  if(!path.isAbsolute(archive)||!path.isAbsolute(root))throw new Error("Package archive and install root must be absolute paths");
  if(!/^[a-f0-9]{64}$/.test(expectedSha256))throw new Error("Expected archive SHA-256 must be 64 lowercase hexadecimal characters");
  if(!archive.toLowerCase().endsWith(".tgz"))throw new Error("Package installation requires a local .tgz archive");
}

/** Installs explicitly selected code. The digest identifies bytes; it does not establish publisher trust. */
export async function installPackage(archive:string,root:string,expectedSha256:string){
  validatePackageInstall(archive,root,expectedSha256);
  const source=await realpath(archive),info=await stat(source);
  if(!info.isFile()||info.size>50*1024*1024)throw new Error("Package archive must be a file of at most 50 MiB");
  if(await sha256File(source)!==expectedSha256)throw new Error("Package archive checksum mismatch");
  const npmCli=path.join(path.dirname(process.execPath),"node_modules","npm","bin","npm-cli.js");
  if(!(await stat(npmCli)).isFile())throw new Error("A Node installation with adjacent npm/bin/npm-cli.js is required");
  await mkdir(root,{recursive:true});const canonicalRoot=await realpath(root),installationId=randomUUID(),directory=path.join(canonicalRoot,installationId);
  await mkdir(directory);await writeFile(path.join(directory,"package.json"),JSON.stringify({name:"avid-mcp-managed-install",private:true}),{flag:"wx"});
  // Copy and hash the archive so npm reads the same bytes that were approved, independently of source changes.
  const {copyFile}=await import("node:fs/promises");const staged=path.join(directory,"source.tgz");await copyFile(source,staged,1);
  if(await sha256File(staged)!==expectedSha256)throw new Error(`Archive changed during staging; incomplete installation retained at ${directory}`);
  const npm=async(args:string[])=>{const result=await runProcess(process.execPath,[npmCli,...args],{cwd:directory,timeoutMs:300000,maxOutputBytes:2*1024*1024});if(result.exitCode!==0)throw new Error(`Package operation failed (${result.exitCode}); incomplete installation retained at ${directory}. ${result.stderr.slice(-2000)}`);};
  await npm(["install","--ignore-scripts","--no-audit","--no-fund","--save-exact",staged]);
  await npm(["audit","--omit=dev","--audit-level=high"]);
  const installed=path.join(directory,"node_modules","avid-media-composer-mcp"),metadata=await readBoundedJson(path.join(installed,"package.json"),1024*1024) as {name?:string;version?:string;bin?:Record<string,string>};
  if(metadata.name!=="avid-media-composer-mcp"||typeof metadata.version!=="string"||metadata.bin?.["avid-media-composer-mcp"]!=="dist/index.js"||metadata.bin?.["avid-mcp"]!=="dist/cli.js")throw new Error(`Unexpected package identity or entry points; installation retained at ${directory}`);
  const entry=path.join(installed,"dist","index.js"),setup=path.join(installed,"dist","cli.js"),client=new Client({name:"avid-managed-install-check",version:"1.0"});
  let toolsCount=0;
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],stderr:"pipe",env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:directory,AVID_MCP_OUTPUT_ROOT:directory,AVID_MCP_CAPABILITIES:"inspect"}}));
    const ping=await client.callTool({name:"avid_ping",arguments:{}},undefined,{timeout:30000});if(ping.isError)throw new Error("Installed MCP ping failed");
    toolsCount=(await client.listTools()).tools.length;if(!toolsCount)throw new Error("Installed MCP exposes no tools");
  }finally{await client.close();}
  const receipt={schema:1,treeSha256:await packageTreeHash(directory),installationId,version:metadata.version,directory,archiveSha256:expectedSha256,entry,entrySha256:await sha256File(entry),setup,setupSha256:await sha256File(setup),lockSha256:await sha256File(path.join(directory,"package-lock.json")),node:process.execPath,nodeVersion:process.versions.node,tools:toolsCount,checkedAt:new Date().toISOString(),checks:{lifecycleScriptsDisabled:true,auditHighPassed:true,stdioPingPassed:true},limitations:["Node, FFmpeg, Python and optional models are not installed by this command","No named-client or Avid host qualification","Tree hash records installed files and links for later change detection; it is not publisher authentication"]};
  await writeFile(path.join(directory,"installation.json"),JSON.stringify(receipt,null,2),{flag:"wx"});
  return {...receipt,setupCommand:{command:process.execPath,args:[setup]},note:"Use this installed setup CLI to generate or update your client entry. Keep the previous installation for configuration rollback. No existing client entry was changed."};
}
