import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const prior=JSON.parse(await readFile('.avid-mcp-analysis/caption-batch-0e41594b-4081-40aa-a918-dbfca87795b5/evidence.json','utf8'));
const libraryRoot=path.resolve('.avid-mcp-analysis/caption-batch-0e41594b-4081-40aa-a918-dbfca87795b5');
const root=path.resolve('.avid-mcp-analysis',`visual-summary-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),references=prior.completed.result.captions.map(({captionId,sha256})=>({captionId,sha256}));
const connect=async()=>{const c=new Client({name:'visual-summary-proof',version:'1.0'});await c.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:libraryRoot,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,project-write'}}));return c;};let client=await connect();
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:240000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const job=await call('avid_start_analysis_job',{job:{kind:'visual_summary',id,references}});let completed;const deadline=Date.now()+240000;
 do{completed=await call('avid_analysis_job_status',{jobId:job.id});if(['completed','failed','cancelled'].includes(completed.status))break;await new Promise(r=>setTimeout(r,300));}while(Date.now()<deadline);
 assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.result.nodes,16);
 const revision=completed.result.revision,overview=await call('avid_visual_summary_node',{revision});assert.equal(overview.sources.length,12);assert.equal(overview.factualEntailmentVerified,false);
 for(let i=0;i<12;i++){assert.equal(overview.sources[i].sha256,references[i].sha256);assert.equal(overview.sources[i].text,prior.records[i].text);assert.equal(await sha256File(overview.sources[i].image),overview.sources[i].imageSha256);}
 const leaf=await call('avid_visual_summary_node',{revision,nodeId:'n0'});assert.equal(leaf.node.text,prior.records[0].text);assert.equal(leaf.node.firstSampleTime,leaf.node.lastSampleTime);assert.equal(leaf.node.generated,false);
 await client.close();client=await connect();assert.deepEqual(await call('avid_visual_summary_node',{revision}),overview);
 assert.ok((await call('avid_list_visual_summaries',{id})).summaries.some(row=>row.revision===revision));
 const rejected=await client.callTool({name:'avid_delete_visual_summary',arguments:{revision,expectedSha256:'0'.repeat(64)}});assert.equal(rejected.isError,true);
 const duplicate=await client.callTool({name:'avid_summarize_captions',arguments:{id,references:[references[0],references[0]]}});assert.equal(duplicate.isError,true);
 const removed=await call('avid_delete_visual_summary',{revision,expectedSha256:overview.sha256});assert.equal(removed.deleted,true);
 assert.equal(await sha256File(source),id);
 for(const ref of references){const read=await call('avid_read_caption',{captionId:ref.captionId});assert.equal(read.sha256,ref.sha256);}
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({completed,overview,leaf,reconnectEqual:true,staleDeleteRejected:true,duplicateRejected:true,removed,sourceAndCaptionsUnchanged:true,scope:'Actual local visual hierarchy generation from 12 saved Sonoma captions, descendant source review, reconnect discovery and deletion; not factual accuracy, continuous footage coverage or computation recovery'},null,2));
 console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json'),overview:overview.node.text}));
}finally{await client.close();}
