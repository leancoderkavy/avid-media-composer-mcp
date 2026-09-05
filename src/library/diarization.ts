import {mkdir,writeFile,unlink,readdir,rmdir,opendir,link} from "node:fs/promises";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {speechAudioArguments} from "./speech-audio.js";
import {diarizationRuntimeStatus,DIARIZATION_WORKER} from "./diarization-runtime.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const diarizationOptions=z.object({speakers:z.union([z.literal(-1),z.number().int().min(1).max(20)]).default(-1),threshold:z.number().gt(0).max(1).default(0.5)}).strict();
export const diarizationOutput=z.object({schema:z.literal(1),recipe:z.literal(1),versions:z.object({"sherpa-onnx":z.literal("1.13.7"),"sherpa-onnx-core":z.literal("1.13.7"),numpy:z.literal("2.2.6")}).strict(),audioSha256:sha,duration:z.number().positive().max(600),options:diarizationOptions,spans:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive(),speaker:z.string().regex(/^speaker-[1-9][0-9]{0,3}$/)}).strict()).max(5000),speakerCount:z.number().int().min(0).max(5000),reviewRequired:z.literal(true),identitiesInferred:z.literal(false),accuracyVerified:z.literal(false)}).strict().superRefine((value,ctx)=>{
  const labels=new Set<string>();let previous=-1;
  for(const span of value.spans){if(span.start<previous||span.end<=span.start||span.end>value.duration)ctx.addIssue({code:"custom",message:"Invalid speaker interval ordering or bounds"});previous=span.start;
    if(!labels.has(span.speaker)){if(span.speaker!==`speaker-${labels.size+1}`)ctx.addIssue({code:"custom",message:"Invalid anonymous speaker label order"});labels.add(span.speaker);}}
  if(labels.size!==value.speakerCount||(value.options.speakers!==-1&&labels.size>value.options.speakers))ctx.addIssue({code:"custom",message:"Speaker count mismatch"});
});
const recordSchema=z.object({schema:z.literal(1),analysisId:uuid,id:sha,start:z.number().nonnegative(),end:z.number().positive(),audioRecipe:z.literal(3),workerSha256:sha,runtimeTreeSha256:sha,createdAt:z.string(),machine:diarizationOutput}).strict().refine(value=>value.end>value.start&&value.end-value.start<=600&&value.machine.spans.every(span=>span.start<value.end-value.start)&&value.machine.duration<=Math.ceil((value.end-value.start)*16000)/16000,"Invalid diarization source range");
export class SpeakerAnalysis{
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private config:ServerConfig){}
  private serialize<T>(fn:()=>Promise<T>){const operation=this.tail.then(fn);this.tail=operation.catch(()=>{});return operation;}
  private async source(id:string){sha.parse(id);const [entry]=await new MediaLibrary(this.config).metadata([id]);if(!entry)throw new Error("Unknown speaker media");const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Speaker source changed; reindex");return {source,entry};}
  private async directory(analysisId:string){uuid.parse(analysisId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`speakers-${analysisId}`),[root],"directory");}
  private async record(analysisId:string){
    const directory=await this.directory(analysisId),file=await resolveReadablePath(path.join(directory,"analysis.json"),[directory],"file"),bytes=await readBoundedFile(file,1024*1024),record=recordSchema.parse(JSON.parse(bytes.toString("utf8")));
    if(record.analysisId!==analysisId)throw new Error("Speaker analysis identity mismatch");const {entry}=await this.source(record.id);if(record.end>Number(entry.metadata.format?.duration))throw new Error("Speaker range exceeds source");
    const audio=await resolveReadablePath(path.join(directory,"speech.f32"),[directory],"file"),pcm=await readBoundedFile(audio,Math.ceil((record.end-record.start)*16000)*4);
    if(pcm.length!==Math.round(record.machine.duration*16000)*4||createHash("sha256").update(pcm).digest("hex")!==record.machine.audioSha256)throw new Error("Speaker audio changed");
    return {record,directory,file,audio,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  async read(analysisId:string,offset=0,limit=100){
    z.number().int().min(0).max(5000).parse(offset);z.number().int().min(1).max(500).parse(limit);const {record,sha256}=await this.record(analysisId),{machine,...metadata}=record;
    const spans=machine.spans.slice(offset,offset+limit).map((span,index)=>({spanId:`span-${offset+index+1}`,speaker:span.speaker,start:record.start+span.start,end:Math.min(record.end,record.start+span.end)}));
    return {...metadata,sha256,options:machine.options,versions:machine.versions,audioSha256:machine.audioSha256,analyzedSeconds:machine.duration,speakerCount:machine.speakerCount,totalSpans:machine.spans.length,spans,nextOffset:offset+limit<machine.spans.length?offset+limit:null,reviewRequired:true,identitiesInferred:false,accuracyVerified:false,note:"Anonymous labels apply only to this analysis. Intervals may overlap; clustering can split one voice or combine different voices. Source-time ranges are model estimates, not verified word/speaker alignment."};
  }
  generate(id:string,start:number,end:number,input:z.input<typeof diarizationOptions>={}){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"export");requireCapability(this.config.capabilities,"project-write");const options=diarizationOptions.parse(input);
    if(!this.config.modelDirectory)throw new Error("Install the diarization runtime explicitly and set AVID_MCP_MODEL_DIR");
    const {source,entry}=await this.source(id),duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(duration)||start<0||end<=start||end>duration||end-start>600)throw new Error("Diarization range must be within media and at most 600 seconds");
    const runtime=await diarizationRuntimeStatus(this.config.modelDirectory);if(!runtime.unchanged)throw new Error("Diarization runtime changed; verify setup before analysis");
    const analysisId=randomUUID(),directory=path.join(await new MediaLibrary(this.config).directory(),`speakers-${analysisId}`);await mkdir(directory);const audio=path.join(directory,"speech.f32");
    const extracted=await runProcess(this.config.ffmpegExecutable??"ffmpeg",speechAudioArguments(source,audio,start,end),{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});if(extracted.exitCode!==0)throw new Error("Speaker audio extraction failed");
    const pcm=await readBoundedFile(audio,Math.ceil((end-start)*16000)*4);if(!pcm.length||pcm.length%4)throw new Error("Unexpected speaker audio buffer");const audioSha256=createHash("sha256").update(pcm).digest("hex");
    const inferred=await runProcess(runtime.executable,["-B",DIARIZATION_WORKER,"--root",runtime.directory,"--audio",audio,"--speakers",String(options.speakers),"--threshold",String(options.threshold)],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:1024*1024});if(inferred.exitCode!==0)throw new Error("Local speaker analysis failed; incomplete files retained");
    const machine=diarizationOutput.parse(JSON.parse(inferred.stdout));if(machine.audioSha256!==audioSha256||Math.round(machine.duration*16000)*4!==pcm.length||JSON.stringify(machine.options)!==JSON.stringify(options))throw new Error("Speaker inference input mismatch");
    if(await sha256File(source)!==id||await sha256File(audio)!==audioSha256)throw new Error("Speaker inputs changed during inference");const after=await diarizationRuntimeStatus(this.config.modelDirectory);if(!after.unchanged||after.treeSha256!==runtime.treeSha256||after.receipt.workerSha256!==runtime.receipt.workerSha256)throw new Error("Diarization runtime changed during inference");
    const record=recordSchema.parse({schema:1,analysisId,id,start,end,audioRecipe:3,workerSha256:runtime.receipt.workerSha256,runtimeTreeSha256:runtime.treeSha256,createdAt:new Date().toISOString(),machine});
    const temporary=path.join(directory,"analysis.tmp"),file=path.join(directory,"analysis.json");await writeFile(temporary,JSON.stringify(record),{flag:"wx",mode:0o600});await link(temporary,file);await unlink(temporary);return this.read(analysisId);
  });}
  async list(id:string,after?:string,limit=20){
    await this.source(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);const root=await new MediaLibrary(this.config).directory(),matching=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Speaker discovery limit exceeded");if(!entry.isDirectory()||!/^speakers-[a-f0-9-]{36}$/.test(entry.name))continue;const analysisId=entry.name.slice(9);if(after&&analysisId<=after)continue;
      try{const directory=await this.directory(analysisId),file=await resolveReadablePath(path.join(directory,"analysis.json"),[directory],"file"),record=recordSchema.parse(JSON.parse((await readBoundedFile(file,1024*1024)).toString("utf8")));if(record.id===id)matching.push(analysisId);}catch(error){if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;}}
    matching.sort();const analyses=[];for(const analysisId of matching.slice(0,limit)){try{const value=await this.read(analysisId,0,1);const {spans,nextOffset,...summary}=value;analyses.push(summary);}catch(error){analyses.push({analysisId,state:"unavailable",message:(error as Error).message});}}
    return {analyses,nextAfter:matching.length>limit?matching[limit-1]:null};
  }
  remove(analysisId:string,expectedSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const current=await this.record(analysisId);if(current.sha256!==expectedSha256)throw new Error("Speaker analysis changed");const files=await readdir(current.directory);if(files.length!==2||!files.includes("analysis.json")||!files.includes("speech.f32"))throw new Error("Unexpected speaker files; removal refused");
    if(await sha256File(current.file)!==expectedSha256)throw new Error("Speaker analysis changed before deletion");await unlink(current.file);await unlink(current.audio);await rmdir(current.directory);return {analysisId,removed:true,sourceModified:false};
  });}
}
