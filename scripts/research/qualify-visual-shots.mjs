import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFile,readFile} from 'node:fs/promises';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import assert from 'node:assert/strict';
const id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const client=new Client({name:'visual-shot-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:'.avid-mcp-analysis/sonoma-library-20260905',AVID_MCP_MODEL_DIR:'.avid-mcp-analysis/models',AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  const [entry]=await call('avid_library_metadata',{ids:[id]}),duration=Number(entry.metadata.format.duration),started=Date.now();
  const index=await call('avid_index_visual_shots',{id,options:{start:0,end:duration}});
  const report=JSON.parse(await readFile(index.shotReport,'utf8'));assert.equal(index.samples,report.shots.length);assert.ok(report.decodedFrames>5700);
  const samples=[];let after=-1;
  do {const page=await call('avid_visual_samples',{indexId:index.indexId,after,limit:100});samples.push(...page.samples);after=page.nextAfter;}while(after!==null);
  assert.equal(samples.length,report.shots.length);
  for(let i=0;i<samples.length;i++){assert.deepEqual(samples[i].shot,{start:report.shots[i].start,end:report.shots[i].end});assert.equal(samples[i].time,report.shots[i].representativeSeconds);}
  const reference=samples[Math.floor(samples.length/2)];
  const found=await call('avid_search_visual_frame',{indexId:index.indexId,id,time:reference.time,limit:10,scope:{range:reference.shot}});
  assert.equal(found.results[0].time,reference.time);assert.ok(found.results[0].score>0.99);assert.deepEqual(found.results[0].shot,reference.shot);
  assert.equal(await sha256File('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'),id);
  const evidence={index,decodedFrames:report.decodedFrames,duration,samples,found,elapsedMs:Date.now()-started,sourceUnchanged:true,qualification:'Every detected shot indexed; cut accuracy and semantic ranking require separate benchmarks'};
  await writeFile('.avid-mcp-analysis/sonoma-library-20260905/visual-shots.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({passed:true,samples:index.samples,decodedFrames:report.decodedFrames,duration,selfMatch:found.results[0].score,elapsedMs:evidence.elapsedMs}));
}finally{await client.close();}
