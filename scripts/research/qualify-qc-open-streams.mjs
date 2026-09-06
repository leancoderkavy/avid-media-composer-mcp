import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-open-streams-${randomUUID()}`);await mkdir(root);
const files=[];
for(const [name,videoDuration,audioDuration] of [['short-video',1,4],['short-audio',4,1]]){
 const file=path.join(root,`${name}.mkv`);
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i',`color=white:s=160x90:r=30:d=${videoDuration}`,'-f','lavfi','-i',`anullsrc=r=48000:cl=mono:d=${audioDuration}`,'-map','0:v','-map','1:a','-c:v','ffv1','-c:a','pcm_s16le',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
 files.push({file,id:await sha256File(file),videoDuration,audioDuration});
}
const client=new Client({name:'qc-open-streams-proof',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 await call('avid_index_media',{files:files.map(f=>f.file)});
 for(const fixture of files){
  const report=await call('avid_media_qc',{id:fixture.id,options:{end:4,freezeSeconds:0.5}});
  assert.equal(report.videoCoverage.decodedFrames,fixture.videoDuration*30);assert.equal(report.audioCoverage.samplesPerChannel,fixture.audioDuration*48000);
  assert.deepEqual(report.findings.freeze,[{start:0,end:null,openAtProcessingEnd:true}]);assert.deepEqual(report.findings.silence,[{start:0,end:fixture.audioDuration}]);
  const saved=await call('avid_read_qc_report',{id:fixture.id,revision:report.revision});assert.deepEqual(saved.report.findings,report.findings);assert.equal(await sha256File(fixture.file),fixture.id);
  results.push({fixture,report});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Synthetic static video and silent PCM of different lengths in a four-second container. Not perceptual sync or general stream-end semantics.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,results:results.map(r=>({videoDuration:r.fixture.videoDuration,audioDuration:r.fixture.audioDuration,freeze:r.report.findings.freeze,silence:r.report.findings.silence}))}));
}finally{await client.close();}
