import {it,expect} from "vitest";
import {mkdtemp,realpath,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {QcReports} from "../src/library/qc-reports.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const first="00000000-0000-4000-8000-000000000001",second="00000000-0000-4000-8000-000000000002";
async function fixture(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-qc-reports-"))),file=path.join(root,"source.mp4");await writeFile(file,"source bytes");
 const id=await sha256File(file),directory=path.join(root,"avid-mcp-library");await mkdir(directory);
 await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file,bytes:12,metadata:{},transcript:[]}));
 const report={schema:1,id,range:{start:0,end:4},options:{end:4},streams:{video:0,audio:1},findings:{black:[],freeze:[],silence:[],frameTiming:null,loudness:null},reviewRequired:true,limitations:[],sourceModified:false};
 const reportPath=path.join(directory,`qc-${first}.json`);await writeFile(reportPath,JSON.stringify(report));
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect"});
 return {root,file,id,directory,report,reportPath,config,service:new QcReports(config)};
}
it("discovers and reads reports in a fresh service using inspect-only authority",async()=>{
 const f=await fixture(),page=await f.service.list(f.id);
 expect(page.reports).toHaveLength(1);expect(page.next).toBeNull();
 const read=await new QcReports(f.config).read(f.id,first,page.reports[0]!.sha256);
 expect(read.audioCoverageStatus).toBe("not_recorded");
 expect(read.videoCoverageStatus).toBe("not_recorded");
 expect(read.sourceCurrent).toBe(true);expect(read.report.id).toBe(f.id);
  await expect(f.service.read(f.id,first,"0".repeat(64))).rejects.toThrow("checksum mismatch");
  await writeFile(f.reportPath,JSON.stringify({...f.report,range:{start:0,end:5}}));
  await expect(f.service.read(f.id,first)).rejects.toThrow("range and options disagree");
 await expect(f.service.read(f.id,"../outside")).rejects.toThrow();
});

it("validates stored video coverage and preserves explicit unselected versus legacy status",async()=>{
 const f=await fixture(),videoCoverage={decodedFrames:120,requestedSeconds:4,meaning:"fixture"};
 await writeFile(f.reportPath,JSON.stringify({...f.report,videoCoverage}));expect((await f.service.read(f.id,first)).videoCoverageStatus).toBe("recorded");
 for(const patch of [{videoCoverage:null},{videoCoverage:{...videoCoverage,requestedSeconds:3}},{videoCoverage,streams:{video:null,audio:1}},{videoCoverage:{...videoCoverage,decodedFrames:0}}]){
  await writeFile(f.reportPath,JSON.stringify({...f.report,...patch}));await expect(f.service.read(f.id,first)).rejects.toThrow();
  expect((await f.service.list(f.id)).unreadable).toBe(1);
 }
 await writeFile(f.reportPath,JSON.stringify({...f.report,streams:{video:null,audio:1},videoCoverage:null}));expect((await f.service.read(f.id,first)).videoCoverageStatus).toBe("video_not_selected");
});
it('validates open black detections without upgrading their duration certainty',async()=>{
 const f=await fixture(),tail={start:2,end:null,minimumDurationVerified:false,meaning:'fixture'};
 const save=async(value:unknown)=>writeFile(f.reportPath,JSON.stringify({...f.report,findings:{...f.report.findings,blackOpenAtProcessingEnd:value}}));
 await save(tail);expect((await f.service.read(f.id,first)).report.findings.blackOpenAtProcessingEnd).toEqual(tail);
 for(const value of [{...tail,start:4},{...tail,end:4},{...tail,minimumDurationVerified:true}]){await save(value);await expect(f.service.read(f.id,first)).rejects.toThrow('open black');}
 await writeFile(f.reportPath,JSON.stringify({...f.report,streams:{video:null,audio:1},findings:{blackOpenAtProcessingEnd:tail}}));await expect(f.service.read(f.id,first)).rejects.toThrow('open black');
});
it('validates new unknown freeze endpoints while preserving historical reports',async()=>{
 const f=await fixture(),open={start:0,end:null,openAtProcessingEnd:true};
 for(const interval of [open,{start:0,end:4,openAtRangeEnd:true}]){await writeFile(f.reportPath,JSON.stringify({...f.report,findings:{freeze:[interval]}}));expect((await f.service.read(f.id,first)).report.findings.freeze).toEqual([interval]);}
 for(const interval of [{...open,end:4},{...open,start:4},{...open,openAtProcessingEnd:false}]){await writeFile(f.reportPath,JSON.stringify({...f.report,findings:{freeze:[interval]}}));await expect(f.service.read(f.id,first)).rejects.toThrow('open interval');}
});
it.each(['black','freeze','silence'])('rejects malformed or out-of-scope stored %s intervals',async kind=>{
 const f=await fixture();
 for(const interval of [{start:-1,end:1},{start:2,end:1},{start:1,end:1},{start:0,end:5},{start:'0',end:1},null]){
  await writeFile(f.reportPath,JSON.stringify({...f.report,findings:{[kind]:[interval]}}));await expect(f.service.read(f.id,first)).rejects.toThrow('closed interval');
 }
 for(const collection of [{start:0,end:1},Array.from({length:10001},()=>({start:0,end:1}))]){
  await writeFile(f.reportPath,JSON.stringify({...f.report,findings:{[kind]:collection}}));await expect(f.service.read(f.id,first)).rejects.toThrow('event collection');
 }
 await writeFile(f.reportPath,JSON.stringify({...f.report,streams:kind==='silence'?{video:0,audio:null}:{video:null,audio:1},findings:{[kind]:[{start:0,end:1}]}}));await expect(f.service.read(f.id,first)).rejects.toThrow('closed interval');
 await writeFile(f.reportPath,JSON.stringify({...f.report,findings:{[kind]:[{start:0,end:4}]}}));expect((await f.service.read(f.id,first)).report.findings[kind]).toEqual([{start:0,end:4}]);
});
it("validates stored sample amount arithmetic and stream selection without inventing legacy coverage",async()=>{
 const f=await fixture(),coverage={samplesPerChannel:48000,sampleRate:48000,decodedSeconds:1,requestedSeconds:4,amountMatchesRequestedDuration:false,meaning:"fixture"};
 const current={...f.report,findings:{...f.report.findings,audioSamplesPerChannel:48000},audioCoverage:coverage};
 await writeFile(f.reportPath,JSON.stringify(current));expect((await f.service.read(f.id,first)).audioCoverageStatus).toBe("recorded");
 for(const bad of [{...current,audioCoverage:{...coverage,decodedSeconds:4}},{...current,audioCoverage:{...coverage,amountMatchesRequestedDuration:true}},{...current,audioCoverage:null},{...current,streams:{video:0,audio:null}},{...current,findings:f.report.findings}]){
  await writeFile(f.reportPath,JSON.stringify(bad));await expect(f.service.read(f.id,first)).rejects.toThrow("coverage is inconsistent");
 }
 await writeFile(f.reportPath,JSON.stringify({...f.report,streams:{video:0,audio:null},audioCoverage:null}));expect((await f.service.read(f.id,first)).audioCoverageStatus).toBe("audio_not_selected");
});
it("preserves audio timing on read and rejects inconsistent stream or sample accounting",async()=>{
 const f=await fixture(),audioTiming={frames:2,sampleRate:48000,samples:48000,firstPts:0,endPts:48010,gapSamples:10,overlapSamples:0,discontinuities:1};
 const current={...f.report,findings:{...f.report.findings,audioSamplesPerChannel:48000},audioCoverage:{samplesPerChannel:48000,sampleRate:48000,decodedSeconds:1,requestedSeconds:4,amountMatchesRequestedDuration:false,meaning:'fixture'},audioTiming};
 await writeFile(f.reportPath,JSON.stringify(current));expect((await f.service.read(f.id,first)).report.audioTiming).toEqual(audioTiming);
 for(const change of [{audioTiming:null},{audioTiming:{...audioTiming,sampleRate:44100}},{audioTiming:{...audioTiming,endPts:48000}},{streams:{video:0,audio:null}}]){
  await writeFile(f.reportPath,JSON.stringify({...current,...change}));await expect(f.service.read(f.id,first)).rejects.toThrow();
 }
});
it("rejects contradictory selected streams in direct reads and discovery",async()=>{
 const f=await fixture();
 for(const change of [
  {streams:{video:null,audio:null}},
  {streams:{video:1,audio:1}},
  {options:{end:4,videoStream:null}},
  {options:{end:4,audioStream:2}},
 ]){
  await writeFile(f.reportPath,JSON.stringify({...f.report,...change}));
  await expect(f.service.read(f.id,first)).rejects.toThrow("stream selection is inconsistent");
  const page=await f.service.list(f.id);expect(page.reports).toEqual([]);expect(page.unreadable).toBe(1);
 }
 await writeFile(f.reportPath,JSON.stringify({...f.report,options:{end:4,videoStream:0,audioStream:1}}));
 expect((await f.service.read(f.id,first)).report.streams).toEqual({video:0,audio:1});
});
it("keeps media identities isolated and paginates unreadable reports without hiding later pages",async()=>{
 const f=await fixture();await writeFile(f.reportPath,JSON.stringify({...f.report,id:"0".repeat(64)}));
 await writeFile(path.join(f.directory,`qc-${"-".repeat(36)}.json`),JSON.stringify(f.report));
 await expect(f.service.read(f.id,first)).rejects.toThrow("another media");
 await writeFile(path.join(f.directory,`qc-${second}.json`),JSON.stringify(f.report));
 const page=await f.service.list(f.id,undefined,1);expect(page.reports).toEqual([]);expect(page.next).toBe(first);
 expect((await f.service.list(f.id,page.next!,1)).reports[0]!.revision).toBe(second);
 await writeFile(f.reportPath,"broken JSON");expect((await f.service.list(f.id,undefined,1)).unreadable).toBe(1);
 await expect(f.service.list(f.id,undefined,51)).rejects.toThrow("page size");
});
it("rejects oversized reports and changed or unauthorized sources",async()=>{
 const f=await fixture();await writeFile(f.reportPath," ".repeat(4*1024*1024+1));
 await expect(f.service.read(f.id,first)).rejects.toThrow(/limit/);
 await writeFile(f.file,"changed");await expect(f.service.list(f.id)).rejects.toThrow(/[Ss]ource changed/);
 const elsewhere=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-qc-scope-")));
 const denied=new QcReports({...f.config,allowedRoots:[elsewhere]});await expect(denied.read(f.id,first)).rejects.toThrow();
});
