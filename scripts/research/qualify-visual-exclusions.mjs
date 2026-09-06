import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const library=path.resolve('.avid-mcp-analysis/sonoma-library-20260905');
const prior=JSON.parse(await readFile(path.join(library,'visual-shots.json'),'utf8'));
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceSha256=await sha256File(source);assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root=path.resolve('.avid-mcp-analysis',`visual-exclusions-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'visual-exclusion-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:library,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect'}}));
const query='vineyard landscape',exclude='people',weight=0.5;
const search=async(text,refinement)=>{
 const result=await client.callTool({name:'avid_search_visual',arguments:{indexId:prior.index.indexId,query:{text},limit:100,...(refinement?{refinement}:{})}},undefined,{timeout:120000});
 assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;
};
try{
 const positive=await search(query),negative=await search(exclude),refined=await search(query,{exclude:[exclude],weight}),zero=await search(query,{exclude:[exclude],weight:0});
 assert.equal(positive.results.length,32);assert.equal(refined.results.length,32);
 for(const row of refined.results){
  const p=positive.results.find(s=>s.id===row.id&&s.time===row.time),n=negative.results.find(s=>s.id===row.id&&s.time===row.time);assert.ok(p&&n);
  assert.ok(Math.abs(row.score-(p.score-weight*Math.max(0,n.score)))<1e-10);
  assert.equal(row.similarity,p.score);assert.equal(row.exclusionSimilarity,Math.max(0,n.score));
 }
 assert.deepEqual(zero.results.map(s=>[s.time,s.score]),positive.results.map(s=>[s.time,s.score]));
 assert.equal(await sha256File(source),sourceSha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,query,exclude,weight,positive,negative,refined,zeroWeightIdentical:true,sourceSha256,sourceUnchanged:true,scope:'Actual local CLIP and MCP score arithmetic over 32 Sonoma samples; not independent semantic exclusion accuracy or guaranteed absence'},null,2),{flag:'wx'});
 console.log(JSON.stringify({ok:true,root,topBefore:positive.results[0].time,topAfter:refined.results[0].time,samples:refined.results.length}));
}finally{await client.close();}
