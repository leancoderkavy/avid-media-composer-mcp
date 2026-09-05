import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-offsets-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'qc-offset-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
const results=[];
try{
 for(const delayed of ['video','audio']){
  const file=path.join(root,`${delayed}-delayed.mkv`);
  const g=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-f','lavfi','-i','color=black:s=160x90:r=30:d=2','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2','-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=2','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=2','-filter_complex',`[0:v][1:v]concat=n=2:v=1:a=0,setpts=PTS+${delayed==='video'?1:0}/TB[v];[2:a][3:a]concat=n=2:v=0:a=1,asetpts=PTS+${delayed==='audio'?1:0}/TB[a]`,'-map','[v]','-map','[a]','-c:v','ffv1','-c:a','pcm_s16le','-fps_mode','passthrough',file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(g.exitCode,0,g.stderr);
  const id=await sha256File(file);await call('avid_index_media',{files:[file]});
  for(const start of [0,0.5,1.5]){
   const report=await call('avid_media_qc',{id,options:{start,end:4,freezeSeconds:0.5}});
   results.push({delayed,start,report});
  }
  assert.equal(await sha256File(file),id);
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,sourceUnchanged:true},null,2));
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),events:results.map(({delayed,start,report})=>({delayed,start,black:report.findings.black,freeze:report.findings.freeze,silence:report.findings.silence,timing:report.timing}))}));
 for(const {delayed,start,report} of results){const near=(actual,target)=>assert.ok(Math.abs(actual-target)<0.08,`${delayed}: ${actual} != ${target}`);near(report.findings.black[0].start,Math.max(start,delayed==='video'?1:0));near(report.findings.silence[0].start,Math.max(start,delayed==='audio'?1:0));near(report.findings.black[0].end,delayed==='video'?3:2);near(report.findings.freeze[0].end,delayed==='video'?3:2);near(report.findings.silence[0].end,delayed==='audio'?3:2);}
 console.log('All source event boundaries matched within 80 ms');
}finally{await client.close();}
