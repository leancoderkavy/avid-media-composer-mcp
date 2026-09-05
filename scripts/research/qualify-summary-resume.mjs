import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`summary-resume-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const client=new Client({name:'summary-resume-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,project-write'}}));return client;};
let client=await connect();
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const until=async(read,accept)=>{const deadline=Date.now()+120000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<deadline);throw new Error('Observed job did not reach expected state within 120 seconds');};
try{
  await call('avid_index_media',{files:[source]});
  const topics=['The editor selects the vineyard arrival footage.','The producer requests clear location context.','The sound editor reviews dialogue against music.','The team keeps alternate takes for review.','The assistant checks names and source timecodes.','The director reviews the ending before delivery.'];
  const segments=topics.map((text,i)=>({start:i*20,end:(i+1)*20,text:(text+' These are synthetic qualification notes, not dialogue from the source video. ').repeat(12)}));
  const transcript=await call('avid_import_transcript',{id,segments});
  const started=await call('avid_start_analysis_job',{job:{kind:'summary',id,transcriptRevision:transcript.revision}});
  const run=await until(async()=>(await call('avid_summary_runs',{id})).runs[0],value=>value?.completedNodes>=1);assert.ok(run.completedNodes<run.plannedNodes,'Summary finished before cancellation could be tested');
  await call('avid_cancel_analysis_job',{jobId:started.id});
  const cancelled=await until(()=>call('avid_analysis_job_status',{jobId:started.id}),value=>['cancelled','completed','failed'].includes(value.status));assert.equal(cancelled.status,'cancelled');
  const before=await call('avid_summary_run',{runId:run.runId});assert.ok(before.completedNodes>0&&before.completedNodes<before.plannedNodes);
  const file=(runId,i)=>path.join(root,'avid-mcp-library',`summary-run-${runId}`,`${i}.json`),prefix=await Promise.all(Array.from({length:before.completedNodes},(_,i)=>readFile(file(run.runId,i),'utf8')));
  await client.close();client=await connect();assert.deepEqual(await call('avid_summary_run',{runId:run.runId}),before);
  const restarted=await call('avid_start_analysis_job',{job:{kind:'summary_resume',runId:run.runId}});
  const completed=await until(()=>call('avid_analysis_job_status',{jobId:restarted.id}),value=>['completed','failed','cancelled'].includes(value.status));assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.result.reusedNodes,before.completedNodes);
  for(let i=0;i<prefix.length;i++){assert.equal(await readFile(file(run.runId,i),'utf8'),prefix[i]);assert.equal(await readFile(file(completed.result.runId,i),'utf8'),prefix[i]);}
  const verified=await call('avid_summary_run',{runId:completed.result.runId});assert.equal(verified.state,'completed');assert.equal(verified.completedNodes,before.plannedNodes);
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({transcript,cancelled,before,completed,verified,prefixUnchanged:true,sourceUnchanged:true,scope:'Synthetic editorial notes; real model cancellation/reconnect/resume, not factual quality qualification'},null,2));
  console.log(JSON.stringify({passed:true,reusedNodes:before.completedNodes,totalNodes:verified.completedNodes,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
