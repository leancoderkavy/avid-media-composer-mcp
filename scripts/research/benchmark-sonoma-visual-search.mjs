import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const labelPath=new URL('./sonoma-visual-labels.json',import.meta.url),labels=JSON.parse(await readFile(labelPath,'utf8'));
const library=path.resolve('.avid-mcp-analysis/sonoma-library-20260905'),prior=JSON.parse(await readFile(path.join(library,'visual-shots.json'),'utf8'));
assert.equal(prior.samples.length,labels.sampleCount);assert.ok(prior.samples.every(sample=>sample.id===labels.sourceId));
for(const query of labels.queries){assert.ok(query.relevant.length>0&&new Set(query.relevant).size===query.relevant.length);assert.ok(query.relevant.every(index=>Number.isInteger(index)&&index>=0&&index<labels.sampleCount));}
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';assert.equal(await sha256File(source),labels.sourceId);
const sampleHashes=await Promise.all(prior.samples.map(async sample=>({index:sample.index,time:sample.time,sha256:await sha256File(sample.image)})));
const root=path.resolve('.avid-mcp-analysis',`visual-ranking-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'visual-ranking-benchmark',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:library,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect'}}));
try{
  const results=[];
  for(const query of labels.queries){
    const started=Date.now(),response=await client.callTool({name:'avid_search_visual',arguments:{indexId:prior.index.indexId,query:{text:query.text},limit:32}},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));
    const ranked=response.structuredContent.data.results.map(result=>{const sample=prior.samples.find(sample=>sample.id===result.id&&sample.time===result.time);assert.ok(sample);return {index:sample.index,time:result.time,score:result.score};});assert.equal(ranked.length,32);assert.equal(new Set(ranked.map(row=>row.index)).size,32);
    const relevant=new Set(query.relevant),firstRelevantRank=ranked.findIndex(row=>relevant.has(row.index))+1;
    assert.ok(firstRelevantRank>0);
    results.push({...query,ranked,firstRelevantRank,reciprocalRank:1/firstRelevantRank,hit1:firstRelevantRank<=1,hit3:firstRelevantRank<=3,hit5:firstRelevantRank<=5,recall5:ranked.slice(0,5).filter(row=>relevant.has(row.index)).length/relevant.size,elapsedMs:Date.now()-started});
  }
  const mean=field=>results.reduce((sum,row)=>sum+Number(row[field]),0)/results.length,metrics=Object.fromEntries(['hit1','hit3','hit5','reciprocalRank','recall5'].map(field=>[field,mean(field)]));
  const negatives=[];for(const text of labels.negativeQueries){const response=await client.callTool({name:'avid_search_visual',arguments:{indexId:prior.index.indexId,query:{text},limit:3}});assert.ok(!response.isError,JSON.stringify(response));negatives.push({text,expectedRelevantSamples:0,results:response.structuredContent.data.results.map(result=>({index:prior.samples.find(sample=>sample.time===result.time).index,time:result.time,score:result.score}))});}
  const longQuery='a '.repeat(90)+'a violin',rejected=await client.callTool({name:'avid_search_visual',arguments:{indexId:prior.index.indexId,query:{text:longQuery},limit:3}});
  assert.equal(rejected.isError,true);const queryLengthProbe=rejected.structuredContent.error;assert.equal(queryLengthProbe.code,'VISUAL_QUERY_TOO_LONG');assert.ok(queryLengthProbe.details.tokenCount>77);assert.equal(queryLengthProbe.details.maxTokens,77);
  assert.equal(await sha256File(source),labels.sourceId);for(const sample of sampleHashes)assert.equal(await sha256File(prior.samples[sample.index].image),sample.sha256);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({labels,indexId:prior.index.indexId,sampleHashes,metrics,results,negatives,queryLengthProbe,sourceUnchanged:true,scope:'One 32-sample Sonoma development set; assistant-authored labels, not independent ground truth or broad accuracy acceptance'},null,2));
  console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),metrics,negatives,queries:results.map(row=>({text:row.text,firstRelevantRank:row.firstRelevantRank,recall5:row.recall5,top:row.ranked[0].index}))}));
}finally{await client.close();}
