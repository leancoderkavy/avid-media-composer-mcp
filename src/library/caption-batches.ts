import {mkdir,writeFile,rename,link,unlink,opendir} from "node:fs/promises";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {FrameCaptions,CAPTION_MODEL,CAPTION_REVISION,CAPTION_TASK} from "./captions.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {readBoundedJson} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {AvidMcpError} from "../errors.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const captionTimes=z.array(z.number().nonnegative()).min(1).max(120).refine(times=>times.every((time,index)=>index===0||time>times[index-1]!),"Caption times must be strictly increasing");
const header=z.object({recipe:z.literal(1),runId:uuid,parentRunId:uuid.optional(),id:sha,times:captionTimes,model:z.literal(CAPTION_MODEL),modelRevision:z.literal(CAPTION_REVISION),task:z.literal(CAPTION_TASK),runtime:z.literal("4.2.0"),dtype:z.literal("q4")}).strict();
const checkpoint=z.object({captionId:uuid,sha256:sha,time:z.number().nonnegative()}).strict();
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function publish(file:string,value:unknown){const temporary=file+`.${randomUUID()}.tmp`;try{await writeFile(temporary,JSON.stringify(value),{flag:"wx",mode:0o600});await link(temporary,file);}finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}}
export class CaptionBatches{
  private tail:Promise<unknown>=Promise.resolve();
  private closing=false;
  private disposing:Promise<void>|undefined;
  constructor(private config:ServerConfig,private captions=new FrameCaptions(config)){}
  private serialize<T>(fn:()=>Promise<T>){if(this.closing)return Promise.reject(new Error("Caption batch service is closing"));const work=this.tail.then(fn);this.tail=work.catch(()=>{});return work;}
  dispose(){this.closing=true;return this.disposing??=(async()=>{await this.tail;await this.captions.dispose();})();}
  private async source(id:string){sha.parse(id);const entry=await new MediaLibrary(this.config).validatedMetadata(id);if(!entry)throw new Error("Caption batch media unavailable");const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Caption batch source changed");return entry;}
  private async directory(runId:string){uuid.parse(runId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`caption-run-${runId}`),[root],"directory");}
  async read(runId:string){
    const directory=await this.directory(runId),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),16384));if(record.runId!==runId)throw new Error("Caption run identity mismatch");await this.source(record.id);
    let complete:{manifestHash:string;captionsHash:string}|undefined;try{complete=z.object({manifestHash:sha,captionsHash:sha}).strict().parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"complete.json"),[directory],"file"),8192));}catch(error){if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;}
    const captions=[];
    for(let index=0;index<record.times.length;index++){
      let item;try{item=checkpoint.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,`${index}.json`),[directory],"file"),8192));}catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")break;throw error;}
      const caption=await this.captions.read(item.captionId);if(item.time!==record.times[index]||caption.id!==record.id||caption.time!==item.time||caption.sha256!==item.sha256)throw new Error("Caption checkpoint content changed");captions.push(item);
    }
    if(complete&&(captions.length!==record.times.length||complete.manifestHash!==digest(record)||complete.captionsHash!==digest(captions)))throw new Error("Completed caption run integrity failed");
    return {record,captions,complete};
  }
  async status(runId:string){const {record,captions,complete}=await this.read(runId);return {runId,parentRunId:record.parentRunId,id:record.id,times:record.times,plannedCaptions:record.times.length,completedCaptions:captions.length,captions,state:complete?"completed":"partial",note:"Partial does not prove worker termination. Resume creates a new run referencing the verified captions; editing or deleting a referenced caption invalidates original run verification."};}
  async list(id:string,after?:string,limit=20){sha.parse(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);await this.source(id);const root=await new MediaLibrary(this.config).directory(),names=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Caption run discovery limit exceeded");if(!entry.isDirectory()||!/^caption-run-[a-f0-9-]{36}$/.test(entry.name)||after&&entry.name.slice(12)<=after)continue;const runId=entry.name.slice(12),directory=await this.directory(runId),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),16384));if(record.id===id)names.push(runId);}
    names.sort();const runs=[];for(const runId of names.slice(0,limit)){try{runs.push(await this.status(runId));}catch(error){runs.push({runId,state:"unavailable",message:(error as Error).message});}}return {runs,nextAfter:names.length>limit?names[limit-1]:null};
  }
  resume(runId:string){return this.serialize(async()=>{const previous=await this.read(runId);if(previous.complete)throw new Error("Caption run already completed");return this.generateInner(previous.record.id,previous.record.times,runId);});}
  async generate(id:string,times:number[],parentRunId?:string){
    return this.serialize(()=>this.generateInner(id,times,parentRunId));
  }
  private async generateInner(id:string,times:number[],parentRunId?:string){
    requireCapability(this.config.capabilities,"export");requireCapability(this.config.capabilities,"project-write");captionTimes.parse(times);const entry=await this.source(id),duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(duration)||times.at(-1)!>=duration)throw new Error("Caption batch times exceed source duration");
    const previous=parentRunId?await this.read(parentRunId):undefined;if(previous&&(previous.complete||previous.record.id!==id||JSON.stringify(previous.record.times)!==JSON.stringify(times)))throw new Error("Caption resume plan changed");
    const runId=randomUUID(),record=header.parse({recipe:1,runId,parentRunId,id,times,model:CAPTION_MODEL,modelRevision:CAPTION_REVISION,task:CAPTION_TASK,runtime:"4.2.0",dtype:"q4"}),root=await new MediaLibrary(this.config).directory(),temporary=path.join(root,`caption-run-${runId}.creating`),directory=path.join(root,`caption-run-${runId}`);await mkdir(temporary);await writeFile(path.join(temporary,"manifest.json"),JSON.stringify(record),{flag:"wx"});await rename(temporary,directory);
    try{
      for(let index=0;index<times.length;index++){
        let item=previous?.captions[index];if(!item){const caption=await this.captions.generate(id,times[index]!);item={captionId:caption.captionId,sha256:caption.sha256,time:caption.time};}
        await publish(path.join(directory,`${index}.json`),item);
      }
      const verified=await this.read(runId);await publish(path.join(directory,"complete.json"),{manifestHash:digest(verified.record),captionsHash:digest(verified.captions)});return {...await this.status(runId),reusedCaptions:previous?.captions.length??0};
    }catch(error){throw new AvidMcpError("CAPTION_BATCH_INCOMPLETE",(error as Error).message,{runId,parentRunId,resumeTool:"avid_resume_captions"});}
  }
}
