import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { resolveReadablePath } from "../security/path-policy.js";
import { requireCapability } from "../security/capabilities.js";
import { MediaLibrary } from "./media-library.js";
import { modelRuntime } from "./model-runtime.js";
import {readBoundedJson} from "../security/bounded-read.js";

export const VISUAL_MODEL = "Xenova/clip-vit-base-patch32";
export const VISUAL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";
export async function loadVisualModels(cache: string, download = false) {
  const {AutoTokenizer,AutoProcessor,CLIPTextModelWithProjection,CLIPVisionModelWithProjection,RawImage} = await modelRuntime(cache,download);
  const options = {cache_dir:cache,revision:VISUAL_REVISION,local_files_only:!download,dtype:"q8" as const};
  const tokenizer = await AutoTokenizer.from_pretrained(VISUAL_MODEL,options);
  const processor = await AutoProcessor.from_pretrained(VISUAL_MODEL,options);
  const text = await CLIPTextModelWithProjection.from_pretrained(VISUAL_MODEL,options);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(VISUAL_MODEL,options);
  return {tokenizer,processor,text,vision,RawImage};
}
export function cosine(a: number[], b: number[]) {
  if(a.length!==b.length || !a.length || [...a,...b].some(x=>!Number.isFinite(x))) throw new Error("Invalid embedding vectors");
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]!*b[i]!;aa+=a[i]!**2;bb+=b[i]!**2;}
  return aa&&bb ? dot/Math.sqrt(aa*bb) : 0;
}
const vector=z.array(z.number().finite()).length(512);
const recordSchema=z.object({model:z.literal(VISUAL_MODEL),revision:z.literal(VISUAL_REVISION),samples:z.array(z.object({id:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().nonnegative(),image:z.string(),vector})).max(1200)});
export class VisualSearch {
  private models: ReturnType<typeof loadVisualModels>|undefined;
  private readonly library: MediaLibrary;
  constructor(private readonly config: ServerConfig){this.library=new MediaLibrary(config);}
  private load(){
    requireCapability(this.config.capabilities,"inspect");
    if(!this.config.modelDirectory)throw new Error("Set AVID_MCP_MODEL_DIR after explicitly downloading models with avid-mcp --download-models --model-dir PATH");
    this.models ??= loadVisualModels(this.config.modelDirectory).catch(error=>{this.models=undefined;throw error;});
    return this.models;
  }
  async dispose(){const pending=this.models;this.models=undefined;if(pending){const models=await pending;await Promise.all([models.text.dispose(),models.vision.dispose()]);}}
  async index(ids:string[],samplesPerFile:number){
    requireCapability(this.config.capabilities,"export");
    if(ids.length>100||!ids.length||!Number.isInteger(samplesPerFile)||samplesPerFile<1||samplesPerFile>12)throw new Error("Visual sample limit exceeded");
    const models=await this.load();
    const samples=[];
    for(const entry of await this.library.metadata(ids)){
      const duration=Number(entry.metadata.format?.duration);
      if(!Number.isFinite(duration)||duration<=0)throw new Error("Missing media duration");
      for(let n=0;n<samplesPerFile;n++){
        const time=duration*(n+0.5)/samplesPerFile;
        const image=await this.library.artifact(entry.id,"thumbnail",time);
        const inputs=await models.processor(await models.RawImage.read(image.output));
        const result=await models.vision(inputs);
        samples.push({id:entry.id,time,image:image.output,vector:Array.from(result.image_embeds.data,Number)});
      }
    }
    const record=recordSchema.parse({model:VISUAL_MODEL,revision:VISUAL_REVISION,samples});
    const indexId=randomUUID();
    await writeFile(path.join(await this.library.directory(),`visual-${indexId}.json`),JSON.stringify(record),{flag:"wx"});
    return {indexId,samples:samples.length,model:VISUAL_MODEL,coverage:"Sparse frame samples; does not identify every shot or continuous matching scene"};
  }
  async search(indexId:string,query:{text:string}|{image:string},limit:number){
    z.string().uuid().parse(indexId);
    const directory=await this.library.directory();
    const file=await resolveReadablePath(path.join(directory,`visual-${indexId}.json`),[directory],"file");
    const record=recordSchema.parse(await readBoundedJson(file,32*1024*1024));
    // Enforce current source roots even when a prior index used wider access.
    await this.library.metadata([...new Set(record.samples.map(sample=>sample.id))]);
    const models=await this.load();
    let embedding:number[];
    if("text" in query){
      const result=await models.text(await models.tokenizer(query.text,{padding:true,truncation:true}));
      embedding=Array.from(result.text_embeds.data,Number);
    }else{
      const image=await resolveReadablePath(query.image,[...this.config.allowedRoots,directory],"file");
      if(![".jpg",".jpeg",".png"].includes(path.extname(image).toLowerCase())||(await stat(image)).size>20*1024*1024)throw new Error("Reference image must be a bounded JPEG or PNG");
      const result=await models.vision(await models.processor(await models.RawImage.read(image)));
      embedding=Array.from(result.image_embeds.data,Number);
    }
    return {model:VISUAL_MODEL,scoreMeaning:"CLIP cosine similarity, not probability or verified identity",results:record.samples.map(({vector,...sample})=>({...sample,score:cosine(embedding,vector)})).sort((a,b)=>b.score-a.score).slice(0,limit)};
  }
}
