import {stat,open} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import type {ServerConfig} from "../config.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {AafBuilder} from "../library/aaf-builder.js";

export async function verifyNativeAafMaster(file:string,config:ServerConfig,expected:{sourceFile:string;sourceSha256:string;frames:number},options:{timeoutMs?:number;pollMs?:number;assertOwner?:()=>Promise<void>}={}){
  requireCapability(config.capabilities,"export");
  if(!config.outputRoot)throw new Error("AAF evidence output root required");
  if(!Number.isInteger(expected.frames)||expected.frames<1||expected.frames>2147483647||! /^[a-f0-9]{64}$/.test(expected.sourceSha256))throw new Error("Invalid AAF master expectation");
  const timeoutMs=options.timeoutMs??60000,pollMs=options.pollMs??1000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>900000||!Number.isInteger(pollMs)||pollMs<1||pollMs>10000)throw new Error("Invalid AAF observation limits");
  const root=await resolveReadablePath(config.outputRoot,[config.outputRoot],"directory");
  const source=await resolveReadablePath(expected.sourceFile,config.allowedRoots,"file");
  if(await sha256File(source)!==expected.sourceSha256)throw new Error("AAF source changed before verification");
  const deadline=Date.now()+timeoutMs;let previous="",stable=0;
  while(Date.now()<deadline){
    await options.assertOwner?.();let resolved:string|undefined;
    try{resolved=await resolveReadablePath(file,[root],"file");}catch(error){if(!["ENOENT","PATH_NOT_FOUND"].includes((error as {code?:string}).code??""))throw error;}
    if(resolved){
      const handle=await open(resolved,"r");
      try{
      const info=await handle.stat();if(!info.isFile())throw new Error("AAF output must be a regular file");if(info.size>64*1024*1024)throw new Error("AAF exceeds 64 MiB limit");
      const stamp=`${resolved}:${info.size}:${info.mtimeMs}:${info.ino}`;
      stable=stamp===previous?stable+1:0;previous=stamp;
      if(info.size>=512&&stable>=2){
        const header=Buffer.alloc(8);await handle.read(header,0,8,0);
        if(header.toString("hex")!=="d0cf11e0a1b11ae1")throw new Error("Native output is not an AAF compound file");
        const hash=await sha256File(resolved);
        const inspection=await new AafBuilder({...config,allowedRoots:[...config.allowedRoots,root],commandTimeoutMs:Math.max(1,Math.min(config.commandTimeoutMs,deadline-Date.now()))}).inspect(resolved);
        if(inspection.sha256!==hash||inspection.masters.length!==1||inspection.media.length!==1||inspection.media[0]!.file!==source||inspection.media[0]!.sha256!==expected.sourceSha256)throw new Error("AAF exported master/source contract mismatch");
        const master=inspection.masters[0]!;
        if(!master.slots.length||master.slots.length>16||new Set(master.slots.map(slot=>slot.slotId)).size!==master.slots.length||!master.slots.some(slot=>slot.kind==="picture")||master.slots.some(slot=>!["picture","sound"].includes(slot.kind)||slot.rate!=="30"||slot.length!==expected.frames))throw new Error("AAF exported slot contract mismatch");
        await options.assertOwner?.();
        const after=await stat(resolved),finalPath=await resolveReadablePath(file,[root],"file");
        if(Date.now()>deadline||finalPath!==resolved||`${resolved}:${after.size}:${after.mtimeMs}:${after.ino}`!==stamp||await sha256File(resolved)!==hash||await sha256File(await resolveReadablePath(source,config.allowedRoots,"file"))!==expected.sourceSha256)throw new Error("AAF or source changed during verification, or observation deadline exceeded");
        return {output:resolved,sha256:hash,bytes:after.size,inspection,sourceFilesUnchanged:true,masterContractVerified:true,sourceFidelityVerified:false,exportRetried:false};
      }
      }finally{await handle.close();}
    }else{previous="";stable=0;}
    await delay(Math.min(pollMs,Math.max(1,deadline-Date.now())));
  }
  throw new Error("AAF readiness unproven; inspect the output before any new export. No export was retried.");
}
