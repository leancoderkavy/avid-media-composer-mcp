import {mkdir,writeFile,rename,opendir,link,unlink} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";

const id=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.string().uuid();
const planItem=z.object({id,time:z.number().nonnegative(),shot:z.object({start:z.number().nonnegative(),end:z.number().positive()}).optional()});
export type VisualPlanItem=z.infer<typeof planItem>;
const sample=planItem.extend({image:z.string(),imageSha256:id,vector:z.array(z.number().finite()).length(512)});
export type VisualCheckpoint=z.infer<typeof sample>;
const manifest=z.object({version:z.literal(1),runId:uuid,model:z.string(),revision:z.string(),createdAt:z.string(),parentRunId:uuid.optional(),plan:z.array(planItem).min(1).max(1200)}).refine(value=>value.plan.every(item=>!item.shot||(item.shot.end>item.shot.start&&item.time>=item.shot.start&&item.time<item.shot.end)),"Visual plan sample must lie within its shot");
const finalIndex=z.object({model:z.string(),revision:z.string(),samples:z.array(sample.omit({imageSha256:true})).max(1200)});
async function publish(file:string,value:unknown){
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{
    await writeFile(temporary,JSON.stringify(value),{flag:"wx",mode:0o600});
    // A same-directory hard link publishes the complete file without replacing an
    // existing checkpoint. Interrupted temporary files are never treated as samples.
    await link(temporary,file);
  }finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}

/** Random run IDs each have one writer. Resume forks a verified immutable prefix. */
export class VisualCheckpoints{
  constructor(private readonly config:ServerConfig,private readonly model:string,private readonly revision:string){}
  private async directory(runId:string){uuid.parse(runId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`visual-run-${runId}`),[root],"directory");}
  async create(plan:VisualPlanItem[],parentRunId?:string){
    const runId=randomUUID(),record=manifest.parse({version:1,runId,model:this.model,revision:this.revision,createdAt:new Date().toISOString(),parentRunId,plan});
    const root=await new MediaLibrary(this.config).directory(),directory=path.join(root,`visual-run-${runId}.creating`);await mkdir(directory);
    await writeFile(path.join(directory,"manifest.json"),JSON.stringify(record),{flag:"wx",mode:0o600});
    await rename(directory,path.join(root,`visual-run-${runId}`));return runId;
  }
  async append(runId:string,index:number,value:VisualCheckpoint){
    const directory=await this.directory(runId);z.number().int().min(0).max(1199).parse(index);
    await publish(path.join(directory,`${index}.json`),sample.parse(value));
  }
  async finish(runId:string,indexId:string){uuid.parse(indexId);await publish(path.join(await this.directory(runId),"complete.json"),{indexId});}
  async read(runId:string,verifyImages=false){
    const directory=await this.directory(runId),root=await new MediaLibrary(this.config).directory();
    const record=manifest.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),512*1024));
    if(record.runId!==runId||record.model!==this.model||record.revision!==this.revision)throw new Error("Visual run model/revision or identity mismatch");
    // Observe completion first. If it arrives while samples are read, this snapshot
    // stays partial instead of incorrectly diagnosing missing completed samples.
    let indexId:string|undefined;
    try{const completed=await readBoundedJson(await resolveReadablePath(path.join(directory,"complete.json"),[directory],"file"),8192) as {indexId?:string};indexId=uuid.parse(completed.indexId);}
    catch(error){if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;}
    const entries=await new MediaLibrary(this.config).metadata([...new Set(record.plan.map(item=>item.id))]);
    if(verifyImages)for(const entry of entries)if(await sha256File(entry.file)!==entry.id)throw new Error("Visual checkpoint source changed; reindex");
    const samples:VisualCheckpoint[]=[];
    for(let i=0;i<record.plan.length;i++){
      let value;try{value=await readBoundedJson(await resolveReadablePath(path.join(directory,`${i}.json`),[directory],"file"),32768);}
      catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")break;throw error;}
      const saved=sample.parse(value),planned=record.plan[i]!;
      if(saved.id!==planned.id||saved.time!==planned.time||JSON.stringify(saved.shot)!==JSON.stringify(planned.shot))throw new Error("Visual checkpoint does not match planned sample");
      if(verifyImages){const image=await resolveReadablePath(saved.image,[root],"file");if(await sha256File(image)!==saved.imageSha256)throw new Error("Visual checkpoint image changed");}
      samples.push(saved);
    }
    if(indexId&&samples.length!==record.plan.length)throw new Error("Completed visual run has missing checkpoints");
    if(indexId){
      const file=await resolveReadablePath(path.join(root,`visual-${indexId}.json`),[root],"file");
      const saved=finalIndex.parse(await readBoundedJson(file,32*1024*1024));
      const expected=finalIndex.parse({model:this.model,revision:this.revision,samples});
      if(JSON.stringify(saved)!==JSON.stringify(expected))throw new Error("Completed visual index differs from committed checkpoints");
    }
    return {record,samples,indexId};
  }
  async status(runId:string){const {record,samples,indexId}=await this.read(runId);return {runId,parentRunId:record.parentRunId,plannedSamples:record.plan.length,completedSamples:samples.length,indexId:indexId??null,state:indexId?"completed":"partial",note:"Partial does not establish that the original worker stopped. Resume creates a new run from the observed prefix."};}
  async list(after?:string,limit=50){
    if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);
    const names:string[]=[];let scanned=0;
    for await(const entry of await opendir(await new MediaLibrary(this.config).directory())){
      if(++scanned>10000)throw new Error("Visual run discovery exceeds 10000 directory entries");
      if(entry.isDirectory()&&/^visual-run-[a-f0-9-]{36}$/.test(entry.name))names.push(entry.name.slice(11));
    }
    const selected=names.sort().filter(name=>!after||name>after),runs=[];
    for(const name of selected){
      try{runs.push(await this.status(name));}
      catch(error){if((error as {code?:string}).code==="INDEXED_SOURCE_UNAVAILABLE")continue;throw error;}
      if(runs.length>limit)break;
    }
    const page=runs.slice(0,limit);
    return {runs:page,nextAfter:runs.length>limit?page.at(-1)!.runId:null};
  }
}
