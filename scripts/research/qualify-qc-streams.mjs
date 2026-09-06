import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-streams-${randomUUID()}`);await mkdir(root);
const file=path.join(root,'four-streams.mkv');
const generated=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-f','lavfi','-i','color=black:s=160x90:r=30:d=4','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=4','-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=4','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=4','-map','0:v','-map','1:v','-map','2:a','-map','3:a','-c:v','ffv1','-c:a','pcm_s16le',file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(generated.exitCode,0,generated.stderr);
const id=await sha256File(file),client=new Client({name:'qc-stream-selection-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 await call('avid_index_media',{files:[file]});
 const first=await call('avid_media_qc',{id,options:{end:4,freezeSeconds:0.5}});
 assert.deepEqual(first.streams,{video:0,audio:2});assert.ok(first.findings.freeze.length);assert.ok(first.findings.silence.length);
 assert.equal(first.videoCoverage.decodedFrames,120);
 assert.equal(first.audioCoverage.samplesPerChannel,192000);assert.equal(first.audioCoverage.amountMatchesRequestedDuration,true);
 const alternate=await call('avid_media_qc',{id,options:{end:4,videoStream:1,audioStream:3,freezeSeconds:0.5}});
 assert.deepEqual(alternate.streams,{video:1,audio:3});assert.equal(alternate.findings.freeze.length,0);assert.equal(alternate.findings.silence.length,0);assert.equal(alternate.findings.black.length,0);assert.ok(Number.isFinite(alternate.findings.loudness.integratedLufs));
 assert.equal(alternate.videoCoverage.decodedFrames,120);
 const audioOnly=await call('avid_media_qc',{id,options:{end:4,videoStream:null,audioStream:3}});assert.deepEqual(audioOnly.streams,{video:null,audio:3});assert.equal(audioOnly.findings.frameTiming,null);
 assert.equal(audioOnly.videoCoverage,null);
 const videoOnly=await call('avid_media_qc',{id,options:{end:4,videoStream:1,audioStream:null}});
 assert.equal(videoOnly.audioTiming,null);assert.equal(videoOnly.audioCoverage,null);assert.equal(videoOnly.videoCoverage.decodedFrames,120);
 for(const report of [first,alternate,audioOnly]){
  assert.equal(report.audioTiming.samples,report.audioCoverage.samplesPerChannel);
  const saved=await call('avid_read_qc_report',{id,revision:report.revision});assert.deepEqual(saved.report.audioTiming,report.audioTiming);
 }
 const delayedFile=path.join(root,'delayed-streams.mkv');
 const delayedGeneration=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=4','-filter_complex','[1:a]asetpts=PTS+0.25/TB[delayed]','-map','0:a','-map','[delayed]','-c:a','pcm_s16le',delayedFile],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(delayedGeneration.exitCode,0,delayedGeneration.stderr);
 const delayedId=await sha256File(delayedFile);await call('avid_index_media',{files:[delayedFile]});
 const delayedReports=[];
 for(const audioStream of [0,1])for(const start of [0,1.25]){
  const report=await call('avid_media_qc',{id:delayedId,options:{start,end:4,videoStream:null,audioStream}});
  assert.equal(report.streams.audio,audioStream);assert.equal(report.audioTiming.samples,report.audioCoverage.samplesPerChannel);
  const saved=await call('avid_read_qc_report',{id:delayedId,revision:report.revision});assert.deepEqual(saved.report.audioTiming,report.audioTiming);
  delayedReports.push(report);
 }
 assert.deepEqual(delayedReports.map(r=>[r.audioTiming.samples,r.audioTiming.firstPts,r.audioTiming.endPts,r.audioTiming.gapSamples,r.audioTiming.overlapSamples,r.audioTiming.discontinuities]),[
  [192000,0,192000,0,0,0],[132000,0,132000,0,0,0],[180000,12000,192000,0,0,0],[132000,0,132000,0,0,0],
 ]);
 const reportFiles=async()=>(await readdir(path.join(root,'avid-mcp-library'))).filter(name=>/^qc-/.test(name)).sort();
 const beforeEmpty=await reportFiles();
 const empty=await client.callTool({name:'avid_media_qc',arguments:{id:delayedId,options:{end:0.1,videoStream:null,audioStream:1}}});assert.equal(empty.isError,true);
 assert.deepEqual(await reportFiles(),beforeEmpty,'Empty selected audio must not publish a report');
 assert.equal(await sha256File(delayedFile),delayedId);
 const invalid=await client.callTool({name:'avid_media_qc',arguments:{id,options:{end:4,audioStream:1}}});assert.equal(invalid.isError,true);
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({first,alternate,audioOnly,videoOnly,delayedReports,delayedId,empty,emptyRangeDidNotPublish:true,wrongTypeRejected:true,sourceUnchanged:true},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json'),delayed:delayedReports.map(r=>({range:r.range,stream:r.streams.audio,timing:r.audioTiming}))}));
}finally{await client.close();}
