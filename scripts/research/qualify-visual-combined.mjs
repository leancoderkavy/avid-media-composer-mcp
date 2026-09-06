import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const library=path.resolve('.avid-mcp-analysis/sonoma-library-20260905'),prior=JSON.parse(await readFile(path.join(library,'visual-shots.json'),'utf8'));
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sourceSha256=await sha256File(source);
assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const sample=prior.samples[0],image=sample.image,imageSha256=await sha256File(image),text='vineyard landscape';
const root=path.resolve('.avid-mcp-analysis',`visual-combined-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'visual-combined-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:library,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const search=query=>call('avid_search_visual',{indexId:prior.index.indexId,query,limit:100});
try{
 const imageOnly=await search({image}),textOnly=await search({text}),combined=await search({image,text});
 assert.equal(combined.results.length,32);
 const verify=(result,reference)=>{for(const row of result.results){
  const i=reference.results.find(s=>s.id===row.id&&s.time===row.time),t=textOnly.results.find(s=>s.id===row.id&&s.time===row.time);assert.ok(i&&t);
  assert.equal(row.imageSimilarity,i.score);assert.equal(row.textSimilarity,t.score);assert.ok(Math.abs(row.score-(i.score+t.score)/2)<1e-10);
 }};
 verify(combined,imageOnly);
 const frame=await call('avid_search_visual_frame',{indexId:prior.index.indexId,id:sourceSha256,time:sample.time,text,limit:100});
 const frameImageOnly=await search({image:frame.reference.image});verify(frame,frameImageOnly);
 const scoped=await call('avid_search_visual',{indexId:prior.index.indexId,query:{image,text},limit:100,scope:{range:{start:60,end:90}},refinement:{exclude:['people'],weight:0.5}});
 assert.ok(scoped.results.length>0&&scoped.results.every(s=>s.time>=60&&s.time<90));
 for(const row of scoped.results)assert.ok(Math.abs(row.score-(row.imageSimilarity+row.textSimilarity)/2+0.5*row.exclusionSimilarity)<1e-10);
 const inventory=async()=> (await readdir(library,{recursive:true})).sort();
 const beforeRefusal=await inventory();
 for(const fields of [{text:'a '.repeat(90)+'violin'},{refinement:{exclude:['a '.repeat(90)+'violin']}}]){
  const rejected=await client.callTool({name:'avid_search_visual_frame',arguments:{indexId:prior.index.indexId,id:sourceSha256,time:0.12345,limit:2,...fields}},undefined,{timeout:120000});
  assert.equal(rejected.isError,true);assert.equal(rejected.structuredContent.error.code,'VISUAL_QUERY_TOO_LONG');
 }
 assert.deepEqual(await inventory(),beforeRefusal);
 assert.equal(await sha256File(source),sourceSha256);assert.equal(await sha256File(image),imageSha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,sourceSha256,imageSha256,imageOnly,textOnly,combined,frame,frameImageOnly,scoped,overlongFrameQueriesCreatedNoFiles:true,sourceAndReferenceUnchanged:true,scope:'Real local-model score composition and source-frame extraction; not independent retrieval-quality or identity acceptance'},null,2),{flag:'wx'});
 console.log(JSON.stringify({ok:true,root,samples:combined.results.length,scopedSamples:scoped.results.length}));
}finally{await client.close();}
