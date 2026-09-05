import {mkdir,writeFile,rename,unlink} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
import * as z from "zod/v4";

const uuid=z.string().uuid();
const recordSchema=z.object({id:uuid,session:uuid,scope:z.string(),status:z.enum(["queued","running","cancelling","completed","failed","cancelled"]),createdAt:z.string(),updatedAt:z.string(),spec:z.unknown(),result:z.unknown().optional(),error:z.string().optional()});
export type JobRecord=z.infer<typeof recordSchema>;

/** One writer per random job ID. Credentials and runtime configuration are never persisted. */
export class JobJournal {
  readonly session=randomUUID();
  private readonly scope:string;
  private pending:Promise<void>=Promise.resolve();
  constructor(private readonly config:ServerConfig){
    this.scope=createHash("sha256").update(JSON.stringify({roots:[...config.allowedRoots].sort(),capabilities:[...config.capabilities].sort()})).digest("hex");
  }
  private async directory(){
    const root=await new MediaLibrary(this.config).directory(),directory=path.join(root,"jobs");
    await mkdir(directory,{recursive:true});return resolveReadablePath(directory,[root],"directory");
  }
  save(value:Omit<JobRecord,"session"|"scope"|"updatedAt">){
    // Snapshot before queuing so a later mutation cannot overwrite an earlier event's state.
    const record=JSON.stringify({...value,session:this.session,scope:this.scope,updatedAt:new Date().toISOString()});
    const operation=this.pending.then(async()=>{
      uuid.parse(value.id);
      if(Buffer.byteLength(record)>3*1024*1024)throw new Error("Job record exceeds 3 MiB");
      const directory=await this.directory(),file=path.join(directory,`${value.id}.json`),temporary=path.join(directory,`${value.id}.${randomUUID()}.tmp`);
      try{await writeFile(temporary,record,{flag:"wx",mode:0o600});await rename(temporary,file);}
      finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
    });
    // Keep failures observable to this caller while allowing later state writes to recover.
    this.pending=operation.catch(()=>{});return operation;
  }
  async read(id:string){
    uuid.parse(id);await this.pending;
    const directory=await this.directory(),file=await resolveReadablePath(path.join(directory,`${id}.json`),[directory],"file");
    const record=recordSchema.parse(await readBoundedJson(file,3*1024*1024));
    if(record.id!==id||record.scope!==this.scope)throw new Error("Job record is outside the current access scope");
    const unresolved=record.session!==this.session&&["queued","running","cancelling"].includes(record.status);
    return {...record,recordedStatus:record.status,status:unresolved?"unresolved":record.status,unresolved,automaticReplay:false};
  }
  async list(after?:string,limit=50){
    if(after)uuid.parse(after);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Invalid history page size");
    await this.pending;const directory=await this.directory(),names=[];
    // Bounded directory discovery, including unexpected files, avoids unbounded allocation.
    const {opendir}=await import("node:fs/promises");
    const entries=await opendir(directory);let scanned=0;
    for await(const entry of entries){if(++scanned>10000)throw new Error("Job journal exceeds 10000 directory entries");if(/^[a-f0-9-]{36}\.json$/.test(entry.name))names.push(entry.name.slice(0,-5));}
    const records=[];
    for(const id of names.sort().filter(id=>!after||id>after)){
      try{records.push(await this.read(id));}catch(error){if((error as Error).message==="Job record is outside the current access scope")continue;throw error;}
      if(records.length>limit)break;
    }
    const page=records.slice(0,limit);return {records:page,nextAfter:records.length>limit?page.at(-1)!.id:null,order:"job-id",automaticReplay:false};
  }
}
