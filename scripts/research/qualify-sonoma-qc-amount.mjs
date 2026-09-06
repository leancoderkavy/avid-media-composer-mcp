import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const sources=[
 {name:'original',file:'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sha256:'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',samples:1443456},
 {name:'prepared',file:path.resolve('.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/avid-mcp-library/source-clock-ca88aee1-c41b-43c9-8d08-7e10fc4fb6b7/prepared.mov'),sha256:'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb',samples:1440000},
];
const root=path.resolve('.avid-mcp-analysis',`sonoma-qc-amount-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'sonoma-qc-audio-amount-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:sources.map(s=>path.dirname(s.file)).join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const results=[];
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 for(const source of sources){
  assert.equal(await sha256File(source.file),source.sha256);
  await call('avid_index_media',{files:[source.file]});
  const report=await call('avid_media_qc',{id:source.sha256,options:{start:60,end:90}});
  const frameProbe=await runProcess('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time:format=start_time','-of','json',source.file],{timeoutMs:120000,maxOutputBytes:8*1024*1024});assert.equal(frameProbe.exitCode,0,frameProbe.stderr);
  const probe=JSON.parse(frameProbe.stdout),origin=Number(probe.format.start_time);assert.ok(Number.isFinite(origin));
  const videoFrames=probe.frames.filter(frame=>{const time=Number(frame.best_effort_timestamp_time)-origin;return time>=60&&time<90;}).length;
  assert.ok(videoFrames>0);assert.equal(report.videoCoverage.decodedFrames,videoFrames);
  assert.equal(report.streamDetails.audio.sample_rate,'48000');assert.equal(report.streamDetails.audio.channels,2);
  const pcm=path.join(root,`${source.name}.s16le`);
  const decoded=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-i',source.file,'-map','0:a:0','-vn','-af','atrim=start=60:end=90','-ar','48000','-ac','2','-c:a','pcm_s16le','-f','s16le',pcm],{timeoutMs:120000,maxOutputBytes:1048576});
  assert.equal(decoded.exitCode,0,decoded.stderr);
  const bytes=(await stat(pcm)).size;assert.equal(bytes%4,0);
  const samplesPerChannel=bytes/4;
  assert.equal(samplesPerChannel,source.samples);assert.equal(report.audioCoverage.samplesPerChannel,samplesPerChannel);
  assert.equal(report.audioCoverage.amountMatchesRequestedDuration,samplesPerChannel===1440000);
  const audioProbe=await runProcess('ffprobe',['-v','error','-select_streams','a:0','-show_frames','-show_entries','frame=best_effort_timestamp,nb_samples:stream=time_base','-of','json',source.file],{timeoutMs:120000,maxOutputBytes:8*1024*1024});assert.equal(audioProbe.exitCode,0,audioProbe.stderr);
  const audioData=JSON.parse(audioProbe.stdout);assert.equal(audioData.streams[0].time_base,'1/48000');assert.equal(origin,0);
  const intervals=audioData.frames.map(f=>({start:Math.max(60*48000,f.best_effort_timestamp),end:Math.min(90*48000,f.best_effort_timestamp+f.nb_samples)})).filter(f=>f.end>f.start);
  let gaps=0,overlaps=0,discontinuities=0;
  for(let i=1;i<intervals.length;i++){const gap=intervals[i].start-intervals[i-1].end;if(gap)discontinuities++;if(gap>0)gaps+=gap;else overlaps-=gap;}
  const independentTiming={frames:intervals.length,sampleRate:48000,samples:intervals.reduce((sum,f)=>sum+f.end-f.start,0),firstPts:intervals[0].start-60*48000,endPts:intervals.at(-1).end-60*48000,gapSamples:gaps,overlapSamples:overlaps,discontinuities};
  assert.deepEqual(report.audioTiming,independentTiming);
  const saved=await call('avid_read_qc_report',{id:source.sha256,revision:report.revision});assert.deepEqual(saved.report.audioTiming,independentTiming);
  assert.equal(await sha256File(source.file),source.sha256);
  results.push({source,report,pcm,pcmSha256:await sha256File(pcm),samplesPerChannel,videoFrames,independentTiming,savedTimingMatches:true,sourceUnchanged:true});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,range:[60,90],results,limitations:['One fixed Sonoma range','Sample amount does not identify timestamp overlaps/gaps or establish perceptual sync','Existing prepared source-clock artifact used']},null,2));
 console.log(JSON.stringify({ok:true,root,counts:results.map(r=>({name:r.source.name,samples:r.samplesPerChannel}))}));
}catch(error){await writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),results},null,2));throw error;}finally{await client.close();}
