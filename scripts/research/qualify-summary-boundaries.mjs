import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {summaryChunks,loadSummaryModel} from '../../dist/library/summaries.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),cache=path.resolve('.avid-mcp-analysis/models');
const root=path.resolve('.avid-mcp-analysis',`summary-boundaries-${randomUUID()}`);await mkdir(root);
const decision='Alexandra must remove the roadside interview before the Friday delivery.',text='The approved footage remains unchanged. '.repeat(49)+decision;
const segment={start:0,end:10,index:0,text},comparisons=[];
const model=await loadSummaryModel(cache);
try{
 for(const recipe of [1,2]){
  const chunks=summaryChunks([segment],recipe);assert.equal(chunks.map(c=>c.text).join(''),text);
  const outputs=[];for(const chunk of chunks){const result=await model(chunk.text,{max_new_tokens:80,min_new_tokens:8,do_sample:false,num_beams:1});outputs.push({input:chunk.text,output:result[0].summary_text});}
  comparisons.push({recipe,intactDecisionInput:chunks.some(c=>c.text.includes(decision)),outputs});
 }
}finally{await model.dispose();}
assert.equal(comparisons[0].intactDecisionInput,false);assert.equal(comparisons[1].intactDecisionInput,true);
const client=new Client({name:'summary-boundary-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:cache,AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 await call('avid_index_media',{files:[source]});
 const transcript=await call('avid_import_transcript',{id,segments:[{start:0,end:10,text}]});
 const generated=await call('avid_generate_summary',{id,transcriptRevision:transcript.revision});
 const overview=await call('avid_summary_node',{revision:generated.revision});assert.equal(overview.sources[0].text,text);assert.equal(overview.factualEntailmentVerified,false);
 const leaves=[];for(const child of overview.children)leaves.push(await call('avid_summary_node',{revision:generated.revision,nodeId:child.nodeId}));
 assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({id,text,decision,comparisons,generated,overview,leaves,sourceUnchanged:true,limitations:['Synthetic repeated editorial note attached to a real source; not a transcript of Sonoma speech','Exact input preservation and workflow qualification, not broad factual quality acceptance','Sentence/word boundary heuristics can still split long sentences and do not perform linguistic parsing']},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,comparisons:comparisons.map(c=>({recipe:c.recipe,intactDecisionInput:c.intactDecisionInput,outputs:c.outputs.map(o=>o.output)})),overview:overview.node.summary}));
}finally{await client.close();}
