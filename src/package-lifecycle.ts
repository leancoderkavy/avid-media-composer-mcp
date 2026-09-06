import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {lstat,readdir,readlink,realpath,rename,rm} from "node:fs/promises";
import * as z from "zod/v4";
import {readBoundedFile} from "./security/bounded-read.js";
import {sha256File} from "./analysis/file-inventory.js";
import {runProcess} from "./process.js";

const idSchema=z.string().uuid(),hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema=z.object({schema:z.literal(1),installationId:idSchema,directory:z.string(),version:z.string(),treeSha256:hashSchema});
const within=(candidate:string,root:string)=>{const relative=path.relative(root,candidate);return relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};

export async function packageTreeHash(directory:string){
  const hash=createHash("sha256");let entries=0,bytes=0;
  const walk=async(relative:string):Promise<void>=>{
    for(const name of (await readdir(path.join(directory,relative))).sort()){
      if(!relative&&name==="installation.json")continue;
      if(++entries>50000)throw new Error("Installation inventory exceeds 50000 entries");
      const child=path.join(relative,name),file=path.join(directory,child),info=await lstat(file);let value:string;
      if(info.isSymbolicLink()){
        const target=await readlink(file);if(!within(path.resolve(path.dirname(file),target),directory))throw new Error("Installation link points outside its directory");value=`link:${target}`;
      }else if(info.isDirectory()){value="directory";}
      else if(info.isFile()){
        bytes+=info.size;if(info.size>128*1024*1024||bytes>2*1024*1024*1024)throw new Error("Installation inventory byte limit exceeded");value=`file:${await sha256File(file)}`;
      }else throw new Error("Unsupported installation filesystem entry");
      hash.update(JSON.stringify([child.replaceAll(path.sep,"/"),value]));
      if(info.isDirectory()&&!info.isSymbolicLink())await walk(child);
    }
  };
  await walk("");return hash.digest("hex");
}

export async function packageStatus(root:string,installationId:string){
  idSchema.parse(installationId);if(!path.isAbsolute(root))throw new Error("Package root must be absolute");
  const canonicalRoot=await realpath(root),directory=path.join(canonicalRoot,installationId),info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error("Managed installation must be a direct directory under its package root");
  const receiptFile=path.join(directory,"installation.json");if((await lstat(receiptFile)).isSymbolicLink())throw new Error("Installation receipt cannot be a link");
  const bytes=await readBoundedFile(receiptFile,1024*1024),receipt=receiptSchema.parse(JSON.parse(bytes.toString("utf8")));
  if(receipt.installationId!==installationId||receipt.directory!==directory)throw new Error("Installation receipt location mismatch");
  const treeSha256=await packageTreeHash(directory);
  return {installationId,directory,version:receipt.version,receiptSha256:createHash("sha256").update(bytes).digest("hex"),treeSha256,recordedTreeSha256:receipt.treeSha256,unchanged:treeSha256===receipt.treeSha256};
}

async function assertStopped(directory:string){
  if(process.platform!=="win32")throw new Error("Managed package removal currently requires Windows process qualification");
  const escaped=directory.replaceAll("'","''");
  let result; for(let attempt=0;attempt<3;attempt++){ result=await runProcess("powershell.exe",["-NoProfile","-NonInteractive","-Command",`$ErrorActionPreference='Stop'; $nodes=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' }); if(@($nodes | Where-Object { -not $_.CommandLine }).Count -gt 0){throw 'Node process command line unavailable'}; @($nodes | Where-Object { $_.CommandLine.IndexOf('${escaped}',[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count`],{timeoutMs:15000,maxOutputBytes:4096}); if(result.exitCode===0&&/^\d+$/.test(result.stdout.trim()))break; }
  if(!result||result.exitCode!==0||!/^\d+$/.test(result.stdout.trim()))throw new Error("Could not establish Node process state; installation retained");
  if(Number(result.stdout.trim())!==0)throw new Error("A Node process references this installation; stop the client/server before removing it");
}

export async function removePackage(root:string,installationId:string,expectedReceiptSha256:string){
  hashSchema.parse(expectedReceiptSha256);const status=await packageStatus(root,installationId);
  if(status.receiptSha256!==expectedReceiptSha256)throw new Error("Installation receipt changed");
  if(!status.unchanged)throw new Error("Installation files changed; removal refused");
  await assertStopped(status.directory);
  // Rename the validated direct child before removal so a new launch cannot use its old entry path.
  const quarantine=path.join(path.dirname(status.directory),`${installationId}.removing-${randomUUID()}`);
  if(!within(quarantine,path.dirname(status.directory)))throw new Error("Removal destination outside package root");
  await rename(status.directory,quarantine);
  try{
    if(await packageTreeHash(quarantine)!==status.treeSha256)throw new Error("Installation changed during removal preparation");
    const receipt=await readBoundedFile(path.join(quarantine,"installation.json"),1024*1024);
    if(createHash("sha256").update(receipt).digest("hex")!==expectedReceiptSha256)throw new Error("Receipt changed during removal preparation");
    await assertStopped(status.directory);
    await rm(quarantine,{recursive:true,force:false});
  }catch(error){throw new Error(`Removal did not finish; retained files may be at ${quarantine}. ${(error as Error).message}`);}
  return {installationId,removed:true,directory:status.directory,note:"Client configurations and external media/models were not removed. Restore requires reinstalling the package."};
}

export async function recoverPackageRemoval(root:string,name:string,expectedReceiptSha256:string){
  hashSchema.parse(expectedReceiptSha256);const parts=name.split(".removing-");if(parts.length!==2)throw new Error("Expected an installation UUID.removing-UUID directory name");
  const installationId=idSchema.parse(parts[0]);idSchema.parse(parts[1]);if(!path.isAbsolute(root))throw new Error("Package root must be absolute");
  const canonicalRoot=await realpath(root),quarantine=path.join(canonicalRoot,name),destination=path.join(canonicalRoot,installationId),info=await lstat(quarantine);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(quarantine)!==quarantine)throw new Error("Removal recovery requires a direct managed directory");
  const receiptFile=path.join(quarantine,"installation.json");if((await lstat(receiptFile)).isSymbolicLink())throw new Error("Receipt cannot be a link");
  const bytes=await readBoundedFile(receiptFile,1024*1024),receipt=receiptSchema.parse(JSON.parse(bytes.toString("utf8")));
  if(createHash("sha256").update(bytes).digest("hex")!==expectedReceiptSha256||receipt.installationId!==installationId||receipt.directory!==destination)throw new Error("Recovery receipt mismatch");
  if(await packageTreeHash(quarantine)!==receipt.treeSha256)throw new Error("Removal contents changed or were partially deleted; automatic recovery refused");
  await assertStopped(destination);await assertStopped(quarantine);
  try{await lstat(destination);throw new Error("Recovery destination already exists");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  await rename(quarantine,destination);return {...await packageStatus(root,installationId),recovered:true};
}
