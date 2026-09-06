import {mkdir,writeFile,lstat,realpath,rename,unlink,access} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import {runProcess} from "../process.js";
import {packageTreeHash} from "../package-lifecycle.js";
import {readBoundedJson,readBoundedFile} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {installRuntimeNotices} from "./runtime-notices.js";
export const runtimeManifest={name:"avid-mcp-local-model-runtime",version:"1.0.0",private:true,type:"module",dependencies:{"@huggingface/transformers":"4.2.0"},overrides:{sharp:"0.35.4","adm-zip":"0.6.0"}};
const receiptSchema=z.object({schema:z.literal(1),kind:z.literal("avid-model-runtime"),transformers:z.literal("4.2.0"),treeSha256:z.string().regex(/^[a-f0-9]{64}$/),checkedAt:z.string(),nodeVersion:z.string(),checks:z.object({scriptsDisabled:z.boolean(),auditHighPassed:z.literal(true),importPassed:z.literal(true)}).strict(),adoptedLegacy:z.boolean()}).strict();
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
 const root=await realpath(path.resolve(cache)),directory=path.join(root,"runtime"),entry=await basic(directory),receiptFile=path.join(directory,"installation.json");
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
 let staging:string|undefined;
 try{
  const npmCli=path.join(path.dirname(process.execPath),"node_modules","npm","bin","npm-cli.js");
  const npm=async(directory:string,args:string[])=>{await access(npmCli);const result=await runProcess(process.execPath,[npmCli,...args],{cwd:directory,timeoutMs:300000,maxOutputBytes:1024*1024});if(result.exitCode!==0)throw new Error(`Model runtime ${args[0]} failed; files retained at ${directory}`);};
  const qualify=async(directory:string,legacy:boolean)=>{
   const entry=await basic(directory),before=await packageTreeHash(directory);
   await npm(directory,["audit","--omit=dev","--audit-level=high"]);
   // Import in a child so native DLL handles are closed before directory publication.
   const code=`const m=await import(${JSON.stringify(pathToFileURL(entry).href)}); const t=new m.Tensor("float32",new Float32Array([1,2]),[2]); if(t.dims[0]!==2)throw Error("Runtime tensor check failed");`;
   const imported=await runProcess(process.execPath,["--input-type=module","-e",code],{cwd:directory,timeoutMs:60000,maxOutputBytes:1024*1024});
   if(imported.exitCode!==0)throw new Error(`Model runtime import failed; files retained at ${directory}`);
   if(await packageTreeHash(directory)!==before)throw new Error("Model runtime changed during qualification; no receipt saved");
   const receipt=receiptSchema.parse({schema:1,kind:"avid-model-runtime",transformers:"4.2.0",treeSha256:before,checkedAt:new Date().toISOString(),nodeVersion:process.versions.node,checks:{scriptsDisabled:!legacy,auditHighPassed:true,importPassed:true},adoptedLegacy:legacy});
   await writeFile(path.join(directory,"installation.json"),JSON.stringify(receipt),{flag:"wx",mode:0o600});
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
 }catch(error){throw new Error(`${(error as Error).message}${staging?"; staging retained at "+staging:""}`);}
 finally{if((await readBoundedFile(lock,16384)).toString("utf8")!==lockRecord)throw new Error("Model runtime setup lock changed; replacement retained");await unlink(lock);}
}
