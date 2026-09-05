import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root=path.resolve('.avid-mcp-analysis',`strip-qualification-${randomUUID()}`);await mkdir(root);
const file=path.join(root,'black-white.mp4');
const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','color=black:s=160x90:r=30:d=2','-f','lavfi','-i','color=white:s=160x90:r=30:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p',file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(generated.exitCode,0,generated.stderr);
const sonoma=path.resolve('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4');
const client=new Client({name:'thumbnail-strip-qualification',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[root,path.dirname(sonoma)].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  const indexed=await call('avid_index_media',{files:[file,sonoma]});
  const [fixtureId,sonomaId]=indexed.entries.map(entry=>entry.id);
  const fixture=await call('avid_thumbnail_strip',{id:fixtureId,start:0,end:4,samples:4});
  assert.deepEqual(fixture.frames.map(frame=>frame.requestedSeconds),[0.5,1.5,2.5,3.5]);
  const levels=[];
  for(const frame of fixture.frames){
    const image=path.join(path.dirname(fixture.html),frame.filename);
    assert.equal(await sha256File(image),frame.sha256);
    const decoded=await runProcess('ffmpeg',['-nostdin','-v','info','-i',image,'-vf','signalstats,metadata=print','-f','null','-'],{timeoutMs:30000,maxOutputBytes:1048576});
    assert.equal(decoded.exitCode,0);const match=decoded.stderr.match(/lavfi.signalstats.YAVG=(\d+(?:\.\d+)?)/);assert.ok(match,decoded.stderr);levels.push(Number(match[1]));
  }
  assert.ok(levels[0]<30&&levels[1]<30&&levels[2]>220&&levels[3]>220,JSON.stringify(levels));
  for(const args of [{start:3,end:5,samples:4},{start:2,end:1,samples:4},{start:0,end:4,samples:121}]){
    const rejected=await client.callTool({name:'avid_thumbnail_strip',arguments:{id:fixtureId,...args}});assert.ok(rejected.isError);
  }
  const actual=await call('avid_thumbnail_strip',{id:sonomaId,start:60,end:90,samples:12});
  assert.equal(actual.frames.length,12);assert.equal(await sha256File(sonoma),sonomaId);assert.equal(await sha256File(file),fixtureId);
  const html=await readFile(actual.html,'utf8');assert.equal((html.match(/<figure>/g)??[]).length,12);
  const manifest=JSON.parse(await readFile(actual.manifest,'utf8'));assert.deepEqual(manifest.frames,actual.frames);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({fixture,decodedLuma:levels,sonoma:actual,invalidInputsRejected:3,sourceUnchanged:true},null,2));
  console.log(JSON.stringify({passed:true,decodedLuma:levels,sonomaHtml:actual.html,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
