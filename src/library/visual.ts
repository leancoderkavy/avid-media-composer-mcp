import {installModelNotice} from "./model-notices.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { resolveReadablePath } from "../security/path-policy.js";
import { requireCapability } from "../security/capabilities.js";
import { MediaLibrary } from "./media-library.js";
import { modelRuntime } from "./model-runtime.js";
import {readBoundedJson,readBoundedFile} from "../security/bounded-read.js";
import {ShotDetection,shotOptions} from "./shots.js";
import {VisualCheckpoints,type VisualPlanItem} from "./visual-checkpoints.js";
import {sha256File} from "../analysis/file-inventory.js";
import {AvidMcpError} from "../errors.js";

export const VISUAL_MODEL = "Xenova/clip-vit-base-patch32";
export const VISUAL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";
export const VISUAL_TEXT_TOKEN_LIMIT = 77; // Pinned text_config.max_position_embeddings, including special tokens.
export async function loadVisualModels(cache: string, download = false) {
  if(download)await installModelNotice(cache,VISUAL_MODEL,VISUAL_REVISION);
  const {AutoTokenizer,AutoProcessor,CLIPTextModelWithProjection,CLIPVisionModelWithProjection,RawImage} = await modelRuntime(cache,download);
  const options = {cache_dir:cache,revision:VISUAL_REVISION,local_files_only:!download,dtype:"q8" as const};
  const location=download?VISUAL_MODEL:path.resolve(cache,VISUAL_MODEL,VISUAL_REVISION);
  const tokenizer = await AutoTokenizer.from_pretrained(location,options);
  const processor = await AutoProcessor.from_pretrained(location,options);
  const text = await CLIPTextModelWithProjection.from_pretrained(location,options);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(location,options);
  return {tokenizer,processor,text,vision,RawImage};
}
export function cosine(a: number[], b: number[]) {
  if(a.length!==b.length || !a.length || [...a,...b].some(x=>!Number.isFinite(x))) throw new Error("Invalid embedding vectors");
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]!*b[i]!;aa+=a[i]!**2;bb+=b[i]!**2;}
  return aa&&bb ? dot/Math.sqrt(aa*bb) : 0;
}
const vector=z.array(z.number().finite()).length(512);
export const visualRange=z.object({start:z.number().nonnegative(),end:z.number().positive()}).strict().refine(value=>value.end>value.start,"Range end must follow start");
export const visualScope=z.object({ids:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100).optional(),range:visualRange.optional()}).strict();
export function sampleTimes(duration:number,count:number,range?:z.infer<typeof visualRange>){
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(count)||count<1||count>120)throw new Error("Invalid sampling limits");
  const {start,end}=range?visualRange.parse(range):{start:0,end:duration};
  if(end>duration)throw new Error("Sampling range exceeds media duration");
  return Array.from({length:count},(_,n)=>start+(end-start)*(n+0.5)/count);
}
const sampleSchema=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().nonnegative(),image:z.string(),vector,shot:visualRange.optional()}).refine(sample=>!sample.shot||(sample.time>=sample.shot.start&&sample.time<sample.shot.end),"Sample must lie within its shot");
const recordSchema=z.object({model:z.literal(VISUAL_MODEL),revision:z.literal(VISUAL_REVISION),samples:z.array(sampleSchema).max(1200)});
export class VisualSearch {
  readonly checkpoints:VisualCheckpoints;
  private models: ReturnType<typeof loadVisualModels>|undefined;
  private readonly library: MediaLibrary;
  constructor(private readonly config: ServerConfig){this.library=new MediaLibrary(config);this.checkpoints=new VisualCheckpoints(config,VISUAL_MODEL,VISUAL_REVISION);}
  private load(){
    requireCapability(this.config.capabilities,"inspect");
    if(!this.config.modelDirectory)throw new Error("Set AVID_MCP_MODEL_DIR after explicitly downloading models with avid-mcp --download-models --model-dir PATH");
    this.models ??= loadVisualModels(this.config.modelDirectory).catch(error=>{this.models=undefined;throw error;});
    return this.models;
  }
  async dispose(){const pending=this.models;this.models=undefined;if(pending){const models=await pending;await Promise.all([models.text.dispose(),models.vision.dispose()]);}}
  async index(ids:string[],samplesPerFile:number,range?:z.infer<typeof visualRange>){
    requireCapability(this.config.capabilities,"export");
    if(ids.length>100||!ids.length||!Number.isInteger(samplesPerFile)||samplesPerFile<1||samplesPerFile>120||ids.length*samplesPerFile>1200)throw new Error("Visual sample limit exceeded (120 per file, 1200 total)");
    const entries=await this.library.metadata([...new Set(ids)]);
    const plans=entries.map(entry=>({entry,times:sampleTimes(Number(entry.metadata.format?.duration),samplesPerFile,range)}));
    return this.indexPlan(plans.flatMap(({entry,times})=>times.map(time=>({id:entry.id,time}))));
  }
  async indexShots(id:string,options:z.input<typeof shotOptions>){
    requireCapability(this.config.capabilities,"export");
    const report=await new ShotDetection(this.config).detect(id,options);
    if(report.shots.length>1200)throw new Error("Shot index exceeds 1200 samples; use a shorter range. No shots were silently skipped.");
    const index=await this.indexPlan(report.shots.map(shot=>({id,time:shot.representativeSeconds,shot:{start:shot.start,end:shot.end}})));
    return {...index,shotReport:report.output,detectedShots:report.shots.length,coverage:"One midpoint per detected shot; detection can miss cuts and each shot can contain unsampled visual changes"};
  }
  async resume(runId:string){
    requireCapability(this.config.capabilities,"export");
    const previous=await this.checkpoints.read(runId,true);
    if(previous.indexId)throw new Error(`Visual run is already completed; use index ${previous.indexId}`);
    return this.indexPlan(previous.record.plan,runId);
  }
  private async indexPlan(plan:VisualPlanItem[],parentRunId?:string){
    const previous=parentRunId?await this.checkpoints.read(parentRunId,true):undefined;
    const runId=await this.checkpoints.create(plan,parentRunId);
    try{
    const samples=previous?.samples??[],reusedSamples=samples.length;
    for(let i=0;i<samples.length;i++)await this.checkpoints.append(runId,i,samples[i]!);
    const models=await this.load();
    for(const {id,time,shot} of plan.slice(samples.length)){
        const image=await this.library.artifact(id,"thumbnail",time);
        const inputs=await models.processor(await models.RawImage.read(image.output));
        const result=await models.vision(inputs);
        const saved={id,time,shot,image:image.output,imageSha256:await sha256File(image.output),vector:Array.from(result.image_embeds.data,Number)};
        await this.checkpoints.append(runId,samples.length,saved);samples.push(saved);
    }
    for(const entry of await this.library.metadata([...new Set(plan.map(item=>item.id))]))if(await sha256File(entry.file)!==entry.id)throw new Error("Source changed during visual indexing");
    const record=recordSchema.parse({model:VISUAL_MODEL,revision:VISUAL_REVISION,samples});
    const indexId=randomUUID();
    await writeFile(path.join(await this.library.directory(),`visual-${indexId}.json`),JSON.stringify(record),{flag:"wx"});
    await this.checkpoints.finish(runId,indexId);
    return {indexId,runId,parentRunId,reusedSamples,samples:samples.length,model:VISUAL_MODEL,coverage:"Sparse frame samples; does not identify every shot or continuous matching scene"};
    }catch(error){throw new AvidMcpError("VISUAL_INDEX_INCOMPLETE",(error as Error).message,{runId,parentRunId,resumeTool:"avid_resume_visual_index"});}
  }
  private async record(indexId:string){
    z.string().uuid().parse(indexId);
    const directory=await this.library.directory();
    const file=await resolveReadablePath(path.join(directory,`visual-${indexId}.json`),[directory],"file");
    const record=recordSchema.parse(await readBoundedJson(file,32*1024*1024));
    // Enforce current source roots even when a prior index used wider access.
    await this.library.metadata([...new Set(record.samples.map(sample=>sample.id))]);
    return {record,directory};
  }
  async samples(indexId:string,scope:z.infer<typeof visualScope>={},after=-1,limit=50){
    scope=visualScope.parse(scope);z.number().int().min(-1).parse(after);z.number().int().min(1).max(100).parse(limit);
    const {record,directory}=await this.record(indexId);
    const matches=record.samples.map((sample,index)=>({...sample,index})).filter(sample=>sample.index>after&&(!scope.ids||scope.ids.includes(sample.id))&&(!scope.range||sample.time>=scope.range.start&&sample.time<scope.range.end));
    const page=[];for(const {vector,image,...sample} of matches.slice(0,limit))page.push({...sample,image:await resolveReadablePath(image,[directory],"file")});
    return {indexId,samples:page,totalSamples:record.samples.length,nextAfter:matches.length>limit?page.at(-1)?.index:null,coverage:"Sample points only; ranges are half-open"};
  }
  async searchFrame(indexId:string,id:string,time:number,limit:number,scope:z.infer<typeof visualScope>={}){
    requireCapability(this.config.capabilities,"export");
    await this.record(indexId); // Validate index authority before creating an artifact.
    const frame=await this.library.artifact(id,"thumbnail",time);
    return {...await this.search(indexId,{image:frame.output},limit,scope),reference:{id,time,image:frame.output}};
  }
  async search(indexId:string,query:{text:string}|{image:string},limit:number,scope:z.infer<typeof visualScope>={}){
    z.number().int().min(1).max(100).parse(limit);scope=visualScope.parse(scope);
    const {record,directory}=await this.record(indexId);
    const models=await this.load();
    let embedding:number[];
    if("text" in query){
      const text=z.string().trim().min(1).max(500).parse(query.text),tokens=await models.tokenizer(text,{padding:true,truncation:false});
      const tokenCount=tokens.input_ids.dims.at(-1);
      if(!Number.isInteger(tokenCount)||tokenCount!<1)throw new Error("Visual tokenizer returned an invalid token shape");
      if(tokenCount!>VISUAL_TEXT_TOKEN_LIMIT)throw new AvidMcpError("VISUAL_QUERY_TOO_LONG","Visual query exceeds the pinned model context; shorten it or search distinct concepts separately. No query text was silently discarded.",{tokenCount,maxTokens:VISUAL_TEXT_TOKEN_LIMIT});
      const result=await models.text(tokens);
      embedding=Array.from(result.text_embeds.data,Number);
    }else{
      const image=await resolveReadablePath(query.image,[...this.config.allowedRoots,directory],"file");
      if(![".jpg",".jpeg",".png"].includes(path.extname(image).toLowerCase()))throw new Error("Reference image must be a bounded JPEG or PNG");
      const bytes=await readBoundedFile(image,20*1024*1024);
      const decoded=await models.RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
      const result=await models.vision(await models.processor(decoded));
      embedding=Array.from(result.image_embeds.data,Number);
    }
    const ranked=record.samples.filter(sample=>(!scope.ids||scope.ids.includes(sample.id))&&(!scope.range||sample.time>=scope.range.start&&sample.time<scope.range.end)).map(({vector,...sample})=>({...sample,score:cosine(embedding,vector)})).sort((a,b)=>b.score-a.score);
    const results=[];for(const sample of ranked.slice(0,limit))results.push({...sample,image:await resolveReadablePath(sample.image,[directory],"file")});
    return {model:VISUAL_MODEL,scoreMeaning:"CLIP cosine similarity, not probability or verified identity",matchingSamples:ranked.length,truncated:ranked.length>limit,results};
  }
}
