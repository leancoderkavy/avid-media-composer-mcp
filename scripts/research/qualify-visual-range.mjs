import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFile} from 'node:fs/promises';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import assert from 'node:assert/strict';
const id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const client=new Client({name:'visual-range-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{...process.env,AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:'.avid-mcp-analysis/sonoma-library-20260905',AVID_MCP_MODEL_DIR:'.avid-mcp-analysis/models',AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  const started=Date.now();
  const index=await call('avid_index_visual',{ids:[id],samplesPerFile:24,range:{start:60,end:90}});assert.equal(index.samples,24);
  const page=await call('avid_visual_samples',{indexId:index.indexId,limit:2});assert.equal(page.samples.length,2);assert.equal(page.samples[0].time,60.625);
  const found=await call('avid_search_visual_frame',{indexId:index.indexId,id,time:60.625,limit:3});
  assert.equal(found.results[0].time,60.625);assert.ok(found.results[0].score>0.99);
  const scoped=await call('avid_search_visual',{indexId:index.indexId,query:{text:'people outdoors'},scope:{ids:[id],range:{start:80,end:85}},limit:10});
  assert.equal(scoped.matchingSamples,4);assert.ok(scoped.results.every(item=>item.time>=80&&item.time<85));
  assert.equal(await sha256File('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'),id);
  const evidence={index,page,found,scoped,elapsedMs:Date.now()-started,sourceUnchanged:true,scope:'Reference self-match and range correctness; not semantic ranking accuracy'};
  await writeFile('.avid-mcp-analysis/sonoma-library-20260905/visual-range.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:true,samples:index.samples,selfMatch:found.results[0].score,rangeMatches:scoped.matchingSamples,elapsedMs:evidence.elapsedMs}));
}finally{await client.close();}

