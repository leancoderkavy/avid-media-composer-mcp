import {mkdtemp,writeFile,readFile,unlink,mkdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import os from "node:os";
import {it,expect,beforeEach,vi} from "vitest";
import {SpeakerAnalysis,diarizationOutput} from "../src/library/diarization.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {TranscriptRevisions} from "../src/library/transcripts.js";
const mocks=vi.hoisted(()=>({run:vi.fn(),runtime:vi.fn(),stopped:vi.fn()}));
vi.mock("../src/process.js",()=>({runProcess:mocks.run}));
vi.mock("../src/library/diarization-runtime.js",()=>({DIARIZATION_WORKER:"worker.py",diarizationRuntimeStatus:mocks.runtime}));
vi.mock("../src/library/speaker-cleanup.js",async(importOriginal)=>({...await importOriginal<typeof import("../src/library/speaker-cleanup.js")>(),assertSpeakerStopped:mocks.stopped}));
const versions={"sherpa-onnx":"1.13.7","sherpa-onnx-core":"1.13.7",numpy:"2.2.6"};
beforeEach(()=>{
  mocks.stopped.mockReset();mocks.stopped.mockResolvedValue(undefined);
  mocks.run.mockReset();mocks.runtime.mockReset();mocks.runtime.mockResolvedValue({unchanged:true,treeSha256:"a".repeat(64),receipt:{workerSha256:"b".repeat(64)},executable:"python",directory:"runtime"});
  mocks.run.mockImplementation(async(_executable:string,args:string[])=>{
    if(args.includes("-f")){await writeFile(args.at(-1)!,Buffer.alloc(Number(args[args.lastIndexOf("-t")+1])*16000*4));return {exitCode:0};}
    const file=args[args.indexOf("--audio")+1]!,bytes=await readFile(file);
    return {exitCode:0,stdout:JSON.stringify({schema:1,recipe:1,versions,audioSha256:await sha256File(file),duration:bytes.length/64000,options:{speakers:Number(args[args.indexOf("--speakers")+1]),threshold:Number(args[args.indexOf("--threshold")+1])},spans:[{start:0.1,end:0.8,speaker:"speaker-1"},{start:0.5,end:1.4,speaker:"speaker-2"}],speakerCount:2,reviewRequired:true,identitiesInferred:false,accuracyVerified:false})};
  });
});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-speakers-")),source=path.join(root,"source.mp4");await writeFile(source,"fixture");const id=await sha256File(source),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,export,project-write"}),base=await new MediaLibrary(config).directory();await writeFile(path.join(base,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:90}},transcript:[]}));return {source,id,config,base,speakers:new SpeakerAnalysis(config)};}
it("persists source-time overlapping spans, paginates after reconnect and deletes only derived files",async()=>{
  const f=await fixture(),result=await f.speakers.generate(f.id,10,12,{speakers:2});expect(result).toMatchObject({speakerCount:2,audioRecipe:3,spans:[{spanId:"span-1",speaker:"speaker-1",start:10.1,end:10.8},{spanId:"span-2",speaker:"speaker-2",start:10.5,end:11.4}]});
  const reopened=new SpeakerAnalysis(f.config),first=await reopened.read(result.analysisId,0,1);expect(first.nextOffset).toBe(1);expect(first.spans).toHaveLength(1);expect((await reopened.read(result.analysisId,1,1)).spans[0]?.spanId).toBe("span-2");expect((await reopened.list(f.id)).analyses).toHaveLength(1);
  await expect(reopened.remove(result.analysisId,"0".repeat(64))).rejects.toThrow("changed");await reopened.remove(result.analysisId,result.sha256);expect((await reopened.list(f.id)).analyses).toEqual([]);expect(await sha256File(f.source)).toBe(f.id);
});
it("rejects damaged audio and unauthorized sources and reports unavailable saved analyses",async()=>{
  const f=await fixture(),result=await f.speakers.generate(f.id,0,2);await expect(new SpeakerAnalysis({...f.config,allowedRoots:[]}).read(result.analysisId)).rejects.toThrow();
  await writeFile(path.join(f.base,`speakers-${result.analysisId}`,"speech.f32"),"changed");await expect(f.speakers.read(result.analysisId)).rejects.toThrow("audio changed");expect((await f.speakers.list(f.id)).analyses[0]).toMatchObject({state:"unavailable"});
  await writeFile(f.source,"changed");await expect(f.speakers.read(result.analysisId)).rejects.toThrow("source changed");
});
it("keeps valid results discoverable beside corrupt, mismatched and unpublished records with bounded diagnostics",async()=>{
  const f=await fixture(),valid=await f.speakers.generate(f.id,0,2),record=await readFile(path.join(f.base,`speakers-${valid.analysisId}`,"analysis.json"),"utf8"),ids:string[]=[];
  for(let index=0;index<22;index++){
    const id=randomUUID(),directory=path.join(f.base,`speakers-${id}`);ids.push(id);await mkdir(directory);await writeFile(path.join(directory,"analysis.json"),index===0?record:"{broken private content");
  }
  const unpublished=path.join(f.base,`speakers-${randomUUID()}`);await mkdir(unpublished);await writeFile(path.join(unpublished,"speech.f32"),"partial");await mkdir(path.join(f.base,"speakers-not-a-uuid"));
  const result=await new SpeakerAnalysis({...f.config,modelDirectory:undefined}).list(f.id);
  expect(result.analyses.map(value=>value.analysisId)).toEqual([valid.analysisId]);
  expect(result.discovery).toMatchObject({unpublishedCount:1,unclassifiedCount:22,unclassifiedAnalysisIds:ids.sort().slice(0,20),diagnosticsTruncated:true});
  expect(JSON.stringify(result)).not.toContain("private content");expect(await readFile(path.join(unpublished,"speech.f32"),"utf8")).toBe("partial");
  const after=ids[10]!,page=await f.speakers.list(f.id,after);expect(page.discovery.unclassifiedCount).toBe(ids.filter(id=>id>after).length);expect(page.discovery.unclassifiedAnalysisIds).toEqual(ids.filter(id=>id>after));
  expect(await sha256File(f.source)).toBe(f.id);
});
it("refuses unknown files, missing capabilities and changed runtime before inference",async()=>{
  const f=await fixture();await expect(new SpeakerAnalysis({...f.config,capabilities:new Set(["inspect"])}).generate(f.id,0,2)).rejects.toThrow();expect(mocks.run).not.toHaveBeenCalled();
  mocks.runtime.mockResolvedValueOnce({unchanged:false});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow("runtime changed");expect(mocks.run).not.toHaveBeenCalled();
  const result=await f.speakers.generate(f.id,0,2),extra=path.join(f.base,`speakers-${result.analysisId}`,"notes.txt");await writeFile(extra,"preserve");await expect(f.speakers.remove(result.analysisId,result.sha256)).rejects.toThrow("Unexpected");expect(await readFile(extra,"utf8")).toBe("preserve");await unlink(extra);
});
it("validates worker labels, ordering, counts, ranges and exact input provenance",async()=>{
  const f=await fixture(),result=await f.speakers.generate(f.id,0,2),record=JSON.parse(await readFile(path.join(f.base,`speakers-${result.analysisId}`,"analysis.json"),"utf8"));
  for(const machine of [{...record.machine,speakerCount:3},{...record.machine,spans:[...record.machine.spans].reverse()},{...record.machine,spans:[{start:0,end:3,speaker:"speaker-1"}]},{...record.machine,spans:[{start:0,end:1,speaker:"speaker-99"}]}])expect(()=>diarizationOutput.parse(machine)).toThrow();
  mocks.run.mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow("extraction failed");expect((await f.speakers.list(f.id)).analyses).toHaveLength(1);
  const normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:0,stdout:JSON.stringify({...record.machine,audioSha256:"0".repeat(64)})});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow("input mismatch");expect((await f.speakers.list(f.id)).analyses).toHaveLength(1);
  await expect(f.speakers.generate(f.id,0,91)).rejects.toThrow("range");await expect(f.speakers.generate(f.id,0,2,{speakers:0})).rejects.toThrow();
});
it("aligns explicit transcript revisions without changing text or speaker fields and refuses stale references",async()=>{
  const f=await fixture(),result=await f.speakers.generate(f.id,0,2),library=new MediaLibrary(f.config);
  const transcript=await library.importTranscript(f.id,[{start:0,end:0.1,text:"gap"},{start:0.2,end:0.4,text:"single",speaker:"Original label"},{start:0.6,end:1,text:"overlap"},{start:1.6,end:2.2,text:"partly outside"},{start:10,end:11,text:"outside"}]);
  const transcriptHash=await sha256File(transcript.path),before=await readFile(transcript.path,"utf8"),first=await f.speakers.align(result.analysisId,result.sha256,transcript.revision,transcriptHash,-1,2);
  expect(first).toMatchObject({assignmentApplied:false,nextAfter:1});expect(first.segments[0]).toMatchObject({index:0,status:"no_speech_overlap"});expect(first.segments[1]).toMatchObject({index:1,status:"single_candidate",segment:{text:"single",speaker:"Original label"}});
  const next=await f.speakers.align(result.analysisId,result.sha256,transcript.revision,transcriptHash,1,2);expect(next.nextAfter).toBeNull();expect(next.segments.map(segment=>segment.index)).toEqual([2,3]);expect(next.segments[0]?.status).toBe("overlapping_candidates");expect(next.segments[1]?.outsideAnalysisSeconds).toBeCloseTo(0.2);
  expect(await readFile(transcript.path,"utf8")).toBe(before);await expect(f.speakers.align(result.analysisId,"0".repeat(64),transcript.revision,transcriptHash)).rejects.toThrow("Speaker analysis changed");await expect(f.speakers.align(result.analysisId,result.sha256,transcript.revision,"0".repeat(64))).rejects.toThrow("Transcript changed");
});
it("assigns caller-selected speakers in a new transcript with persistent provenance and unchanged timing/text",async()=>{
  const f=await fixture(),analysis=await f.speakers.generate(f.id,0,2),library=new MediaLibrary(f.config),parent=await library.importTranscript(f.id,[{start:0.2,end:0.4,text:"first",speaker:"old"},{start:0.6,end:1,text:"ambiguous"},{start:1.8,end:2.2,text:"outside and silent"}]),parentHash=await sha256File(parent.path),before=await readFile(parent.path,"utf8");
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,parentHash,[{index:1,speaker:"speaker-1"}])).rejects.toThrow("allowAmbiguous");
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,parentHash,[{index:2,speaker:"speaker-1",allowPartialRange:true}])).rejects.toThrow("does not overlap");
  const result=await f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,parentHash,[{index:0,speaker:"speaker-1",displayName:"Reviewer A"},{index:1,speaker:"speaker-2",displayName:"Reviewer B",allowAmbiguous:true}]);
  expect(result.revision).not.toBe(parent.revision);expect(result).toMatchObject({previousRevisionRetained:true,sourceModified:false,parentRevision:parent.revision,speakerAssignment:{analysisId:analysis.analysisId,analysisSha256:analysis.sha256,transcriptSha256:parentHash,identityVerified:false}});
  const saved=JSON.parse(await readFile(result.path,"utf8")),original=JSON.parse(before);expect(saved.segments.map(({speaker,...segment}:any)=>segment)).toEqual(original.segments.map(({speaker,...segment}:any)=>segment));expect(saved.segments.map((segment:any)=>segment.speaker)).toEqual(["Reviewer A","Reviewer B",undefined]);expect(saved.speakerAssignment).toEqual(result.speakerAssignment);expect(await readFile(parent.path,"utf8")).toBe(before);expect(await sha256File(f.source)).toBe(f.id);expect((await f.speakers.read(analysis.analysisId)).sha256).toBe(analysis.sha256);
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,"0".repeat(64),[{index:0,speaker:"speaker-1"}])).rejects.toThrow("Transcript changed");
  const revisions=new TranscriptRevisions(f.config),page=await revisions.speakerAssignmentPage(f.id,result.revision,result.sha256,0,1);expect(page).toMatchObject({totalAssignments:2,nextOffset:1,speakerAssignment:{analysisId:analysis.analysisId}});expect(page.assignments[0]?.index).toBe(0);expect((await revisions.speakerAssignmentPage(f.id,result.revision,result.sha256,1,1)).assignments[0]?.index).toBe(1);expect((await revisions.speakerAssignmentPage(f.id,parent.revision,parentHash)).speakerAssignment).toBeNull();await expect(revisions.speakerAssignmentPage(f.id,result.revision,"0".repeat(64))).rejects.toThrow("Transcript changed");
});
it("requires explicit partial-range choices and rejects duplicates, name conflicts and missing write access",async()=>{
  const f=await fixture(),analysis=await f.speakers.generate(f.id,10,12),parent=await new MediaLibrary(f.config).importTranscript(f.id,[{start:9.9,end:10.4,text:"partial"},{start:10.2,end:10.4,text:"single"}]),hash=await sha256File(parent.path);
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,hash,[{index:0,speaker:"speaker-1"}])).rejects.toThrow("allowPartialRange");
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,hash,[{index:1,speaker:"speaker-1"},{index:1,speaker:"speaker-1"}])).rejects.toThrow("Duplicate");
  await expect(f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,hash,[{index:0,speaker:"speaker-1",displayName:"A",allowPartialRange:true},{index:1,speaker:"speaker-1",displayName:"B"}])).rejects.toThrow("Conflicting");
  await expect(new SpeakerAnalysis({...f.config,capabilities:new Set(["inspect"])}).assign(analysis.analysisId,analysis.sha256,parent.revision,hash,[{index:1,speaker:"speaker-1"}])).rejects.toThrow();
  expect(await f.speakers.assign(analysis.analysisId,analysis.sha256,parent.revision,hash,[{index:0,speaker:"speaker-1",allowPartialRange:true}])).toMatchObject({parentRevision:parent.revision});
});
it("forks boundary and cluster corrections, preserves machine output and aligns corrected labels without models",async()=>{
  const f=await fixture(),original=await f.speakers.generate(f.id,10,12),review=new SpeakerAnalysis({...f.config,modelDirectory:undefined});
  const child=await review.correct(original.analysisId,original.sha256,[{action:"replace",spanId:"span-1",start:10.1,end:10.6,speaker:"speaker-3"},{action:"remove",spanId:"span-2"},{action:"add",start:10.8,end:11.1,speaker:"speaker-4"}]);
  expect(child).toMatchObject({schema:2,edited:true,parentAnalysisId:original.analysisId,parentSha256:original.sha256,previousAnalysisRetained:true,machineSpeakerCount:2,speakerCount:2});expect(child.spans.map(span=>span.speaker)).toEqual(["speaker-3","speaker-4"]);expect((await review.read(child.analysisId,0,100,"machine")).spans).toEqual(original.spans);expect((await review.read(original.analysisId)).sha256).toBe(original.sha256);
  const merged=await review.correct(child.analysisId,child.sha256,[{action:"merge",from:"speaker-4",into:"speaker-3"}]);expect(merged.speakerCount).toBe(1);expect(merged.spans.map(span=>span.spanId)).toEqual(child.spans.map(span=>span.spanId));
  const transcript=await new MediaLibrary(f.config).importTranscript(f.id,[{start:10.2,end:10.4,text:"reviewed range"}]),hash=await sha256File(transcript.path);expect((await review.align(merged.analysisId,merged.sha256,transcript.revision,hash)).segments[0]?.candidates[0]?.speaker).toBe("speaker-3");expect((await review.assign(merged.analysisId,merged.sha256,transcript.revision,hash,[{index:0,speaker:"speaker-3"}])).decisions[0]?.assignedSpeaker).toBe("speaker-3");
  await review.remove(child.analysisId,child.sha256);expect((await review.read(merged.analysisId)).sha256).toBe(merged.sha256);expect((await review.read(merged.analysisId,0,100,"machine")).spans).toEqual(original.spans);expect(await sha256File(f.source)).toBe(f.id);
});
it("rejects stale, out-of-range, missing and malformed speaker corrections",async()=>{
  const f=await fixture(),original=await f.speakers.generate(f.id,10,12);
  await expect(f.speakers.correct(original.analysisId,"0".repeat(64),[{action:"remove",spanId:"span-1"}])).rejects.toThrow("changed");
  await expect(f.speakers.correct(original.analysisId,original.sha256,[{action:"replace",spanId:"span-1",start:9,end:11,speaker:"speaker-1"}])).rejects.toThrow("source range");
  await expect(f.speakers.correct(original.analysisId,original.sha256,[{action:"remove",spanId:"span-99"}])).rejects.toThrow("missing");
  await expect(f.speakers.correct(original.analysisId,original.sha256,[{action:"merge",from:"speaker-99",into:"speaker-1"}])).rejects.toThrow("existing");
  await expect(new SpeakerAnalysis({...f.config,capabilities:new Set(["inspect"])}).correct(original.analysisId,original.sha256,[{action:"remove",spanId:"span-1"}])).rejects.toThrow();
  const child=await f.speakers.correct(original.analysisId,original.sha256,[{action:"merge",from:"speaker-2",into:"speaker-1"}]),file=path.join(f.base,`speakers-${child.analysisId}`,"analysis.json"),record=JSON.parse(await readFile(file,"utf8"));record.review.spans.push(record.review.spans[0]);await writeFile(file,JSON.stringify(record));await expect(f.speakers.read(child.analysisId)).rejects.toThrow("reviewed speaker intervals");
});
it("resumes verified extracted audio after inference failure without re-extracting and retains parent provenance",async()=>{
  const f=await fixture(),normal=mocks.run.getMockImplementation()!;
  mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,10,12,{speakers:2})).rejects.toThrow("incomplete files retained");
  const discovery=await f.speakers.list(f.id),parentId=discovery.discovery.unpublishedAnalysisIds[0]!;
  const reopened=new SpeakerAnalysis(f.config),checkpoint=await reopened.checkpoint(parentId),parentFile=path.join(f.base,`speakers-${parentId}`,"audio.json"),before=await readFile(parentFile,"utf8");
  expect(checkpoint.published).toBe(false);mocks.run.mockClear();const resumed=await reopened.resume(parentId,checkpoint.sha256);
  expect(mocks.run).toHaveBeenCalledTimes(1);expect(mocks.run.mock.calls[0]![1]).toContain("--audio");expect(resumed.analysisId).not.toBe(parentId);expect(resumed.recovery).toEqual({parentAnalysisId:parentId,parentCheckpointSha256:checkpoint.sha256,reusedAudio:true});
  expect(await readFile(parentFile,"utf8")).toBe(before);expect(await reopened.read(resumed.analysisId)).toMatchObject({recovery:resumed.recovery});
  const completed=await reopened.checkpoint(resumed.analysisId);await expect(reopened.resume(resumed.analysisId,completed.sha256)).rejects.toThrow("already published");await reopened.remove(resumed.analysisId,resumed.sha256);expect(await reopened.checkpoint(parentId)).toEqual(checkpoint);
});
it("rejects stale checkpoints, changed runtime/audio/source and insufficient resume access",async()=>{
  const f=await fixture(),normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow();
  const parentId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!,checkpoint=await f.speakers.checkpoint(parentId);mocks.run.mockClear();
  await expect(f.speakers.resume(parentId,"0".repeat(64))).rejects.toThrow("checkpoint changed");
  await expect(new SpeakerAnalysis({...f.config,capabilities:new Set(["inspect"])}).resume(parentId,checkpoint.sha256)).rejects.toThrow();
  mocks.runtime.mockResolvedValueOnce({unchanged:true,treeSha256:"c".repeat(64),receipt:{workerSha256:"b".repeat(64)}});await expect(f.speakers.resume(parentId,checkpoint.sha256)).rejects.toThrow("runtime changed");expect(mocks.run).not.toHaveBeenCalled();
  const audio=path.join(f.base,`speakers-${parentId}`,"speech.f32"),original=await readFile(audio);await writeFile(audio,"corrupt");await expect(f.speakers.resume(parentId,checkpoint.sha256)).rejects.toThrow("audio changed");await writeFile(audio,original);
  await writeFile(f.source,"changed");await expect(f.speakers.resume(parentId,checkpoint.sha256)).rejects.toThrow("source changed");expect(mocks.run).not.toHaveBeenCalled();
});
it("requires explicit saved options and refuses nonfinite checkpoint audio even when its checksum matches",async()=>{
  const f=await fixture(),normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow();
  const analysisId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!,directory=path.join(f.base,`speakers-${analysisId}`),file=path.join(directory,"audio.json"),original=JSON.parse(await readFile(file,"utf8"));mocks.run.mockClear();
  for(const key of ["speakers","threshold"]){const changed=structuredClone(original);delete changed.options[key];await writeFile(file,JSON.stringify(changed));await expect(f.speakers.checkpoint(analysisId)).rejects.toThrow();}
  const audio=path.join(directory,"speech.f32"),pcm=await readFile(audio);for(const value of [NaN,Infinity,-Infinity]){pcm.writeFloatLE(value,0);await writeFile(audio,pcm);await writeFile(file,JSON.stringify({...original,audioSha256:await sha256File(audio)}));await expect(f.speakers.checkpoint(analysisId)).rejects.toThrow("Nonfinite");await expect(f.speakers.resume(analysisId,await sha256File(file))).rejects.toThrow("Nonfinite");}
  expect(mocks.run).not.toHaveBeenCalled();expect(await sha256File(f.source)).toBe(f.id);
});
it("refuses invalid extracted samples before publishing a checkpoint or invoking inference",async()=>{
  const f=await fixture();mocks.run.mockImplementationOnce(async(_exe:string,args:string[])=>{const pcm=Buffer.alloc(64000);pcm.writeFloatLE(Infinity,4);await writeFile(args.at(-1)!,pcm);return {exitCode:0};});
  await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow("Nonfinite");expect(mocks.run).toHaveBeenCalledTimes(1);
  const analysisId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!;await expect(readFile(path.join(f.base,`speakers-${analysisId}`,"audio.json"))).rejects.toMatchObject({code:"ENOENT"});
});

it("cleans only a verified stopped incomplete run and preserves source",async()=>{
 const f=await fixture(),normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow();
 const analysisId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!,checkpoint=await f.speakers.checkpoint(analysisId);
 expect(await f.speakers.cleanup(analysisId,checkpoint.sha256)).toMatchObject({removed:true,sourceModified:false});expect(mocks.stopped).toHaveBeenCalledTimes(3);await expect(f.speakers.checkpoint(analysisId)).rejects.toThrow();expect(await sha256File(f.source)).toBe(f.id);
});
it("refuses active, changed, unexpected and published cleanup candidates",async()=>{
 const f=await fixture(),normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow();
 const analysisId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!,checkpoint=await f.speakers.checkpoint(analysisId),directory=path.join(f.base,`speakers-${analysisId}`);
 await expect(f.speakers.cleanup(analysisId,"0".repeat(64))).rejects.toThrow("changed");mocks.stopped.mockRejectedValueOnce(new Error("owner active"));await expect(f.speakers.cleanup(analysisId,checkpoint.sha256)).rejects.toThrow("owner active");expect(await f.speakers.checkpoint(analysisId)).toEqual(checkpoint);
 const note=path.join(directory,"notes.txt");await writeFile(note,"retain");await expect(f.speakers.cleanup(analysisId,checkpoint.sha256)).rejects.toThrow("Unexpected");expect(await readFile(note,"utf8")).toBe("retain");await unlink(note);
 await writeFile(path.join(directory,"owner.json"),"changed");await expect(f.speakers.cleanup(analysisId,checkpoint.sha256)).rejects.toThrow("owner changed");
 const completed=await f.speakers.generate(f.id,0,2),published=await f.speakers.checkpoint(completed.analysisId);await expect(f.speakers.cleanup(completed.analysisId,published.sha256)).rejects.toThrow("published");
});
it("retains quarantined files when process verification fails after the move",async()=>{
 const f=await fixture(),normal=mocks.run.getMockImplementation()!;mocks.run.mockImplementationOnce(normal).mockResolvedValueOnce({exitCode:1});await expect(f.speakers.generate(f.id,0,2)).rejects.toThrow();const analysisId=(await f.speakers.list(f.id)).discovery.unpublishedAnalysisIds[0]!,checkpoint=await f.speakers.checkpoint(analysisId);
 mocks.stopped.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("process state changed"));await expect(f.speakers.cleanup(analysisId,checkpoint.sha256)).rejects.toThrow("retained files may be at");const {readdir}=await import("node:fs/promises"),quarantine=(await readdir(f.base)).find(name=>name.startsWith("speaker-cleanup-"))!;expect((await readdir(path.join(f.base,quarantine))).sort()).toEqual(["audio.json","owner.json","speech.f32"]);expect(await sha256File(f.source)).toBe(f.id);
});
