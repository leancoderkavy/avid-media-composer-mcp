import {writeFile,opendir,unlink} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {modelRuntime} from "./model-runtime.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
export const SUMMARY_MODEL="Xenova/distilbart-cnn-6-6";
export const SUMMARY_REVISION="6b476295a3cf27d5b20e8c8b847a54ab8e5d0df9";
export async function loadSummaryModel(cache:string,download=false){const {pipeline}=await modelRuntime(cache,download);return pipeline("summarization",SUMMARY_MODEL,{cache_dir:cache,revision:SUMMARY_REVISION,local_files_only:!download,dtype:"q8"});}
type Source={start:number;end:number;text:string;index:number};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const nodeSchema=z.object({nodeId:z.string(),start:z.number().nonnegative(),end:z.number().positive(),summary:z.string().max(4000),mayBeTruncated:z.boolean().default(false),children:z.array(z.string()).max(4),sourceIndices:z.array(z.number().int().nonnegative()).max(100000)});
type Node=z.infer<typeof nodeSchema>;
const recordSchema=z.object({schema:z.literal(1),id:z.string().regex(/^[a-f0-9]{64}$/),transcriptRevision:z.string().uuid(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),model:z.literal(SUMMARY_MODEL),modelRevision:z.literal(SUMMARY_REVISION),root:z.string(),nodes:z.array(nodeSchema).max(100)});
export function summaryChunks(segments:Source[]){
  const chunks:{text:string;sources:Source[]}[]=[];let current={text:"",sources:[] as Source[]};
  for(const segment of segments){
    if(!segment.text.trim())continue;
    for(let offset=0;offset<segment.text.length;offset+=2000){
      const text=segment.text.slice(offset,offset+2000);
      if(current.text.length+text.length+1>2000&&current.text){chunks.push(current);current={text:"",sources:[]};}
      current.text+=(current.text?" ":"")+text;current.sources.push(segment);
    }
  }
  if(current.text)chunks.push(current);
  if(!chunks.length||chunks.length>64)throw new Error("Summary needs nonempty transcript text within 64 chunks of 2000 characters");
  return chunks;
}
export class MediaSummaries{
  private model:ReturnType<typeof loadSummaryModel>|undefined;
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  async dispose(){const model=this.model;this.model=undefined;if(model)await(await model).dispose();}
  private async source(id:string,revision:string){
    const [entry]=await this.library.metadata([id]);if(!entry)throw new Error("Unknown media");
    const {segments}=await this.library.transcriptRange(id,0,Number(entry.metadata.format?.duration),-1,100000,revision);
    return {segments,sourceHash:hash(segments)};
  }
  async generate(id:string,transcriptRevision:string){
    requireCapability(this.config.capabilities,"project-write");
    const source=await this.source(id,transcriptRevision),chunks=summaryChunks(source.segments);
    if(!this.config.modelDirectory)throw new Error("Explicitly download summary models and set AVID_MCP_MODEL_DIR");
    this.model??=loadSummaryModel(this.config.modelDirectory).catch(error=>{this.model=undefined;throw error;});const model=await this.model;
    const generate=async(text:string)=>{
      const tokens=await model.tokenizer(text);if(tokens.input_ids.dims.at(-1)!>1000)throw new Error("Summary chunk exceeds model token capacity; no truncated summary saved");
      const result=await model(text,{max_new_tokens:80,min_new_tokens:8,do_sample:false,num_beams:1});
      const output=result[0];if(!output||!("summary_text" in output)||!output.summary_text.trim())throw new Error("Summary model returned no text");return {summary:output.summary_text.trim(),mayBeTruncated:!/[.!?]["\']?$/.test(output.summary_text.trim())};
    };
    const nodes:Node[]=[];
    for(const chunk of chunks)nodes.push({nodeId:`n${nodes.length}`,start:Math.min(...chunk.sources.map(s=>s.start)),end:Math.max(...chunk.sources.map(s=>s.end)),...await generate(chunk.text),children:[],sourceIndices:[...new Set(chunk.sources.map(s=>s.index))]});
    let level=[...nodes];
    while(level.length>1){
      const next=[];for(let i=0;i<level.length;i+=4){const children=level.slice(i,i+4),node:Node={nodeId:`n${nodes.length}`,start:Math.min(...children.map(n=>n.start)),end:Math.max(...children.map(n=>n.end)),...await generate(children.map(n=>n.summary).join(" ")),children:children.map(n=>n.nodeId),sourceIndices:[]};nodes.push(node);next.push(node);}level=next;
    }
    if((await this.source(id,transcriptRevision)).sourceHash!==source.sourceHash)throw new Error("Transcript changed during generation");
    const record=recordSchema.parse({schema:1,id,transcriptRevision,sourceHash:source.sourceHash,model:SUMMARY_MODEL,modelRevision:SUMMARY_REVISION,root:level[0]!.nodeId,nodes});
    const revision=randomUUID();await writeFile(path.join(await this.library.directory(),`summary-${revision}.json`),JSON.stringify(record),{flag:"wx"});
    return {revision,root:record.root,nodes:nodes.length,reviewRequired:true,grounding:"Source transcript indices and checksum; factual entailment is not automatically verified"};
  }
  private async read(revision:string,verify=true){
    z.string().uuid().parse(revision);const directory=await this.library.directory(),file=await resolveReadablePath(path.join(directory,`summary-${revision}.json`),[directory],"file");
    const record=recordSchema.parse(await readBoundedJson(file,4*1024*1024)),source=verify?await this.source(record.id,record.transcriptRevision):{segments:[],sourceHash:record.sourceHash};
    await this.library.metadata([record.id]);
    if(source.sourceHash!==record.sourceHash)throw new Error("Summary transcript provenance changed");
    const ids=new Set(record.nodes.map(n=>n.nodeId));if(ids.size!==record.nodes.length||!ids.has(record.root))throw new Error("Invalid summary node identities");
    for(const node of record.nodes)if(node.children.some(id=>!ids.has(id))||(verify&&node.sourceIndices.some(index=>!source.segments.some(s=>s.index===index))))throw new Error("Invalid summary source references");
    return {file,record,source,sha256:hash(record)};
  }
  async node(revision:string,nodeId?:string){const {record,source,sha256}=await this.read(revision),node=record.nodes.find(n=>n.nodeId===(nodeId??record.root));if(!node)throw new Error("Unknown summary node");return {revision,sha256,id:record.id,transcriptRevision:record.transcriptRevision,model:record.model,node,children:node.children.map(id=>record.nodes.find(n=>n.nodeId===id)),sources:source.segments.filter(s=>node.sourceIndices.includes(s.index)),reviewRequired:true,factualEntailmentVerified:false};}
  async list(id:string,after="",limit=20){
    await this.library.metadata([id]);if(after)z.string().uuid().parse(after);z.number().int().min(1).max(100).parse(limit);
    const root=await this.library.directory(),revisions:string[]=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>50000)throw new Error("Summary discovery directory limit exceeded");const match=/^summary-([a-f0-9-]{36})\.json$/.exec(entry.name);if(match&&match[1]!>after)revisions.push(match[1]!);}
    revisions.sort();const results=[];for(const revision of revisions){const target=await resolveReadablePath(path.join(root,`summary-${revision}.json`),[root],"file");const header=recordSchema.parse(await readBoundedJson(target,4*1024*1024));if(header.id!==id)continue;const {record,sha256}=await this.read(revision,false);if(record.id===id)results.push({revision,root:record.root,transcriptRevision:record.transcriptRevision,nodes:record.nodes.length,sha256});if(results.length>limit)break;}
    return {id,summaries:results.slice(0,limit),nextAfter:results.length>limit?results[limit-1]?.revision:null};
  }
  async remove(revision:string,expectedSha256:string){requireCapability(this.config.capabilities,"project-write");const {file,sha256}=await this.read(revision,false);if(sha256!==expectedSha256)throw new Error("Summary changed; reload checksum");await unlink(file);return {revision,deleted:true,sourceModified:false};}
}
