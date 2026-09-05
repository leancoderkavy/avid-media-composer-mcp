import {mkdir,writeFile,rename,link,unlink,opendir} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const summaryNodeSchema=z.object({nodeId:z.string(),start:z.number().nonnegative(),end:z.number().positive(),summary:z.string().max(4000),mayBeTruncated:z.boolean().default(false),children:z.array(z.string()).max(4),sourceIndices:z.array(z.number().int().nonnegative()).max(100000)});
export type SummaryNode=z.infer<typeof summaryNodeSchema>;
const checkpoint=z.object({inputHash:sha,node:summaryNodeSchema});
const header=z.object({recipe:z.literal(1),runId:uuid,parentRunId:uuid.optional(),id:sha,transcriptRevision:uuid,sourceHash:sha,model:z.string(),modelRevision:z.string(),plannedNodes:z.number().int().min(1).max(100),createdAt:z.string()});
type Header=z.infer<typeof header>;
async function publish(file:string,value:unknown){const temp=`${file}.${randomUUID()}.tmp`;try{await writeFile(temp,JSON.stringify(value),{flag:"wx",mode:0o600});await link(temp,file);}finally{await unlink(temp).catch(error=>{if(error.code!=="ENOENT")throw error;});}}
export class SummaryCheckpoints{
  constructor(private config:ServerConfig,private model:string,private modelRevision:string){}
  private async directory(runId:string){uuid.parse(runId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`summary-run-${runId}`),[root],"directory");}
  async create(input:Pick<Header,"id"|"transcriptRevision"|"sourceHash"|"plannedNodes"|"parentRunId">){
    const runId=randomUUID(),record=header.parse({...input,recipe:1,runId,model:this.model,modelRevision:this.modelRevision,createdAt:new Date().toISOString()});
    const root=await new MediaLibrary(this.config).directory(),directory=path.join(root,`summary-run-${runId}.creating`);await mkdir(directory);
    await writeFile(path.join(directory,"manifest.json"),JSON.stringify(record),{flag:"wx",mode:0o600});await rename(directory,path.join(root,`summary-run-${runId}`));return runId;
  }
  async append(runId:string,index:number,value:z.infer<typeof checkpoint>){z.number().int().min(0).max(99).parse(index);await publish(path.join(await this.directory(runId),`${index}.json`),checkpoint.parse(value));}
  async finish(runId:string,revision:string){uuid.parse(revision);await publish(path.join(await this.directory(runId),"complete.json"),{revision});}
  async read(runId:string){
    const directory=await this.directory(runId),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),8192));
    if(record.runId!==runId||record.model!==this.model||record.modelRevision!==this.modelRevision)throw new Error("Summary run identity or model revision mismatch");
    await new MediaLibrary(this.config).metadata([record.id]);
    let revision:string|undefined;
    try{revision=uuid.parse((await readBoundedJson(await resolveReadablePath(path.join(directory,"complete.json"),[directory],"file"),8192) as {revision?:string}).revision);}
    catch(error){if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;}
    const nodes=[];
    for(let i=0;i<record.plannedNodes;i++){
      let value;try{value=await readBoundedJson(await resolveReadablePath(path.join(directory,`${i}.json`),[directory],"file"),2*1024*1024);}
      catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")break;throw error;}
      const parsed=checkpoint.parse(value);if(parsed.node.nodeId!==`n${i}`)throw new Error("Summary checkpoint node order mismatch");nodes.push(parsed);
    }
    if(revision&&nodes.length!==record.plannedNodes)throw new Error("Completed summary run has missing nodes");
    return {record,nodes,revision};
  }
  async discover(id:string,after?:string){
    sha.parse(id);if(after)uuid.parse(after);await new MediaLibrary(this.config).metadata([id]);const root=await new MediaLibrary(this.config).directory(),names=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Summary run discovery limit exceeded");if(entry.isDirectory()&&/^summary-run-[a-f0-9-]{36}$/.test(entry.name)&&(!after||entry.name.slice(12)>after))names.push(entry.name.slice(12));}
    const result=[];for(const name of names.sort()){
      const directory=await this.directory(name),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),8192));
      if(record.id===id)result.push(name);
    }
    return result;
  }
}
