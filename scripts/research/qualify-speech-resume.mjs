import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const options=process.argv.includes("--multilingual-auto")?{model:"tiny",language:"auto"}:{model:"tiny.en",language:"auto"};
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`speech-resume-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const client=new Client({name:'speech-resume-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));return client;};
let client=await connect();
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const until=async(read,accept)=>{const deadline=Date.now()+120000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);throw new Error('Job did not reach expected state');};
try{
  await call('avid_index_media',{files:[source]});
  const started=await call('avid_start_analysis_job',{job:{kind:'speech',id,start:0,end:180,options}});
  const run=await until(async()=>(await call('avid_speech_runs',{id})).runs[0],value=>value?.completedWindows>=1);assert.ok(run.completedWindows<run.plannedWindows,'Job finished before cancellation');
  await call('avid_cancel_analysis_job',{jobId:started.id});const cancelled=await until(()=>call('avid_analysis_job_status',{jobId:started.id}),value=>['cancelled','completed','failed'].includes(value.status));assert.equal(cancelled.status,'cancelled');
  const before=await call('avid_speech_run',{runId:run.runId});assert.equal(before.state,'partial');assert.ok(before.completedWindows>0&&before.completedWindows<before.plannedWindows);
  const file=(runId,i)=>path.join(root,'avid-mcp-library',`speech-run-${runId}`,`${i}.json`),prefix=await Promise.all(Array.from({length:before.completedWindows},(_,i)=>readFile(file(run.runId,i),'utf8')));
  await client.close();client=await connect();assert.deepEqual(await call('avid_speech_run',{runId:run.runId}),before);
  const resumed=await call('avid_start_analysis_job',{job:{kind:'speech_resume',runId:run.runId}}),completed=await until(()=>call('avid_analysis_job_status',{jobId:resumed.id}),value=>['completed','failed','cancelled'].includes(value.status));assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.result.reusedWindows,before.completedWindows);
  for(let i=0;i<prefix.length;i++){assert.equal(await readFile(file(run.runId,i),'utf8'),prefix[i]);assert.equal(await readFile(file(completed.result.runId,i),'utf8'),prefix[i]);}
  const verified=await call('avid_speech_run',{runId:completed.result.runId});assert.equal(verified.state,'completed');assert.equal(verified.completedWindows,before.plannedWindows);
  assert.deepEqual(completed.result.languageDecision,before.languageDecision);
  const baseline=await call('avid_transcribe_media',{id,start:0,end:180,options});assert.deepEqual(completed.result.segments,baseline.segments,'Resumed segments must equal uninterrupted result');
  const replay=await client.callTool({name:'avid_resume_speech',arguments:{runId:completed.result.runId}});assert.equal(replay.isError,true);
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({cancelled,before,completed,verified,baseline,prefixUnchanged:true,sourceUnchanged:true,completedResumeRejected:true,scope:'Real MCP worker cancellation/reconnect/resume and exact segment equivalence on Sonoma; not speech accuracy or broad recovery acceptance'},null,2));
  console.log(JSON.stringify({passed:true,reusedWindows:before.completedWindows,totalWindows:verified.completedWindows,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
