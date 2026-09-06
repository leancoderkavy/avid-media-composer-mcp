import {mkdir,writeFile,lstat,realpath,rename,unlink,access,link,open,opendir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import {runProcess} from "../process.js";
import {AvidMcpError} from "../errors.js";
import {packageTreeHash} from "../package-lifecycle.js";
import {readBoundedJson,readBoundedFile} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {installRuntimeNotices} from "./runtime-notices.js";
export const runtimeManifest={name:"avid-mcp-local-model-runtime",version:"1.0.0",private:true,type:"module",dependencies:{"@huggingface/transformers":"4.2.0"},overrides:{sharp:"0.35.4","adm-zip":"0.6.0"}};
const receiptSchema=z.object({schema:z.literal(1),kind:z.literal("avid-model-runtime"),transformers:z.literal("4.2.0"),treeSha256:z.string().regex(/^[a-f0-9]{64}$/),checkedAt:z.string(),nodeVersion:z.string(),checks:z.object({scriptsDisabled:z.boolean(),auditHighPassed:z.literal(true),importPassed:z.literal(true)}).strict(),adoptedLegacy:z.boolean()}).strict();
/** Publish complete receipt bytes exclusively. Staging lives outside the
 * inventoried runtime so a process crash cannot alter its dependency hash. */
export async function publishRuntimeReceipt(directory:string,input:unknown){
 const bytes=JSON.stringify(receiptSchema.parse(input));
 const temporary=path.join(path.dirname(directory),`.runtime-receipt-${randomUUID()}.tmp`);
 const handle=await open(temporary,"wx",0o600);
 try{try{await handle.writeFile(bytes);}finally{await handle.close();}await link(temporary,path.join(directory,"installation.json"));}
 finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}
async function exists(file:string){try{await lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}}
async function basic(directory:string){
 const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error("Model runtime must be a direct directory in the selected cache");
 const manifest=await readBoundedJson(await resolveReadablePath(path.join(directory,"package.json"),[directory],"file"),16384);
 if(JSON.stringify(manifest)!==JSON.stringify(runtimeManifest))throw new Error("Existing model runtime differs; use a fresh model directory");
 const metadata=await readBoundedJson(await resolveReadablePath(path.join(directory,"node_modules","@huggingface","transformers","package.json"),[directory],"file"),1024*1024) as {version?:string};
 if(metadata.version!=="4.2.0")throw new Error("Unsupported model runtime version");
 return resolveReadablePath(path.join(directory,"node_modules","@huggingface","transformers","dist","transformers.node.mjs"),[directory],"file");
}
export async function modelRuntimeStatus(cache:string){
 const root=await realpath(path.resolve(cache)),directory=path.join(root,"runtime");
 if(!await exists(directory)){
  const lockPresent=await exists(path.join(root,".runtime-install.lock")),staging:string[]=[];let entriesExamined=0,truncated=false;
  const entries=await opendir(root);
  for await(const item of entries){
   if(++entriesExamined>512){truncated=true;break;}
   if(/^\.runtime-install-[a-f0-9-]{36}$/.test(item.name)&&item.isDirectory()&&!item.isSymbolicLink())staging.push(path.join(root,item.name));
  }
  const state=lockPresent?"setup_lock_present" as const:staging.length||truncated?"retained_setup_state" as const:"not_installed" as const;
  return {directory,entry:null,managed:false as const,unchanged:null,receipt:null,setup:{lockPresent,staging:staging.sort(),entriesExamined:Math.min(entriesExamined,512),truncated,workerTerminationVerified:false},inferencePreflight:{state,passed:false,modelLoadVerified:false,nextStep:state==="not_installed"?"Explicitly run --install-model-runtime --model-dir PATH.":"Retain this cache for inspection and use a fresh model cache. A lock or staging directory does not establish worker termination; do not clear it based on PID or age."},note:"Read-only setup inventory. Retained staging is not a qualified runtime and is never imported or repaired by status."};
 }
 const entry=await basic(directory),receiptFile=path.join(directory,"installation.json");
 if(!await exists(receiptFile))return {directory,entry,managed:false as const,unchanged:null,receipt:null,inferencePreflight:{state:"adoption_required" as const,passed:false,modelLoadVerified:false,nextStep:"Explicitly run --install-model-runtime --model-dir PATH to audit and adopt this legacy runtime."},note:"Legacy runtime has no tree receipt. Explicit installation can audit and adopt it without reinstalling dependencies."};
 if((await lstat(receiptFile)).isSymbolicLink())throw new Error("Model runtime receipt cannot be a link");
 const receipt=receiptSchema.parse(await readBoundedJson(receiptFile,16384)),treeSha256=await packageTreeHash(directory);
 return {directory,entry,managed:true as const,unchanged:treeSha256===receipt.treeSha256,treeSha256,receipt,inferencePreflight:{state:treeSha256===receipt.treeSha256?"verified" as const:"tree_changed" as const,passed:treeSha256===receipt.treeSha256,modelLoadVerified:false,nextStep:treeSha256===receipt.treeSha256?"Runtime receipt verification passed; model availability and actual loading require separate checks.":"Use a fresh model directory; changed dependencies will not be imported or automatically repaired."},note:"Tree consistency and previous audit/import evidence; not publisher authentication or a current vulnerability audit."};
}
/** Explicit setup only. Inference never invokes npm or fetches dependencies. */
export async function installModelRuntime(cache:string){
 await mkdir(path.resolve(cache),{recursive:true});const root=await realpath(path.resolve(cache)),runtime=path.join(root,"runtime"),lock=path.join(root,".runtime-install.lock");
 const lockRecord=JSON.stringify({pid:process.pid,operation:randomUUID(),createdAt:new Date().toISOString()});
 try{await writeFile(lock,lockRecord,{flag:"wx",mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Model runtime setup lock exists; do not infer worker termination from its age. Finish the other setup or use a new cache.");throw error;}
 let staging:string|undefined,retainLock=false;
 const setupProcess:typeof runProcess=async(...args)=>{
  try{return await runProcess(...args);}catch(error){
   const neverStarted=error instanceof AvidMcpError&&["EXECUTABLE_NOT_FOUND","PROCESS_START_FAILED"].includes(error.code);
   const tree=error instanceof AvidMcpError?error.details?.treeTermination:undefined;
   const stopped=typeof tree==="object"&&tree!==null&&"succeeded" in tree&&tree.succeeded===true;
   if(!neverStarted&&!stopped)retainLock=true;
   throw error;
  }
 };
 try{
  const npmCli=path.join(path.dirname(process.execPath),"node_modules","npm","bin","npm-cli.js");
  const npm=async(directory:string,args:string[])=>{await access(npmCli);const result=await setupProcess(process.execPath,[npmCli,...args],{cwd:directory,timeoutMs:300000,maxOutputBytes:1024*1024});if(result.exitCode!==0)throw new Error(`Model runtime ${args[0]} failed; files retained at ${directory}`);};
  const qualify=async(directory:string,legacy:boolean)=>{
   const entry=await basic(directory),before=await packageTreeHash(directory);
   await npm(directory,["audit","--omit=dev","--audit-level=high"]);
   // Import in a child so native DLL handles are closed before directory publication.
   const code=`const m=await import(${JSON.stringify(pathToFileURL(entry).href)}); const t=new m.Tensor("float32",new Float32Array([1,2]),[2]); if(t.dims[0]!==2)throw Error("Runtime tensor check failed");`;
   const imported=await setupProcess(process.execPath,["--input-type=module","-e",code],{cwd:directory,timeoutMs:60000,maxOutputBytes:1024*1024});
   if(imported.exitCode!==0)throw new Error(`Model runtime import failed; files retained at ${directory}`);
   if(await packageTreeHash(directory)!==before)throw new Error("Model runtime changed during qualification; no receipt saved");
   const receipt=receiptSchema.parse({schema:1,kind:"avid-model-runtime",transformers:"4.2.0",treeSha256:before,checkedAt:new Date().toISOString(),nodeVersion:process.versions.node,checks:{scriptsDisabled:!legacy,auditHighPassed:true,importPassed:true},adoptedLegacy:legacy});
   await publishRuntimeReceipt(directory,receipt);
  };
  if(await exists(runtime)){
   const status=await modelRuntimeStatus(root);
   if(status.managed){if(!status.unchanged)throw new Error("Model runtime tree changed; use a fresh model directory");return {...status,reused:true,notices:await installRuntimeNotices(root,runtime)};}
   await qualify(runtime,true);return {...await modelRuntimeStatus(root),reused:true,notices:await installRuntimeNotices(root,runtime)};
  }
  staging=path.join(root,`.runtime-install-${randomUUID()}`);await mkdir(staging);
  await writeFile(path.join(staging,"package.json"),JSON.stringify(runtimeManifest),{flag:"wx",mode:0o600});
  await npm(staging,["install","--ignore-scripts","--no-audit","--no-fund"]);
  const notices=await installRuntimeNotices(root,staging);
  await qualify(staging,false);
  if(await exists(runtime))throw new Error("Runtime destination appeared during installation; staged files retained");
  await rename(staging,runtime);staging=undefined;
  return {...await modelRuntimeStatus(root),reused:false,notices};
 }catch(error){throw new Error(`${(error as Error).message}${staging?"; staging retained at "+staging:""}${retainLock?"; setup lock retained because worker termination is unverified. Use a fresh model cache; do not remove the lock based only on PID or age.":""}`,{cause:error});}
 finally{if((await readBoundedFile(lock,16384)).toString("utf8")!==lockRecord)throw new Error("Model runtime setup lock changed; replacement retained");if(!retainLock)await unlink(lock);}
}
