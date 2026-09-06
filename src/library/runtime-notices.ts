import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir,realpath,lstat,writeFile,link,unlink} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {readBoundedFile,readBoundedJson} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";

export const runtimeNoticePackages=[
 {name:"onnxruntime-node",version:"1.24.3",sourceCommit:"3a728b75062256951b6e19ce718907cf1a1d4cf0"},
 {name:"onnxruntime-web",version:"1.26.0-dev.20260416-b7804b056c",sourceCommit:"b7804b056c30aa35c1748f8e4e239d0e2ff25d6d"},
] as const;
const files=[
 {source:"onnxruntime.LICENSE",name:"UPSTREAM.LICENSE",sha256:"2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c"},
 {source:"onnxruntime.ThirdPartyNotices.txt",name:"THIRD_PARTY_NOTICES.txt",sha256:"0e07b95f3a8d6230037707c5c4a2b554d12c4cb67369669ac255635528ffcee2"},
] as const;
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

/** Explicit runtime setup only; supplemental upstream notices live outside the runtime receipt tree. */
export async function installRuntimeNotices(cache:string,runtime:string){
 const runtimeRoot=await realpath(runtime);
 // Validate every mapping and bundled file before publishing any notice.
 for(const item of runtimeNoticePackages){
  const file=await resolveReadablePath(path.join(runtimeRoot,"node_modules",item.name,"package.json"),[runtimeRoot],"file");
  const manifest=await readBoundedJson(file,1024*1024) as {name?:unknown;version?:unknown};
  if(manifest.name!==item.name||manifest.version!==item.version)throw new Error(`No verified runtime notice mapping for installed ${item.name}; update provenance before setup`);
 }
 const bundled=[];
 for(const item of files){
  const bytes=await readBoundedFile(fileURLToPath(new URL(`../../docs/licenses/${item.source}`,import.meta.url)),1024*1024);
  if(digest(bytes)!==item.sha256)throw new Error("Bundled runtime notice checksum mismatch");
  bundled.push({...item,bytes});
 }
 await mkdir(path.resolve(cache),{recursive:true});const root=await realpath(path.resolve(cache)),packages=[];
 for(const item of runtimeNoticePackages){
  let directory=root;
  for(const part of ["notices","runtime",item.name,item.version]){
   directory=path.join(directory,part);await mkdir(directory,{recursive:true});
   if((await lstat(directory)).isSymbolicLink())throw new Error("Runtime notice directory cannot be a link");
   directory=await resolveReadablePath(directory,[root],"directory");
  }
  const retained=[];
  for(const notice of bundled){
   const file=path.join(directory,notice.name),staged=path.join(directory,`.notice-${randomUUID()}.creating`);let created=false;
   await writeFile(staged,notice.bytes,{flag:"wx"});
   try{try{await link(staged,file);created=true;}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}}finally{await unlink(staged);}
   if((await lstat(file)).isSymbolicLink())throw new Error("Runtime notice cannot be a link");
   if(digest(await readBoundedFile(file,1024*1024))!==notice.sha256)throw new Error("Existing runtime notice changed; refusing to overwrite it");
   retained.push({file,sha256:notice.sha256,created});
  }
  packages.push({...item,files:retained});
 }
 return {packages,scope:"Version-correlated upstream ONNX notices only; not complete binary component mapping, license clearance, or notice coverage for every runtime dependency"};
}
