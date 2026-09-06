import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`video-timing-${randomUUID()}`);await mkdir(root);const fixtures=[];
for(const mode of ['regular','duplicate','gap','bframes']){
 const file=path.join(root,`${mode}.${mode==='bframes'?'mp4':'mkv'}`);
 const filter=mode==='duplicate'?'setpts=floor(N/2)/(30*TB)':mode==='gap'?"setpts='PTS+gte(N,15)*0.25/TB'":null;
 const codec=mode==='bframes'?['-c:v','libx264','-bf','3','-x264-params','b-adapt=0:keyint=60']:['-c:v','ffv1'];
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2',...(filter?['-vf',filter]:[]),...codec,'-fps_mode','passthrough',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
 const probed=await runProcess('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=pts,pict_type:stream=time_base,has_b_frames','-of','json',file],{timeoutMs:30000});assert.equal(probed.exitCode,0,probed.stderr);
 const probe=JSON.parse(probed.stdout),[num,den]=probe.streams[0].time_base.split('/').map(Number);
 assert.ok(Number.isSafeInteger(num)&&num>0&&Number.isSafeInteger(den)&&den>0);
 assert.ok(probe.frames.every(f=>Number.isSafeInteger(f.pts)));
 if(mode==='bframes'){assert.ok(probe.streams[0].has_b_frames>0);assert.ok(probe.frames.some(f=>f.pict_type==='B'));}
 fixtures.push({file,id:await sha256File(file),mode,timeBase:{num,den},hasBFrames:probe.streams[0].has_b_frames,pts:probe.frames.map(f=>f.pts)});
}
const client=new Client({name:'video-timing-proof',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 await call('avid_index_media',{files:fixtures.map(f=>f.file)});
 for(const fixture of fixtures)for(const start of [0,0.25]){
  const ticksPerSecond=fixture.timeBase.den/fixture.timeBase.num,shift=start*ticksPerSecond;assert.ok(Number.isSafeInteger(shift));
  const pts=fixture.pts.filter(p=>p>=shift&&p<ticksPerSecond).map(p=>p-shift),deltas=pts.slice(1).map((p,i)=>p-pts[i]);
  const expected={frames:pts.length,timeBase:fixture.timeBase,firstPts:pts[0],lastPts:pts.at(-1),duplicateSteps:deltas.filter(d=>d===0).length,backwardSteps:deltas.filter(d=>d<0).length,minDelta:Math.min(...deltas),maxDelta:Math.max(...deltas)};
  if(fixture.mode==='duplicate')assert.ok(expected.duplicateSteps>0);
  if(fixture.mode==='gap')assert.ok(expected.maxDelta>expected.minDelta*5);
  if(fixture.mode==='bframes')assert.equal(expected.backwardSteps,0);
  const report=await call('avid_media_qc',{id:fixture.id,options:{start,end:1,audioStream:null}});assert.deepEqual(report.videoTiming,expected);
  const saved=await call('avid_read_qc_report',{id:fixture.id,revision:report.revision});assert.deepEqual(saved.report.videoTiming,expected);assert.equal(await sha256File(fixture.file),fixture.id);
  results.push({mode:fixture.mode,start,expected,report});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({fixtures,results,scope:'Independent decoded FFprobe PTS versus QC showinfo for regular/duplicate/gapped FFV1 and confirmed H.264 B frames at zero/nonzero starts. Backwards presentation timestamps covered by parser tests only; no frame duration, missing-frame count or perceptual sync claim.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,cases:results.map(r=>({mode:r.mode,start:r.start,timing:r.expected}))}));
}finally{await client.close();}
