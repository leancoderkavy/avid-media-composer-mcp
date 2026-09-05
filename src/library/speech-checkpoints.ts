import {mkdir,writeFile,rename,link,unlink,opendir} from "node:fs/promises";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {speechOptions,speechModels} from "./speech-options.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {errorDetails} from "../errors.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
const header=z.object({recipe:z.literal(1),runtime:z.literal("4.2.0"),runId:uuid,parentRunId:uuid.optional(),id:sha,start:z.number().nonnegative(),end:z.number().positive(),options:speechOptions,model:z.string(),modelRevision:z.string(),audioHash:sha,plannedWindows:z.number().int().min(1).max(30),createdAt:z.string()}).refine(value=>value.end>value.start&&value.end-value.start<=600);
const checkpoint=z.object({inputHash:sha,tokens:z.array(z.number().int().min(0).max(100000)).min(1).max(4096)}).strict();
type Header=z.infer<typeof header>;
async function publish(file:string,value:unknown){const temporary=`${file}.${randomUUID()}.tmp`;try{await writeFile(temporary,JSON.stringify(value),{flag:"wx",mode:0o600});await link(temporary,file);}finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}}
export class SpeechCheckpoints{
  constructor(private config:ServerConfig){}
  private async directory(runId:string){uuid.parse(runId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`speech-run-${runId}`),[root],"directory");}
  async create(input:Pick<Header,"id"|"start"|"end"|"options"|"audioHash"|"plannedWindows"|"parentRunId">){
    const runId=randomUUID(),selected=speechModels[input.options.model],record=header.parse({...input,recipe:1,runtime:"4.2.0",runId,model:selected.model,modelRevision:selected.revision,createdAt:new Date().toISOString()});
    const root=await new MediaLibrary(this.config).directory(),directory=path.join(root,`speech-run-${runId}.creating`);await mkdir(directory);
    await writeFile(path.join(directory,"manifest.json"),JSON.stringify(record),{flag:"wx",mode:0o600});await rename(directory,path.join(root,`speech-run-${runId}`));return runId;
  }
  async append(runId:string,index:number,value:z.infer<typeof checkpoint>){z.number().int().min(0).max(29).parse(index);await publish(path.join(await this.directory(runId),`${index}.json`),checkpoint.parse(value));}
  private async transcript(id:string,revision:string){uuid.parse(revision);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`${id}.transcript-${revision}.json`),[root],"file");}
  async finish(runId:string,revision:string){const {record,windows}=await this.read(runId);if(windows.length!==record.plannedWindows)throw new Error("Speech windows are incomplete");await publish(path.join(await this.directory(runId),"complete.json"),{revision,sha256:await sha256File(await this.transcript(record.id,revision)),windowsHash:createHash("sha256").update(JSON.stringify(windows)).digest("hex")});}
  async read(runId:string){
    const directory=await this.directory(runId),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),8192)),selected=speechModels[record.options.model];
    if(record.runId!==runId||record.model!==selected.model||record.modelRevision!==selected.revision)throw new Error("Speech run identity or model revision mismatch");
    const [entry]=await new MediaLibrary(this.config).metadata([record.id]);if(!entry||await sha256File(await resolveReadablePath(entry.file,this.config.allowedRoots,"file"))!==record.id)throw new Error("Speech source changed; reindex");
    let complete:z.infer<ReturnType<typeof completionSchema>>|undefined;
    try{complete=completionSchema().parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"complete.json"),[directory],"file"),8192));}
    catch(error){if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;}
    const windows=[];
    for(let i=0;i<record.plannedWindows;i++){
      let value;try{value=await readBoundedJson(await resolveReadablePath(path.join(directory,`${i}.json`),[directory],"file"),65536);}
      catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")break;throw error;}
      windows.push(checkpoint.parse(value));
    }
    if(complete){if(windows.length!==record.plannedWindows)throw new Error("Completed speech run has missing windows");if(createHash("sha256").update(JSON.stringify(windows)).digest("hex")!==complete.windowsHash)throw new Error("Completed speech checkpoints changed");if(await sha256File(await this.transcript(record.id,complete.revision))!==complete.sha256)throw new Error("Completed speech transcript changed");}
    return {record,windows,complete};
  }
  async status(runId:string){const {record,windows,complete}=await this.read(runId);return {runId,parentRunId:record.parentRunId,id:record.id,start:record.start,end:record.end,options:record.options,plannedWindows:record.plannedWindows,completedWindows:windows.length,revision:complete?.revision??null,state:complete?"completed":"partial",note:"Partial does not establish worker termination. Explicit resume creates a new run; audio extraction and feature preparation repeat."};}
  async list(id:string,after?:string,limit=20){
    sha.parse(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);await new MediaLibrary(this.config).metadata([id]);const root=await new MediaLibrary(this.config).directory(),names=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Speech discovery limit exceeded");if(entry.isDirectory()&&/^speech-run-[a-f0-9-]{36}$/.test(entry.name)&&(!after||entry.name.slice(11)>after))names.push(entry.name.slice(11));}
    const matching=[];for(const name of names.sort()){const directory=await this.directory(name),record=header.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"manifest.json"),[directory],"file"),8192));if(record.id===id)matching.push(name);}
    const runs=[];for(const runId of matching.slice(0,limit)){try{runs.push(await this.status(runId));}catch(error){const {code,message}=errorDetails(error);runs.push({runId,state:"unavailable",problem:{code,message}});}}
    return {runs,nextAfter:matching.length>limit?matching[limit-1]:null};
  }
}
const completionSchema=()=>z.object({revision:uuid,sha256:sha,windowsHash:sha}).strict();

export function speechInputHash(input:Record<string,unknown>){
  const {inputs,...generation}=input,features=inputs as {type?:unknown;dims?:number[];data?:unknown};
  if(features?.type!=="float32"||!Array.isArray(features.dims)||features.dims.length!==3||!(features.data instanceof Float32Array)||features.data.length>1000000||features.dims.some(n=>!Number.isInteger(n)||n<=0)||features.dims.reduce((a,b)=>a*b,1)!==features.data.length)throw new Error("Unexpected speech feature tensor");
  return createHash("sha256").update(JSON.stringify({generation,type:features.type,dims:features.dims})).update(Buffer.from(features.data.buffer,features.data.byteOffset,features.data.byteLength)).digest("hex");
}
export function speechTokens(output:unknown){
  const tensor=output as {type?:unknown;dims?:number[];data?:unknown};
  if(tensor?.type!=="int64"||!(tensor.data instanceof BigInt64Array)||tensor.dims?.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==tensor.data.length)throw new Error("Unexpected speech token tensor");
  return checkpoint.shape.tokens.parse(Array.from(tensor.data,Number));
}
