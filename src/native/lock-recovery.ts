import {lstat,open,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash,randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile,readBoundedJson} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {QUALIFIED_BUILD} from "./client.js";

const ownerSchema=z.object({pid:z.number().int().positive(),startedAt:z.string()});
const retainedSchema=z.object({state:z.literal("export-unresolved"),output:z.string().min(1),cause:z.string()});
const checksum=z.string().regex(/^[a-f0-9]{64}$/);
const importRetainedSchema=z.object({state:z.literal("import-unresolved"),attempt:z.string().min(1),cause:z.string()});
const importAttemptSchema=z.object({project:z.string().min(1),action:z.object({action:z.literal("import_aaf_selects"),bin:z.string().min(1),file:z.string().min(1),expectedSha256:checksum}),inspection:z.object({file:z.string().min(1),sha256:checksum,media:z.array(z.object({file:z.string().min(1),sha256:checksum})).min(1).max(100)})});
async function assertAvidStopped(config:ServerConfig){
  if(process.platform!=="win32"||!config.nativeBinary)throw new Error("Lock recovery requires the qualified Windows host configuration");
  if(await sha256File(config.nativeBinary)!==QUALIFIED_BUILD.sha256)throw new Error("Unqualified Avid binary");
  const result=await runProcess("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ErrorActionPreference='Stop'; ConvertTo-Json -Compress -InputObject @(Get-Process -Name AvidMediaComposer -ErrorAction SilentlyContinue | Select-Object Id,Path)"],{timeoutMs:10000,maxOutputBytes:8192});
  if(result.exitCode!==0)throw new Error("Could not establish that Avid stopped");
  const processes:unknown=JSON.parse(result.stdout);
  if(!Array.isArray(processes)||processes.length!==0)throw new Error("Close Avid Media Composer before recovering a retained native lock");
}

export class NativeLockRecovery {
  constructor(private readonly config:ServerConfig,private readonly assertStopped:()=>Promise<void>=()=>assertAvidStopped(config)){}
  private file(){return path.join(os.homedir(),".avid-mcp","native-write.lock");}
  async inspect(){
    requireCapability(this.config.capabilities,"inspect");
    if(!this.config.nativeBinary)throw new Error("Native host configuration required");
    const file=this.file();
    try{if((await lstat(file)).isSymbolicLink())throw new Error("Native lock cannot be a symbolic link");}
    catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return {locked:false as const};throw error;}
    const bytes=await readBoundedFile(file,65536),sha256=createHash("sha256").update(bytes).digest("hex");
    const lines=bytes.toString("utf8").trim().split(/\r?\n/),owner=ownerSchema.parse(JSON.parse(lines[0]!));
    if(lines.length!==2)return {locked:true as const,recoverable:false as const,sha256,owner,reason:"Only explicitly retained export/import locks can be recovered; active or abandoned generic locks need separate inspection"};
    const record=JSON.parse(lines[1]!);
    if(record?.state==="import-unresolved"){
      const retained=importRetainedSchema.parse(record);
      if(!this.config.outputRoot)throw new Error("Output root required to inspect retained import");
      const attemptFile=await resolveReadablePath(retained.attempt,[this.config.outputRoot],"file"),directory=path.dirname(attemptFile);
      if(path.basename(attemptFile)!=="attempt.json"||!/^native-import-[a-f0-9-]{36}$/.test(path.basename(directory)))throw new Error("Unexpected retained import attempt layout");
      const attemptBytes=await readBoundedFile(attemptFile,2*1024*1024),attempt=importAttemptSchema.parse(JSON.parse(attemptBytes.toString("utf8")));
      if(attempt.action.expectedSha256!==attempt.inspection.sha256)throw new Error("Import attempt checksum declarations disagree");
      const project=await resolveReadablePath(attempt.project,this.config.allowedRoots,"directory");
      const bin=await resolveReadablePath(path.resolve(project,attempt.action.bin),[project],"file");
      if(path.extname(bin).toLowerCase()!==".avb")throw new Error("Expected retained import AVB bin");
      const source=await resolveReadablePath(attempt.action.file,this.config.allowedRoots,"file");
      if(path.extname(source).toLowerCase()!==".aaf"||source!==await resolveReadablePath(attempt.inspection.file,this.config.allowedRoots,"file"))throw new Error("Import attempt source paths disagree");
      const files=[];
      for(const item of [{file:source,sha256:attempt.inspection.sha256},...attempt.inspection.media]){
        const file=await resolveReadablePath(item.file,this.config.allowedRoots,"file");
        const currentSha256=await sha256File(file);files.push({file,attemptSha256:item.sha256,currentSha256,changed:currentSha256!==item.sha256});
      }
      const evidence={attemptFile,attemptSha256:createHash("sha256").update(attemptBytes).digest("hex"),project,bin,binSha256:await sha256File(bin),files};
      const evidenceSha256=createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
      return {locked:true as const,recoverable:true as const,sha256,owner,...retained,directory,evidence,evidenceSha256,requirement:"Use import recovery with both checksums after Avid stops; this releases only the lock and does not undo or retry import"};
    }
    const retained=retainedSchema.parse(record);
    if(!this.config.outputRoot)throw new Error("Output root required to inspect retained export");
    const directory=await resolveReadablePath(path.dirname(path.dirname(retained.output)),[this.config.outputRoot],"directory");
    // Validate the leaf layout separately from the canonical parent: realpath can
    // expand /var aliases or Windows short/case variants without changing scope.
    if(path.basename(retained.output)!=="render.mp4"||path.basename(path.dirname(retained.output))!=="export")throw new Error("Retained export output path is not the expected attempt output");
    const attemptFile=await resolveReadablePath(path.join(directory,"attempt.json"),[directory],"file");
    const attempt=await readBoundedJson(attemptFile,65536) as {output?:string;project?:string;action?:{action?:string}};
    if(attempt.output!==retained.output||attempt.action?.action!=="export_mp4"||typeof attempt.project!=="string")throw new Error("Retained lock does not match an export attempt");
    await resolveReadablePath(attempt.project,this.config.allowedRoots,"directory");
    return {locked:true as const,recoverable:true as const,sha256,owner,...retained,directory,requirement:"Avid must be stopped; release does not retry export or remove its output"};
  }
  async release(expectedSha256:string){
    requireCapability(this.config.capabilities,"export");z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSha256);
    const before=await this.inspect();
    if(!before.locked||!before.recoverable||before.state!=="export-unresolved"||before.sha256!==expectedSha256)throw new Error("Lock is absent, changed or not eligible for export recovery");
    const guardFile=path.join(path.dirname(this.file()),"native-recovery.lock"),guard=await open(guardFile,"wx",0o600);
    try{
      await this.assertStopped();
      const current=await this.inspect();
      if(!current.locked||!current.recoverable||current.state!=="export-unresolved"||current.sha256!==expectedSha256)throw new Error("Native lock changed during recovery");
      const receipt={preparedAt:new Date().toISOString(),state:"prepared-for-release",lock:current,exportRetried:false,outputDeleted:false};
      const archive=path.join(current.directory,`lock-recovery-${randomUUID()}.json`);await writeFile(archive,JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});
      await this.assertStopped();
      if(createHash("sha256").update(await readBoundedFile(this.file(),65536)).digest("hex")!==expectedSha256)throw new Error("Native lock changed before release");
      await unlink(this.file());return {released:true,archive,exportRetried:false,outputDeleted:false};
    }finally{await guard.close();await unlink(guardFile);}
  }
  async releaseImport(expectedSha256:string,expectedEvidenceSha256:string){
    requireCapability(this.config.capabilities,"edit");requireCapability(this.config.capabilities,"export");
    checksum.parse(expectedSha256);checksum.parse(expectedEvidenceSha256);
    const verify=async()=>{
      const status=await this.inspect();
      if(!status.locked||!status.recoverable||status.state!=="import-unresolved"||status.sha256!==expectedSha256||status.evidenceSha256!==expectedEvidenceSha256)throw new Error("Import lock or observed evidence changed, absent or ineligible; inspect again");
      return status;
    };
    await verify();
    const guardFile=path.join(path.dirname(this.file()),"native-recovery.lock"),guard=await open(guardFile,"wx",0o600);
    try{
      await this.assertStopped();const current=await verify();
      const archive=path.join(current.directory,`import-lock-recovery-${randomUUID()}.json`);
      await writeFile(archive,JSON.stringify({preparedAt:new Date().toISOString(),state:"prepared-for-release",lock:current,importRetried:false,binModified:false,sourceModified:false},null,2),{flag:"wx",mode:0o600});
      await this.assertStopped();await verify();
      if(createHash("sha256").update(await readBoundedFile(this.file(),65536)).digest("hex")!==expectedSha256)throw new Error("Native lock changed before import recovery release");
      await unlink(this.file());return {released:true,archive,importRetried:false,binModified:false,sourceModified:false};
    }finally{await guard.close();await unlink(guardFile);}
  }
}
