import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`shots-${randomUUID()}`);await mkdir(root);
const file=path.join(root,'known-cut.mp4'),sonoma='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','color=black:s=160x90:r=30:d=2','-f','lavfi','-i','color=white:s=160x90:r=30:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264',file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(generated.exitCode,0,generated.stderr);
const client=new Client({name:'shot-qualification',version:'1.0.0'});
const offsetFile=path.join(root,'offset-cut.mp4');
const offsetGenerated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',file,'-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=4.5','-map','0:v:0','-map','1:a:0','-vf','setpts=PTS+0.5/TB','-fps_mode','passthrough','-c:v','libx264','-c:a','aac',offsetFile],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(offsetGenerated.exitCode,0,offsetGenerated.stderr);
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[root,path.dirname(sonoma)].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  const indexed=await call('avid_index_media',{files:[file,sonoma]}),[fixtureId,sonomaId]=indexed.entries.map(entry=>entry.id);
  const fixture=await call('avid_detect_shots',{id:fixtureId,options:{start:1,end:3}});
  assert.equal(fixture.cuts.length,1);assert.ok(Math.abs(fixture.cuts[0].time-2)<1/30);assert.equal(fixture.decodedFrames,60);
  assert.deepEqual(fixture.shots.map(shot=>[shot.start,shot.end]),[[1,2],[2,3]]);
  const still=await call('avid_detect_shots',{id:fixtureId,options:{start:0,end:1}});assert.equal(still.cuts.length,0);assert.equal(still.decodedFrames,30);
  const offsetIndexed=await call('avid_index_media',{files:[offsetFile]});
  const offset=await call('avid_detect_shots',{id:offsetIndexed.entries[0].id,options:{start:0,end:4.5}});
  assert.equal(offset.cuts.length,1);assert.ok(Math.abs(offset.cuts[0].time-2.5)<1/30,JSON.stringify(offset.cuts));
  const started=await call('avid_start_analysis_job',{job:{kind:'shots',id:sonomaId,options:{start:60,end:90}}});
  let result=started;const deadline=Date.now()+120000;
  while(['queued','running'].includes(result.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,200));result=await call('avid_analysis_job_status',{jobId:started.id});}
  assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.result.decodedFrames,900);
  assert.equal(await sha256File(file),fixtureId);assert.equal(await sha256File(sonoma),sonomaId);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({fixture,still,offset,sonoma:result.result,sourceUnchanged:true},null,2));
  console.log(JSON.stringify({passed:true,fixtureCutSeconds:fixture.cuts[0].time,sonomaCuts:result.result.cuts.length,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
