import {writeFile,opendir,unlink,link} from "node:fs/promises";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {FrameCaptions} from "./captions.js";
import {MediaLibrary} from "./media-library.js";
import {loadSummaryModel,SUMMARY_MODEL,SUMMARY_REVISION} from "./summaries.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const visualSummaryReferences=z.array(z.object({captionId:uuid,sha256:sha}).strict()).min(1).max(120).refine(refs=>new Set(refs.map(ref=>ref.captionId)).size===refs.length,"Duplicate caption references");
const nodeSchema=z.object({nodeId:z.string(),firstSampleTime:z.number().nonnegative(),lastSampleTime:z.number().nonnegative(),children:z.array(z.string()).max(4),sourceIndices:z.array(z.number().int().nonnegative()).max(1),text:z.string().trim().min(1).max(4000),generated:z.boolean(),mayBeTruncated:z.boolean()}).strict();
type Node=z.infer<typeof nodeSchema>;
const recordSchema=z.object({schema:z.literal(1),revision:uuid,id:sha,references:visualSummaryReferences,model:z.literal(SUMMARY_MODEL),modelRevision:z.literal(SUMMARY_REVISION),runtime:z.literal("4.2.0"),dtype:z.literal("q8"),generation:z.object({maxNewTokens:z.literal(80),minNewTokens:z.literal(8),numBeams:z.literal(1),doSample:z.literal(false)}).strict(),root:z.string(),nodes:z.array(nodeSchema).min(1).max(161)}).strict();
type Record=z.infer<typeof recordSchema>;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Caption=Awaited<ReturnType<FrameCaptions["read"]>>;
function base(nodeId:string,children:Node[],index?:number,caption?:Caption){
  return index!==undefined&&caption?{nodeId,firstSampleTime:caption.time,lastSampleTime:caption.time,children:[],sourceIndices:[index],generated:false}:
    {nodeId,firstSampleTime:children[0]!.firstSampleTime,lastSampleTime:children.at(-1)!.lastSampleTime,children:children.map(node=>node.nodeId),sourceIndices:[],generated:true};
}
/** Validate the exact four-child recipe, not just graph reachability. Times are points, not coverage ranges. */
function validate(record:Record,captions?:Caption[]){
  const nodes=record.nodes;let offset=0;
  const accept=(expected:ReturnType<typeof base>)=>{const node=nodes[offset++];if(!node)throw new Error("Visual summary node missing");const {text,mayBeTruncated,...actual}=node;if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("Visual summary structure changed");return node;};
  let level:Node[]=[];
  for(let index=0;index<record.references.length;index++){
    const candidate=nodes[offset];if(!candidate)throw new Error("Visual summary leaf missing");
    const caption=captions?.[index];
    // Without captions, retain structural checks for discovery/deletion of orphaned summaries.
    const expected={nodeId:`n${offset}`,firstSampleTime:caption?.time??candidate.firstSampleTime,lastSampleTime:caption?.time??candidate.firstSampleTime,children:[],sourceIndices:[index],generated:false};
    const node=accept(expected);if(caption&&(node.text!==caption.text||node.mayBeTruncated!==caption.mayBeTruncated))throw new Error("Visual summary caption text changed");
    if(level.length&&node.firstSampleTime<=level.at(-1)!.lastSampleTime)throw new Error("Visual summary times are not increasing");
    level.push(node);
  }
  while(level.length>1){const next=[];for(let index=0;index<level.length;index+=4)next.push(accept(base(`n${offset}`,level.slice(index,index+4))));level=next;}
  if(offset!==nodes.length||record.root!==level[0]!.nodeId)throw new Error("Visual summary root or node count changed");
}
export class VisualSummaries{
  private captions:FrameCaptions;
  private model:ReturnType<typeof loadSummaryModel>|undefined;
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private config:ServerConfig){this.captions=new FrameCaptions(config);}
  async dispose(){await this.tail;const model=this.model;this.model=undefined;if(model)await(await model).dispose();await this.captions.dispose();}
  private async sources(id:string,references:z.infer<typeof visualSummaryReferences>){
    sha.parse(id);visualSummaryReferences.parse(references);const captions=[];
    for(const ref of references){const caption=await this.captions.read(ref.captionId);if(caption.id!==id||caption.sha256!==ref.sha256)throw new Error("Visual summary caption provenance changed");if(captions.length&&caption.time<=captions.at(-1)!.time)throw new Error("Caption times must be strictly increasing");captions.push(caption);}return captions;
  }
  generate(id:string,references:z.infer<typeof visualSummaryReferences>){const work=this.tail.then(()=>this.generateInner(id,references));this.tail=work.catch(()=>{});return work;}
  private async generateInner(id:string,references:z.infer<typeof visualSummaryReferences>){
    requireCapability(this.config.capabilities,"project-write");const captions=await this.sources(id,references);
    const nodes:Node[]=captions.map((caption,index)=>nodeSchema.parse({...base(`n${index}`,[],index,caption),text:caption.text,mayBeTruncated:caption.mayBeTruncated}));let level=[...nodes];
    if(level.length>1){
      if(!this.config.modelDirectory)throw new Error("Explicitly install summary models and set AVID_MCP_MODEL_DIR");
      this.model??=loadSummaryModel(this.config.modelDirectory).catch(error=>{this.model=undefined;throw error;});const model=await this.model;
      while(level.length>1){const next=[];for(let index=0;index<level.length;index+=4){
        const children=level.slice(index,index+4),text=children.map(node=>node.text).join(" ");
        const tokens=await model.tokenizer(text);if(tokens.input_ids.dims.at(-1)!>1000)throw new Error("Visual summary input exceeds model token capacity; shorten reviewed caption text");
        const result=await model(text,{max_new_tokens:80,min_new_tokens:8,do_sample:false,num_beams:1}),output=result[0];
        if(!output||!("summary_text" in output)||!output.summary_text.trim())throw new Error("Visual summary model returned no text");
        const node=nodeSchema.parse({...base(`n${nodes.length}`,children),text:output.summary_text.trim(),mayBeTruncated:!/[.!?]["']?$/.test(output.summary_text.trim())||children.some(child=>child.mayBeTruncated)});
        nodes.push(node);next.push(node);
      }level=next;}
    }
    const record=recordSchema.parse({schema:1,revision:randomUUID(),id,references,model:SUMMARY_MODEL,modelRevision:SUMMARY_REVISION,runtime:"4.2.0",dtype:"q8",generation:{maxNewTokens:80,minNewTokens:8,numBeams:1,doSample:false},root:level[0]!.nodeId,nodes});
    validate(record,await this.sources(id,references));
    const file=path.join(await new MediaLibrary(this.config).directory(),`visual-summary-${record.revision}.json`),temporary=file+`.${randomUUID()}.tmp`;
    try{await writeFile(temporary,JSON.stringify(record),{flag:"wx",mode:0o600});await link(temporary,file);}finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
    return {revision:record.revision,root:record.root,nodes:nodes.length,reviewRequired:true,factualEntailmentVerified:false};
  }
  private async read(revision:string,verify=true){
    uuid.parse(revision);const root=await new MediaLibrary(this.config).directory(),file=await resolveReadablePath(path.join(root,`visual-summary-${revision}.json`),[root],"file"),record=recordSchema.parse(await readBoundedJson(file,2*1024*1024));
    if(record.revision!==revision)throw new Error("Visual summary identity changed");await new MediaLibrary(this.config).metadata([record.id]);
    const captions=verify?await this.sources(record.id,record.references):undefined;validate(record,captions);return {record,captions,file,sha256:digest(record)};
  }
  async node(revision:string,nodeId?:string){
    const {record,captions,sha256}=await this.read(revision),byId=new Map(record.nodes.map(node=>[node.nodeId,node])),node=byId.get(nodeId??record.root);if(!node)throw new Error("Unknown visual summary node");
    const indices:number[]=[];const visit=(node:Node)=>{indices.push(...node.sourceIndices);for(const child of node.children)visit(byId.get(child)!);};visit(node);
    return {revision,sha256,id:record.id,model:record.model,modelRevision:record.modelRevision,runtime:record.runtime,dtype:record.dtype,generation:record.generation,node,children:node.children.map(child=>byId.get(child)!),sources:indices.map(index=>({index,...captions![index]})),reviewRequired:true,factualEntailmentVerified:false,samplingScope:"Selected seek-time images only; first/last sample times do not establish continuous coverage, exact frame PTS or events between images."};
  }
  async list(id:string,after="",limit=20){
    sha.parse(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);await new MediaLibrary(this.config).metadata([id]);
    const root=await new MediaLibrary(this.config).directory(),names=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Visual summary discovery limit exceeded");const match=/^visual-summary-([a-f0-9-]{36})\.json$/.exec(entry.name);if(match&&match[1]!>after)names.push(match[1]!);}
    const results=[],unavailable:{revision:string;mediaIdentityVerified:boolean;problem:{code:string;message:string}}[]=[];const page=names.sort().slice(0,limit);
    for(const revision of page){let mediaIdentityVerified=false;
      try{
        const file=await resolveReadablePath(path.join(root,`visual-summary-${revision}.json`),[root],"file"),raw=await readBoundedJson(file,2*1024*1024),identity=z.object({id:sha}).parse(raw);
        if(identity.id!==id)continue;mediaIdentityVerified=true;
        const {record,sha256}=await this.read(revision,false);if(record.id!==id)throw new Error("Visual summary media identity changed during discovery");
        results.push({revision,sha256,root:record.root,nodes:record.nodes.length,provenanceVerified:false});
      }catch{unavailable.push({revision,mediaIdentityVerified,problem:{code:"VISUAL_SUMMARY_UNAVAILABLE",message:"Saved visual summary could not be validated; no content returned."}});}
    }
    return {summaries:results,unavailable,nextAfter:names.length>page.length?page.at(-1)!:null,scope:"Cursor advances across saved revision files, including unrelated media and unavailable records. Unverified identities are not attributed to the requested media; follow nextAfter even when summaries is empty."};
  }
  async remove(revision:string,expectedSha256:string){
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const {file,sha256}=await this.read(revision,false);if(sha256!==expectedSha256)throw new Error("Visual summary changed; reload checksum");await unlink(file);return {revision,deleted:true,sourceModified:false,captionsModified:false};
  }
}
