import {speakerOwner,assertSpeakerStopped} from "./speaker-cleanup.js";
import {constants} from "node:fs";
import {speakerSpan,speakerEdits,applySpeakerEdits} from "./speaker-edits.js";
import {mkdir,writeFile,unlink,readdir,rmdir,opendir,link,copyFile,lstat,realpath,rename} from "node:fs/promises";
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
import {TranscriptRevisions} from "./transcripts.js";
import {alignSpeakerSegment} from "./speaker-alignment.js";
import {speakerAssignments,speakerAssignmentProvenance} from "./speaker-assignments.js";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const diarizationOptions=z.object({speakers:z.union([z.literal(-1),z.number().int().min(1).max(20)]).default(-1),threshold:z.number().gt(0).max(1).default(0.5)}).strict();
const storedDiarizationOptions=z.object({speakers:z.union([z.literal(-1),z.number().int().min(1).max(20)]),threshold:z.number().gt(0).max(1)}).strict();
function verifyPcm(pcm:Buffer){if(!pcm.length||pcm.length%4)throw new Error("Unexpected speaker audio buffer");for(let offset=0;offset<pcm.length;offset+=4)if(!Number.isFinite(pcm.readFloatLE(offset)))throw new Error("Nonfinite speaker audio sample");}
export const diarizationOutput=z.object({schema:z.literal(1),recipe:z.literal(1),versions:z.object({"sherpa-onnx":z.literal("1.13.7"),"sherpa-onnx-core":z.literal("1.13.7"),numpy:z.literal("2.2.6")}).strict(),audioSha256:sha,duration:z.number().positive().max(600),options:storedDiarizationOptions,spans:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive(),speaker:z.string().regex(/^speaker-[1-9][0-9]{0,3}$/)}).strict()).max(5000),speakerCount:z.number().int().min(0).max(5000),reviewRequired:z.literal(true),identitiesInferred:z.literal(false),accuracyVerified:z.literal(false)}).strict().superRefine((value,ctx)=>{
  const labels=new Set<string>();let previous=-1;
  for(const span of value.spans){if(span.start<previous||span.end<=span.start||span.end>value.duration)ctx.addIssue({code:"custom",message:"Invalid speaker interval ordering or bounds"});previous=span.start;
    if(!labels.has(span.speaker)){if(span.speaker!==`speaker-${labels.size+1}`)ctx.addIssue({code:"custom",message:"Invalid anonymous speaker label order"});labels.add(span.speaker);}}
  if(labels.size!==value.speakerCount||(value.options.speakers!==-1&&labels.size>value.options.speakers))ctx.addIssue({code:"custom",message:"Speaker count mismatch"});
});
const audioCheckpoint=z.object({ownerSha256:sha.optional(),schema:z.literal(1),analysisId:uuid,id:sha,start:z.number().nonnegative(),end:z.number().positive(),audioRecipe:z.literal(3),audioSha256:sha,audioBytes:z.number().int().positive().max(38400000),workerSha256:sha,runtimeTreeSha256:sha,options:storedDiarizationOptions}).strict().refine(value=>value.end>value.start&&value.end-value.start<=600&&value.audioBytes%4===0&&value.audioBytes<=Math.ceil((value.end-value.start)*16000)*4,"Invalid speaker checkpoint range");
const reviewSchema=z.object({parentAnalysisId:uuid,parentSha256:sha,spans:z.array(speakerSpan).max(5000)}).strict();
const recordSchema=z.object({recovery:z.object({parentAnalysisId:uuid,parentCheckpointSha256:sha,reusedAudio:z.literal(true)}).strict().optional(),schema:z.union([z.literal(1),z.literal(2)]),review:reviewSchema.optional(),analysisId:uuid,id:sha,start:z.number().nonnegative(),end:z.number().positive(),audioRecipe:z.literal(3),workerSha256:sha,runtimeTreeSha256:sha,createdAt:z.string(),machine:diarizationOutput}).strict().refine(value=>value.end>value.start&&value.end-value.start<=600&&value.machine.spans.every(span=>span.start<value.end-value.start)&&value.machine.duration<=Math.ceil((value.end-value.start)*16000)/16000,"Invalid diarization source range").superRefine((value,ctx)=>{
  if((value.schema===2)!==!!value.review)ctx.addIssue({code:"custom",message:"Speaker review recipe mismatch"});
  if(value.review){const spans=value.review.spans;if(value.review.parentAnalysisId===value.analysisId||new Set(spans.map(span=>span.spanId)).size!==spans.length||spans.some((span,index)=>span.start<value.start||span.end>value.end||(index>0&&span.start<spans[index-1]!.start)))ctx.addIssue({code:"custom",message:"Invalid reviewed speaker intervals or parent"});}
});
function machineSpans(record:z.infer<typeof recordSchema>){return record.machine.spans.map((span,index)=>({spanId:`span-${index+1}`,speaker:span.speaker,start:record.start+span.start,end:Math.min(record.end,record.start+span.end)}));}
function effectiveSpans(record:z.infer<typeof recordSchema>){return record.review?.spans??machineSpans(record);}
export class SpeakerAnalysis{
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private config:ServerConfig){}
  private serialize<T>(fn:()=>Promise<T>){const operation=this.tail.then(fn);this.tail=operation.catch(()=>{});return operation;}
  private async source(id:string){sha.parse(id);const [entry]=await new MediaLibrary(this.config).metadata([id]);if(!entry)throw new Error("Unknown speaker media");const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Speaker source changed; reindex");return {source,entry};}
  private async directory(analysisId:string){uuid.parse(analysisId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`speakers-${analysisId}`),[root],"directory");}
  private async record(analysisId:string){
    const directory=await this.directory(analysisId),file=await resolveReadablePath(path.join(directory,"analysis.json"),[directory],"file"),bytes=await readBoundedFile(file,2*1024*1024),record=recordSchema.parse(JSON.parse(bytes.toString("utf8")));
    if(record.analysisId!==analysisId)throw new Error("Speaker analysis identity mismatch");const {entry}=await this.source(record.id);if(!Number.isFinite(Number(entry.metadata.format?.duration))||record.end>Number(entry.metadata.format?.duration))throw new Error("Speaker range exceeds source");
    const audio=await resolveReadablePath(path.join(directory,"speech.f32"),[directory],"file"),pcm=await readBoundedFile(audio,Math.ceil((record.end-record.start)*16000)*4);
    if(pcm.length!==Math.round(record.machine.duration*16000)*4||createHash("sha256").update(pcm).digest("hex")!==record.machine.audioSha256)throw new Error("Speaker audio changed");verifyPcm(pcm);
    return {record,directory,file,audio,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  async read(analysisId:string,offset=0,limit=100,view:"effective"|"machine"="effective"){
    z.number().int().min(0).max(5000).parse(offset);z.number().int().min(1).max(500).parse(limit);z.enum(["effective","machine"]).parse(view);const {record,sha256}=await this.record(analysisId),{machine,review,...metadata}=record;
    const all=view==="machine"?machineSpans(record):effectiveSpans(record),spans=all.slice(offset,offset+limit);
    const analyzedRange={start:record.start,end:record.start+machine.duration},coverage=alignSpeakerSegment(analyzedRange,analyzedRange,all,0);
    const speechPresence={view,status:coverage.speechSeconds>0?"spans_present":"no_spans_in_analyzed_audio",start:analyzedRange.start,end:analyzedRange.end,coveredSeconds:coverage.speechSeconds,uncoveredSeconds:coverage.uncoveredSeconds,fraction:coverage.speechFractionOfSegment,verified:false,note:"Union of all selected-view spans across the analyzed audio, independent of this page. No spans does not prove absence of speech."};
    return {...metadata,sha256,view,speechPresence,edited:!!review,parentAnalysisId:review?.parentAnalysisId,parentSha256:review?.parentSha256,machineSpeakerCount:machine.speakerCount,options:machine.options,versions:machine.versions,audioSha256:machine.audioSha256,analyzedSeconds:machine.duration,speakerCount:new Set(all.map(span=>span.speaker)).size,totalSpans:all.length,spans,nextOffset:offset+limit<all.length?offset+limit:null,reviewRequired:true,identitiesInferred:false,accuracyVerified:false,note:"Anonymous labels apply only to this analysis. Intervals may overlap; clustering can split one voice or combine different voices. Source-time ranges are model estimates, not verified word/speaker alignment."};
  }
  async align(analysisId:string,analysisSha256:string,transcriptRevision:string,transcriptSha256:string,after=-1,limit=100,candidateLimit=20){
    sha.parse(analysisSha256);sha.parse(transcriptSha256);z.number().int().min(-1).max(100000).parse(after);z.number().int().min(1).max(100).parse(limit);z.number().int().min(1).max(100).parse(candidateLimit);
    const saved=await this.record(analysisId);if(saved.sha256!==analysisSha256)throw new Error("Speaker analysis changed; reload its checksum");
    const transcript=await new TranscriptRevisions(this.config).snapshot(saved.record.id,transcriptRevision);if(transcript.sha256!==transcriptSha256)throw new Error("Transcript changed; reload its checksum");
    const {record}=saved,spans=effectiveSpans(record);
    const matching=transcript.record.segments.map((segment,index)=>({segment,index})).filter(({segment,index})=>index>after&&segment.start<record.end&&segment.end>record.start);
    const segments=matching.slice(0,limit).map(({segment,index})=>({index,segment,...alignSpeakerSegment(segment,record,spans,candidateLimit)}));
    if(await sha256File(saved.file)!==analysisSha256||await sha256File(transcript.file)!==transcriptSha256)throw new Error("Speaker analysis or transcript changed during alignment");await this.source(record.id);
    return {analysisId,analysisSha256,transcriptRevision,transcriptSha256,id:record.id,start:record.start,end:record.end,segments,nextAfter:matching.length>limit?segments.at(-1)!.index:null,scope:"Transcript segments intersecting the analyzed source range; indices refer to the original transcript revision.",assignmentApplied:false,reviewRequired:true,wordAlignmentVerified:false,speakerIdentityVerified:false,note:"Candidates reflect interval overlap, not confidence or verified speaker attribution. Multiple sequential or simultaneous voices remain ambiguous. Original transcript text and speaker fields are unchanged. Candidate lists may be explicitly truncated; inspect saved speaker pages for all intervals."};
  }
  assign(analysisId:string,analysisSha256:string,transcriptRevision:string,transcriptSha256:string,input:z.input<typeof speakerAssignments>){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(analysisSha256);sha.parse(transcriptSha256);const assignments=speakerAssignments.parse(input),saved=await this.record(analysisId);
    if(saved.sha256!==analysisSha256)throw new Error("Speaker analysis changed; reload its checksum");const revisions=new TranscriptRevisions(this.config),transcript=await revisions.snapshot(saved.record.id,transcriptRevision);if(transcript.sha256!==transcriptSha256)throw new Error("Transcript changed; reload its checksum");
    const record=saved.record,spans=effectiveSpans(record),names=new Map<string,string>();
    const decisions=assignments.map(assignment=>{
      const segment=transcript.record.segments[assignment.index];if(!segment)throw new Error("Transcript segment index missing");
      const {candidates,candidatesTruncated,...coverage}=alignSpeakerSegment(segment,record,spans,1),candidate=alignSpeakerSegment(segment,record,spans.filter(span=>span.speaker===assignment.speaker),1).candidates[0],overlap={...coverage,selectedCandidate:candidate};if(!candidate)throw new Error(`Speaker ${assignment.speaker} does not overlap transcript segment ${assignment.index}`);
      if(overlap.totalCandidates>1&&!assignment.allowAmbiguous)throw new Error(`Multiple candidates at segment ${assignment.index}; explicit allowAmbiguous is required`);
      if(overlap.outsideAnalysisSeconds>0&&!assignment.allowPartialRange)throw new Error(`Segment ${assignment.index} extends outside analysis; explicit allowPartialRange is required`);
      const value=assignment.displayName??assignment.speaker;if(names.has(assignment.speaker)&&names.get(assignment.speaker)!==value)throw new Error("Conflicting display names for one anonymous speaker");names.set(assignment.speaker,value);
      return {index:assignment.index,previousSpeaker:segment.speaker??null,assignedSpeaker:value,anonymousSpeaker:assignment.speaker,overlap,segment:{...segment,speaker:value}};
    });
    if(await sha256File(saved.file)!==analysisSha256||await sha256File(saved.audio)!==record.machine.audioSha256)throw new Error("Speaker inputs changed before assignment");await this.source(record.id);
    const provenance=speakerAssignmentProvenance.parse({schema:1,kind:"caller-selected-speaker-candidates",analysisId,analysisSha256,transcriptRevision,transcriptSha256,assignments,identityVerified:false,wordAlignmentVerified:false});
    const updated=await revisions.correct(record.id,transcriptRevision,transcriptSha256,decisions.map(decision=>({action:"replace" as const,index:decision.index,segment:decision.segment})),provenance);
    return {...updated,id:record.id,sha256:await sha256File(updated.path),speakerAssignment:provenance,decisions:decisions.map(({segment,...decision})=>decision),reviewRequired:true,note:"Caller-selected segment attribution saved in a new transcript revision. Interval overlap and provided display names do not verify identity or word-level alignment. Source media, speaker analysis and previous transcript revision are retained."};
  });}
  correct(analysisId:string,expectedSha256:string,input:z.input<typeof speakerEdits>){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const saved=await this.record(analysisId);if(saved.sha256!==expectedSha256)throw new Error("Speaker analysis changed; reload its checksum");
    const spans=applySpeakerEdits(effectiveSpans(saved.record),input,saved.record),childId=randomUUID();
    const record=recordSchema.parse({...saved.record,schema:2,analysisId:childId,createdAt:new Date().toISOString(),review:{parentAnalysisId:analysisId,parentSha256:expectedSha256,spans}}),content=JSON.stringify(record);if(Buffer.byteLength(content)>2*1024*1024)throw new Error("Corrected speaker record exceeds byte limit");
    const directory=path.join(await new MediaLibrary(this.config).directory(),`speakers-${childId}`);await mkdir(directory);const audio=path.join(directory,"speech.f32");await copyFile(saved.audio,audio,constants.COPYFILE_EXCL);
    if(await sha256File(audio)!==record.machine.audioSha256||await sha256File(saved.file)!==expectedSha256||await sha256File(saved.audio)!==record.machine.audioSha256)throw new Error("Speaker parent or PCM changed during correction");await this.source(record.id);
    const temporary=path.join(directory,"analysis.tmp");await writeFile(temporary,content,{flag:"wx",mode:0o600});await link(temporary,path.join(directory,"analysis.json"));await unlink(temporary);return {...await this.read(childId),previousAnalysisRetained:true,sourceModified:false,note:"Caller-corrected intervals saved in a self-contained child analysis. Original model output and copied PCM are retained; view=machine reads original model spans. Corrections do not establish identity or accuracy."};
  });}
  async checkpoint(analysisId:string){
    const directory=await this.directory(analysisId),file=await resolveReadablePath(path.join(directory,"audio.json"),[directory],"file"),bytes=await readBoundedFile(file,16384),checkpoint=audioCheckpoint.parse(JSON.parse(bytes.toString("utf8")));
    if(checkpoint.analysisId!==analysisId)throw new Error("Speaker checkpoint identity mismatch");const {entry}=await this.source(checkpoint.id);if(!Number.isFinite(Number(entry.metadata.format?.duration))||checkpoint.end>Number(entry.metadata.format?.duration))throw new Error("Speaker checkpoint exceeds source");
    const audio=await resolveReadablePath(path.join(directory,"speech.f32"),[directory],"file"),pcm=await readBoundedFile(audio,checkpoint.audioBytes);if(pcm.length!==checkpoint.audioBytes||createHash("sha256").update(pcm).digest("hex")!==checkpoint.audioSha256)throw new Error("Speaker checkpoint audio changed");verifyPcm(pcm);
    if(checkpoint.ownerSha256&&await sha256File(await resolveReadablePath(path.join(directory,"owner.json"),[directory],"file"))!==checkpoint.ownerSha256)throw new Error("Speaker owner changed");
    let published=false;try{await lstat(path.join(directory,"analysis.json"));published=true;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    return {...checkpoint,sha256:createHash("sha256").update(bytes).digest("hex"),published,note:"Verified audio checkpoint; publication presence does not verify its result. This does not establish worker termination. Resume copies audio into a new analysis and retains the parent."};
  }
  resume(analysisId:string,expectedSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"export");requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const checkpoint=await this.checkpoint(analysisId);if(checkpoint.sha256!==expectedSha256)throw new Error("Speaker checkpoint changed");if(checkpoint.published)throw new Error("Speaker result already published; inspect it before retrying");
    const result=await this.generateRun(checkpoint.id,checkpoint.start,checkpoint.end,checkpoint.options,checkpoint);return {...result,parentAnalysisId:analysisId,parentCheckpointSha256:expectedSha256,reusedAudio:true};
  });}
  generate(id:string,start:number,end:number,input:z.input<typeof diarizationOptions>={}){return this.serialize(()=>this.generateRun(id,start,end,input));}
  private async generateRun(id:string,start:number,end:number,input:z.input<typeof diarizationOptions>,parent?:Awaited<ReturnType<SpeakerAnalysis["checkpoint"]>>){
    requireCapability(this.config.capabilities,"export");requireCapability(this.config.capabilities,"project-write");const options=diarizationOptions.parse(input);
    if(!this.config.modelDirectory)throw new Error("Install the diarization runtime explicitly and set AVID_MCP_MODEL_DIR");
    const {source,entry}=await this.source(id),duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(duration)||start<0||end<=start||end>duration||end-start>600)throw new Error("Diarization range must be within media and at most 600 seconds");
    const runtime=await diarizationRuntimeStatus(this.config.modelDirectory);if(!runtime.unchanged)throw new Error("Diarization runtime changed; verify setup before analysis");
    if(parent&&(runtime.treeSha256!==parent.runtimeTreeSha256||runtime.receipt.workerSha256!==parent.workerSha256))throw new Error("Speaker checkpoint runtime changed");
    const analysisId=randomUUID(),directory=path.join(await new MediaLibrary(this.config).directory(),`speakers-${analysisId}`);await mkdir(directory);const audio=path.join(directory,"speech.f32");
    await writeFile(path.join(directory,"owner.json"),JSON.stringify(speakerOwner.parse({schema:1,analysisId,id,pid:process.pid,executables:[...new Set([path.basename(process.execPath),path.basename(runtime.executable),path.basename(this.config.ffmpegExecutable??"ffmpeg.exe")].map(name=>process.platform==="win32"&&!path.extname(name)?name+".exe":name))]})),{flag:"wx",mode:0o600});
    if(parent){
      if(runtime.treeSha256!==parent.runtimeTreeSha256||runtime.receipt.workerSha256!==parent.workerSha256)throw new Error("Speaker checkpoint runtime changed");
      const current=await this.checkpoint(parent.analysisId);if(current.sha256!==parent.sha256||current.published)throw new Error("Speaker parent checkpoint changed or published");
      await copyFile(path.join(await this.directory(parent.analysisId),"speech.f32"),audio,constants.COPYFILE_EXCL);
    }else{
    const extracted=await runProcess(this.config.ffmpegExecutable??"ffmpeg",speechAudioArguments(source,audio,start,end),{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});if(extracted.exitCode!==0)throw new Error("Speaker audio extraction failed");
    }
    const pcm=await readBoundedFile(audio,Math.ceil((end-start)*16000)*4);verifyPcm(pcm);const audioSha256=createHash("sha256").update(pcm).digest("hex");
    if(parent&&audioSha256!==parent.audioSha256)throw new Error("Speaker copied audio changed");if(await sha256File(source)!==id)throw new Error("Speaker source changed during extraction");
    const checkpoint=audioCheckpoint.parse({schema:1,analysisId,id,start,end,audioRecipe:3,ownerSha256:await sha256File(path.join(directory,"owner.json")),audioSha256,audioBytes:pcm.length,workerSha256:runtime.receipt.workerSha256,runtimeTreeSha256:runtime.treeSha256,options});
    const audioTemporary=path.join(directory,"audio.tmp");await writeFile(audioTemporary,JSON.stringify(checkpoint),{flag:"wx",mode:0o600});await link(audioTemporary,path.join(directory,"audio.json"));await unlink(audioTemporary);
    const inferred=await runProcess(runtime.executable,["-B",DIARIZATION_WORKER,"--root",runtime.directory,"--audio",audio,"--speakers",String(options.speakers),"--threshold",String(options.threshold)],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:1024*1024});if(inferred.exitCode!==0)throw new Error("Local speaker analysis failed; incomplete files retained");
    const machine=diarizationOutput.parse(JSON.parse(inferred.stdout));if(machine.audioSha256!==audioSha256||Math.round(machine.duration*16000)*4!==pcm.length||JSON.stringify(machine.options)!==JSON.stringify(options))throw new Error("Speaker inference input mismatch");
    if(await sha256File(source)!==id||await sha256File(audio)!==audioSha256)throw new Error("Speaker inputs changed during inference");const after=await diarizationRuntimeStatus(this.config.modelDirectory);if(!after.unchanged||after.treeSha256!==runtime.treeSha256||after.receipt.workerSha256!==runtime.receipt.workerSha256)throw new Error("Diarization runtime changed during inference");
    const record=recordSchema.parse({schema:1,analysisId,id,start,end,audioRecipe:3,workerSha256:runtime.receipt.workerSha256,runtimeTreeSha256:runtime.treeSha256,createdAt:new Date().toISOString(),machine,...(parent?{recovery:{parentAnalysisId:parent.analysisId,parentCheckpointSha256:parent.sha256,reusedAudio:true}}:{})});
    const temporary=path.join(directory,"analysis.tmp"),file=path.join(directory,"analysis.json");await writeFile(temporary,JSON.stringify(record),{flag:"wx",mode:0o600});await link(temporary,file);await unlink(temporary);return this.read(analysisId);
  }
  async list(id:string,after?:string,limit=20){
    await this.source(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);const root=await new MediaLibrary(this.config).directory(),matching=[],unpublished:string[]=[],unclassified:string[]=[];let scanned=0,unpublishedCount=0,unclassifiedCount=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Speaker discovery limit exceeded");if(!entry.isDirectory()||!entry.name.startsWith("speakers-"))continue;const analysisId=entry.name.slice(9);if(!uuid.safeParse(analysisId).success||after&&analysisId<=after)continue;
      try{const directory=await this.directory(analysisId);await lstat(path.join(directory,"analysis.json"));const file=await resolveReadablePath(path.join(directory,"analysis.json"),[directory],"file"),record=recordSchema.parse(JSON.parse((await readBoundedFile(file,2*1024*1024)).toString("utf8")));if(record.analysisId!==analysisId)throw new Error("Speaker analysis identity mismatch");if(record.id===id)matching.push(analysisId);}catch(error){
        if((error as {code?:string}).code==="ENOENT"){unpublishedCount++;unpublished.push(analysisId);unpublished.sort();if(unpublished.length>20)unpublished.pop();continue;}
        unclassifiedCount++;unclassified.push(analysisId);unclassified.sort();if(unclassified.length>20)unclassified.pop();
      }}
    matching.sort();const analyses=[];for(const analysisId of matching.slice(0,limit)){try{const value=await this.read(analysisId,0,1);const {spans,nextOffset,...summary}=value;analyses.push(summary);}catch(error){analyses.push({analysisId,state:"unavailable",message:(error as Error).message});}}
    return {analyses,nextAfter:matching.length>limit?matching[limit-1]:null,discovery:{unpublishedCount,unpublishedAnalysisIds:unpublished,unpublishedDiagnosticsTruncated:unpublishedCount>unpublished.length,unclassifiedCount,unclassifiedAnalysisIds:unclassified,diagnosticsTruncated:unclassifiedCount>unclassified.length,scope:"Library-wide candidate directories after the supplied cursor. Missing or unreadable records cannot be attributed to this media. Unpublished count does not establish failure or worker termination; no files were changed."}};
  }
  recoverCleanup(name:string,expectedCheckpointSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedCheckpointSha256);
    const parts=name.match(/^speaker-cleanup-([a-f0-9-]{36})-([a-f0-9-]{36})$/);if(!parts)throw new Error("Invalid speaker cleanup directory name");const analysisId=uuid.parse(parts[1]);uuid.parse(parts[2]);
    const root=await new MediaLibrary(this.config).directory(),directory=path.join(root,name),destination=path.join(root,`speakers-${analysisId}`),info=await lstat(directory);
    if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error("Speaker recovery requires a direct cleanup directory");
    const names=(await readdir(directory)).sort();if(JSON.stringify(names)!==JSON.stringify(["audio.json","owner.json","speech.f32"]))throw new Error("Speaker cleanup is partial or contains unexpected files; recovery refused");
    for(const name of names){const info=await lstat(path.join(directory,name));if(!info.isFile()||info.isSymbolicLink())throw new Error("Speaker recovery files must be direct regular files");}
    const bytes=await readBoundedFile(path.join(directory,"audio.json"),16384),checkpoint=audioCheckpoint.parse(JSON.parse(bytes.toString("utf8")));if(createHash("sha256").update(bytes).digest("hex")!==expectedCheckpointSha256||checkpoint.analysisId!==analysisId||!checkpoint.ownerSha256)throw new Error("Speaker recovery checkpoint mismatch");
    const ownerBytes=await readBoundedFile(path.join(directory,"owner.json"),16384),owner=speakerOwner.parse(JSON.parse(ownerBytes.toString("utf8")));if(createHash("sha256").update(ownerBytes).digest("hex")!==checkpoint.ownerSha256||owner.analysisId!==analysisId||owner.id!==checkpoint.id)throw new Error("Speaker recovery owner mismatch");
    const {entry}=await this.source(checkpoint.id);if(!Number.isFinite(Number(entry.metadata.format?.duration))||checkpoint.end>Number(entry.metadata.format?.duration))throw new Error("Speaker recovery exceeds source");
    const pcm=await readBoundedFile(path.join(directory,"speech.f32"),checkpoint.audioBytes);verifyPcm(pcm);if(pcm.length!==checkpoint.audioBytes||createHash("sha256").update(pcm).digest("hex")!==checkpoint.audioSha256)throw new Error("Speaker recovery audio changed");
    await assertSpeakerStopped(directory,owner);await assertSpeakerStopped(destination,owner);
    try{await lstat(destination);throw new Error("Speaker recovery destination already exists");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(names)||await sha256File(path.join(directory,"audio.json"))!==expectedCheckpointSha256||await sha256File(path.join(directory,"owner.json"))!==checkpoint.ownerSha256||await sha256File(path.join(directory,"speech.f32"))!==checkpoint.audioSha256)throw new Error("Speaker cleanup changed during recovery");
    await rename(directory,destination);try{return {...await this.checkpoint(analysisId),recovered:true,sourceModified:false};}catch(error){throw new Error(`Speaker files were restored to ${destination}, but verification failed. Inspect that location before retrying. ${(error as Error).message}`);}
  });}
  cleanup(analysisId:string,expectedCheckpointSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedCheckpointSha256);const checkpoint=await this.checkpoint(analysisId);if(checkpoint.sha256!==expectedCheckpointSha256||checkpoint.published)throw new Error("Speaker checkpoint changed or result published; cleanup refused");
    const directory=await this.directory(analysisId),root=await new MediaLibrary(this.config).directory(),requested=path.join(root,`speakers-${analysisId}`);
    if((await lstat(requested)).isSymbolicLink()||await realpath(requested)!==requested||directory!==requested)throw new Error("Speaker cleanup requires a direct directory");
    const inventory=async(dir:string)=>{const names=(await readdir(dir)).sort();if(JSON.stringify(names)!==JSON.stringify(["audio.json","owner.json","speech.f32"]))throw new Error("Unexpected or missing speaker cleanup files");const hashes:Record<string,string>={};for(const name of names){const file=path.join(dir,name),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>(name==="speech.f32"?38400000:16384))throw new Error("Invalid speaker cleanup file");hashes[name]=await sha256File(file);}return hashes;};
    const hashes=await inventory(directory),owner=speakerOwner.parse(JSON.parse((await readBoundedFile(path.join(directory,"owner.json"),16384)).toString("utf8")));if(!checkpoint.ownerSha256||hashes["owner.json"]!==checkpoint.ownerSha256||owner.analysisId!==analysisId||owner.id!==checkpoint.id||hashes["audio.json"]!==expectedCheckpointSha256||hashes["speech.f32"]!==checkpoint.audioSha256)throw new Error("Speaker cleanup provenance mismatch");
    await assertSpeakerStopped(directory,owner);if(JSON.stringify(await inventory(directory))!==JSON.stringify(hashes))throw new Error("Speaker cleanup files changed");
    const quarantine=path.join(root,`speaker-cleanup-${analysisId}-${randomUUID()}`);await rename(directory,quarantine);
    try{await assertSpeakerStopped(directory,owner);await assertSpeakerStopped(quarantine,owner);if(JSON.stringify(await inventory(quarantine))!==JSON.stringify(hashes))throw new Error("Speaker cleanup files changed after preparation");await this.source(checkpoint.id);
      for(const name of ["audio.json","speech.f32","owner.json"])await unlink(path.join(quarantine,name));await rmdir(quarantine);
    }catch(error){throw new Error(`Speaker cleanup did not finish; retained files may be at ${quarantine}. ${(error as Error).message}`);}
    return {analysisId,removed:true,sourceModified:false,checkpointSha256:expectedCheckpointSha256,note:"Only the verified stopped incomplete run was removed. Older ownerless runs and interrupted partial cleanup need separate review."};
  });}
  remove(analysisId:string,expectedSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const current=await this.record(analysisId);if(current.sha256!==expectedSha256)throw new Error("Speaker analysis changed");const files=await readdir(current.directory);if(!files.includes("analysis.json")||!files.includes("speech.f32")||files.some(file=>!["analysis.json","speech.f32","audio.json","owner.json"].includes(file)))throw new Error("Unexpected speaker files; removal refused");
    if(files.includes("owner.json")){const owner=speakerOwner.parse(JSON.parse((await readBoundedFile(path.join(current.directory,"owner.json"),16384)).toString("utf8")));if(owner.analysisId!==analysisId||owner.id!==current.record.id)throw new Error("Speaker owner mismatch");}
    if(await sha256File(current.file)!==expectedSha256)throw new Error("Speaker analysis changed before deletion");if(files.includes("audio.json")){const checkpoint=await this.checkpoint(analysisId);if(checkpoint.audioSha256!==current.record.machine.audioSha256)throw new Error("Speaker checkpoint mismatch");await unlink(path.join(current.directory,"audio.json"));}await unlink(current.file);await unlink(current.audio);if(files.includes("owner.json"))await unlink(path.join(current.directory,"owner.json"));await rmdir(current.directory);return {analysisId,removed:true,sourceModified:false};
  });}
}
