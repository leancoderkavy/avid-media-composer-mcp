import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source);
const root=path.resolve('.avid-mcp-analysis',`visual-resume-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const client=new Client({name:'visual-resume-qualification',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
let client=await connect();
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const until=async(read,condition)=>{const deadline=Date.now()+120000;do{const value=await read();if(condition(value))return value;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<deadline);throw new Error('Observed operation did not reach expected state within 120 seconds');};
try{
  await call('avid_index_media',{files:[source]});
  const started=await call('avid_start_analysis_job',{job:{kind:'visual',ids:[id],samples:120}});
  const run=await until(async()=>(await call('avid_visual_index_runs',{})).runs[0],value=>value?.completedSamples>=2);
  assert.ok(run.completedSamples<120,'Worker finished before cancellation could be qualified');
  await call('avid_cancel_analysis_job',{jobId:started.id});
  const cancelled=await until(()=>call('avid_analysis_job_status',{jobId:started.id}),value=>['cancelled','failed','completed'].includes(value.status));assert.equal(cancelled.status,'cancelled');
  const before=await call('avid_visual_index_run',{runId:run.runId});assert.ok(before.completedSamples>=2&&before.completedSamples<120);
  const file=(runId,i)=>path.join(root,'avid-mcp-library',`visual-run-${runId}`,`${i}.json`);
  const prefix=await Promise.all(Array.from({length:before.completedSamples},(_,i)=>readFile(file(run.runId,i),'utf8')));
  await client.close();client=await connect();assert.deepEqual(await call('avid_visual_index_run',{runId:run.runId}),before);
  const resumed=await call('avid_start_analysis_job',{job:{kind:'visual_resume',runId:run.runId}});
  const completed=await until(()=>call('avid_analysis_job_status',{jobId:resumed.id}),value=>['completed','failed','cancelled'].includes(value.status));assert.equal(completed.status,'completed',JSON.stringify(completed));
  assert.equal(completed.result.reusedSamples,before.completedSamples);assert.equal(completed.result.samples,120);assert.notEqual(completed.result.runId,run.runId);
  for(let i=0;i<prefix.length;i++){assert.equal(await readFile(file(run.runId,i),'utf8'),prefix[i]);assert.equal(await readFile(file(completed.result.runId,i),'utf8'),prefix[i]);}
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({cancelled,before,completed,prefixUnchanged:true,sourceUnchanged:true,scope:'Real worker cancellation, MCP reconnect and reuse of committed visual embeddings'},null,2));
  console.log(JSON.stringify({passed:true,reusedSamples:before.completedSamples,totalSamples:120,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
