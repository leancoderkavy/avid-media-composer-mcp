import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const previous=process.argv[2];if(!previous)throw new Error('Pass a completed qualify-summary-resume evidence.json');
const evidence=JSON.parse(await readFile(previous,'utf8')),root=path.dirname(path.resolve(previous)),revision=evidence.completed.result.revision;
const record=JSON.parse(await readFile(path.join(root,'avid-mcp-library',`summary-${revision}.json`),'utf8'));
const transcript=JSON.parse(await readFile(evidence.transcript.path,'utf8'));
const client=new Client({name:'summary-source-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
try{
  const results=[];
  for(const node of record.nodes){
    const response=await client.callTool({name:'avid_summary_node',arguments:{revision,nodeId:node.nodeId}});assert.ok(!response.isError,JSON.stringify(response));
    const data=response.structuredContent.data;
    // Independently find descendant leaves using an iterative traversal.
    const pending=[node.nodeId],indices=new Set();
    while(pending.length){const next=pending.pop(),current=record.nodes.find(candidate=>candidate.nodeId===next);assert.ok(current);pending.push(...current.children);for(const index of current.sourceIndices)indices.add(index);}
    const expected=transcript.segments.map((segment,index)=>({...segment,index})).filter(segment=>indices.has(segment.index));
    assert.deepEqual(data.sources,expected);assert.equal(data.factualEntailmentVerified,false);assert.equal(data.reviewRequired,true);
    results.push({nodeId:node.nodeId,sourceScope:data.sourceScope,indices:data.sources.map(source=>source.index)});
  }
  const output=path.resolve('.avid-mcp-analysis',`summary-sources-${randomUUID()}`);await mkdir(output);
  await writeFile(path.join(output,'evidence.json'),JSON.stringify({previous,revision,results,scope:'Read-only MCP drill-down over existing real-model output; original transcript coverage, not factual entailment'},null,2));
  console.log(JSON.stringify({passed:true,nodes:results.length,evidence:path.join(output,'evidence.json')}));
}finally{await client.close();}

