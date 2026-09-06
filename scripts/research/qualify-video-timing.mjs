import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`video-timing-${randomUUID()}`);await mkdir(root);const fixtures=[];
for(const mode of ['regular','duplicate']){
 const file=path.join(root,`${mode}.mkv`);
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2',...(mode==='duplicate'?['-vf','setpts=floor(N/2)/(30*TB)']:[]),'-c:v','ffv1','-fps_mode','passthrough',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
 const probed=await runProcess('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=pts:stream=time_base','-of','json',file],{timeoutMs:30000});assert.equal(probed.exitCode,0,probed.stderr);
 const probe=JSON.parse(probed.stdout);assert.equal(probe.streams[0].time_base,'1/1000');fixtures.push({file,id:await sha256File(file),mode,pts:probe.frames.map(f=>f.pts)});
}
const client=new Client({name:'video-timing-proof',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 await call('avid_index_media',{files:fixtures.map(f=>f.file)});
 for(const fixture of fixtures)for(const start of [0,0.25]){
  const pts=fixture.pts.filter(p=>p>=start*1000&&p<1000).map(p=>p-start*1000),deltas=pts.slice(1).map((p,i)=>p-pts[i]);
  const expected={frames:pts.length,timeBase:{num:1,den:1000},firstPts:pts[0],lastPts:pts.at(-1),duplicateSteps:deltas.filter(d=>d===0).length,backwardSteps:deltas.filter(d=>d<0).length,minDelta:Math.min(...deltas),maxDelta:Math.max(...deltas)};
  if(fixture.mode==='duplicate')assert.ok(expected.duplicateSteps>0);
  const report=await call('avid_media_qc',{id:fixture.id,options:{start,end:1,audioStream:null}});assert.deepEqual(report.videoTiming,expected);
  const saved=await call('avid_read_qc_report',{id:fixture.id,revision:report.revision});assert.deepEqual(saved.report.videoTiming,expected);assert.equal(await sha256File(fixture.file),fixture.id);
  results.push({mode:fixture.mode,start,expected,report});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({fixtures,results,scope:'Independent FFprobe PTS versus QC showinfo for regular/duplicate FFV1 timestamps and nonzero range starts. Backwards timestamps covered by parser tests only; no frame duration, gap count or perceptual sync claim.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,cases:results.map(r=>({mode:r.mode,start:r.start,timing:r.expected}))}));
}finally{await client.close();}
