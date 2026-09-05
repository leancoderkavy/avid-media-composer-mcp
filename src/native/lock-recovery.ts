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
async function assertAvidStopped(config:ServerConfig){
  if(process.platform!=="win32"||!config.nativeBinary)throw new Error("Lock recovery requires the qualified Windows host configuration");
  if(await sha256File(config.nativeBinary)!==QUALIFIED_BUILD.sha256)throw new Error("Unqualified Avid binary");
  const result=await runProcess("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ErrorActionPreference='Stop'; ConvertTo-Json -Compress -InputObject @(Get-Process -Name AvidMediaComposer -ErrorAction SilentlyContinue | Select-Object Id,Path)"],{timeoutMs:10000,maxOutputBytes:8192});
  if(result.exitCode!==0)throw new Error("Could not establish that Avid stopped");
  const processes:unknown=JSON.parse(result.stdout);
  if(!Array.isArray(processes)||processes.length!==0)throw new Error("Close Avid Media Composer before recovering a retained export lock");
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
    if(lines.length!==2)return {locked:true as const,recoverable:false as const,sha256,owner,reason:"Only explicitly retained export locks can be recovered; active or abandoned generic locks need separate inspection"};
    const retained=retainedSchema.parse(JSON.parse(lines[1]!));
    if(!this.config.outputRoot)throw new Error("Output root required to inspect retained export");
    const directory=await resolveReadablePath(path.dirname(path.dirname(retained.output)),[this.config.outputRoot],"directory");
    if(path.resolve(retained.output)!==path.join(directory,"export","render.mp4"))throw new Error("Retained export output path is not the expected attempt output");
    const attemptFile=await resolveReadablePath(path.join(directory,"attempt.json"),[directory],"file");
    const attempt=await readBoundedJson(attemptFile,65536) as {output?:string;project?:string;action?:{action?:string}};
    if(attempt.output!==retained.output||attempt.action?.action!=="export_mp4"||typeof attempt.project!=="string")throw new Error("Retained lock does not match an export attempt");
    await resolveReadablePath(attempt.project,this.config.allowedRoots,"directory");
    return {locked:true as const,recoverable:true as const,sha256,owner,...retained,directory,requirement:"Avid must be stopped; release does not retry export or remove its output"};
  }
  async release(expectedSha256:string){
    requireCapability(this.config.capabilities,"export");z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSha256);
    const before=await this.inspect();
    if(!before.locked||!before.recoverable||before.sha256!==expectedSha256)throw new Error("Lock is absent, changed or not eligible for export recovery");
    const guardFile=path.join(path.dirname(this.file()),"native-recovery.lock"),guard=await open(guardFile,"wx",0o600);
    try{
      await this.assertStopped();
      const current=await this.inspect();
      if(!current.locked||!current.recoverable||current.sha256!==expectedSha256)throw new Error("Native lock changed during recovery");
      const receipt={preparedAt:new Date().toISOString(),state:"prepared-for-release",lock:current,exportRetried:false,outputDeleted:false};
      const archive=path.join(current.directory,`lock-recovery-${randomUUID()}.json`);await writeFile(archive,JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});
      await this.assertStopped();
      if(createHash("sha256").update(await readBoundedFile(this.file(),65536)).digest("hex")!==expectedSha256)throw new Error("Native lock changed before release");
      await unlink(this.file());return {released:true,archive,exportRetried:false,outputDeleted:false};
    }finally{await guard.close();await unlink(guardFile);}
  }
}
