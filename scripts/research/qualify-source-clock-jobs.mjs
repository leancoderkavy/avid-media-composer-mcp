import {mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const expectedSha256=await sha256File(file);
const {values}=parseArgs({options:{entrypoint:{type:'string'},cancel:{type:'boolean'},'trace-cancel':{type:'boolean'},'fault-cancel':{type:'boolean'}}});
assert.ok([values.cancel,values['trace-cancel'],values['fault-cancel']].filter(Boolean).length<=1,'Select one cancellation mode');
const testCancellation=Boolean(values.cancel||values['trace-cancel']||values['fault-cancel']),fault=Boolean(values['fault-cancel']),trace=fault||Boolean(values['trace-cancel']);
const entrypoint=values.entrypoint??path.resolve('dist/index.js');assert.ok(path.isAbsolute(entrypoint),'Entrypoint must be absolute');
const runtimeFiles=[entrypoint,...['library/jobs.js','library/worker.js','library/job-journal.js','library/source-clock.js','process-tree.js'].map(name=>path.join(path.dirname(entrypoint),name))];
const runtimeHashes=await Promise.all(runtimeFiles.map(sha256File));
assert.equal(expectedSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root=path.resolve('.avid-mcp-analysis',`source-clock-jobs-${randomUUID()}`);await mkdir(root);
console.log(JSON.stringify({root}));
const clients=[],events=[];
async function connect(){
 const client=new Client({name:'source-clock-jobs',version:'1'});clients.push(client);
 await client.connect(new StdioClientTransport({command:process.execPath,args:[...(trace?['--import',new URL('./trace-taskkill.mjs',import.meta.url).href]:[]),entrypoint],cwd:path.dirname(entrypoint),stderr:'pipe',
  env:{...getDefaultEnvironment(),AVID_MCP_RESEARCH_TRACE:root,AVID_MCP_RESEARCH_TREE_FAILURE:fault?'1':'0',AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
 return client;
}
async function call(client,name,args){
 const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});
 events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));
 assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;
}
async function terminal(client,jobId){
 const deadline=Date.now()+600000;
 while(Date.now()<deadline){
  const value=await call(client,'avid_analysis_job_status',{jobId});
  if(['completed','failed','cancelled'].includes(value.status))return value;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw new Error(`Observation expired for ${jobId}; inspect existing job before retrying`);
}
try{
 let client=await connect();
 const job={kind:'source_clock',options:{file,expectedSha256,videoStream:0,audioStream:1}};
 const first=await call(client,'avid_start_analysis_job',{job});
 const queued=await call(client,'avid_start_analysis_job',{job});
 assert.equal(queued.status,'queued');
 const cancelled=await call(client,'avid_cancel_analysis_job',{jobId:queued.id});
 assert.equal(cancelled.status,'cancelled');
 const complete=await terminal(client,first.id);assert.equal(complete.status,'completed',JSON.stringify(complete));
 assert.equal(complete.result.verified,true);assert.equal(await sha256File(complete.result.output),complete.result.outputSha256);
 const bad=await call(client,'avid_start_analysis_job',{job:{...job,options:{...job.options,expectedSha256:'0'.repeat(64)}}});
 const failure=await terminal(client,bad.id);assert.equal(failure.status,'failed');assert.match(failure.error,/checksum changed/);
 let stopped,interruptedRun,held;
 if(testCancellation){
 const library=path.join(root,'avid-mcp-library'),before=new Set(await readdir(library));
 const active=await call(client,'avid_start_analysis_job',{job});
 const deadline=Date.now()+30000;
 while(Date.now()<deadline&&!interruptedRun){
  for(const name of await readdir(library))if(name.startsWith('source-clock-')&&!before.has(name)){
   try{if((await stat(path.join(library,name,'attempt.json'))).size>0)interruptedRun=name.slice(13);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(!interruptedRun)await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.ok(interruptedRun,'Preparation attempt must exist before cancellation');
 if(fault){held=await call(client,'avid_start_analysis_job',{job});assert.equal(held.status,'queued');}
 await call(client,'avid_cancel_analysis_job',{jobId:active.id});
 stopped=await terminal(client,active.id);assert.equal(stopped.status,'cancelled');assert.ok(stopped.workerExit);
 if(fault){
  assert.equal(stopped.schedulingPaused,true);assert.equal(stopped.treeTermination.succeeded,false);
  const waiting=await call(client,'avid_analysis_job_status',{jobId:held.id});assert.equal(waiting.status,'queued');assert.equal(waiting.schedulingPaused,true);
  const refused=await client.callTool({name:'avid_start_analysis_job',arguments:{job}});
  events.push({name:'fault-followup-start',response:refused});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));
  assert.equal(refused.isError,true);assert.match(JSON.stringify(refused),/scheduling is paused/);
  held=await call(client,'avid_cancel_analysis_job',{jobId:held.id});assert.equal(held.status,'cancelled');
 }
 }
 await client.close();client=await connect();
 for(const record of [complete,cancelled,failure,...(stopped?[stopped]:[])]){
  const restored=await call(client,'avid_analysis_job_status',{jobId:record.id});
  assert.equal(restored.status,record.status);assert.deepEqual(restored.result,record.result);assert.equal(restored.automaticReplay,false);
  assert.deepEqual(restored.treeTermination,record.treeTermination);
 }
 const runId=path.basename(path.dirname(complete.result.output)).slice('source-clock-'.length);
 const status=await call(client,'avid_source_clock_status',{runId});assert.equal(status.state,'receipt_matches_files');
 const interrupted=interruptedRun?await call(client,'avid_source_clock_status',{runId:interruptedRun}):undefined;
 if(interrupted)assert.equal(interrupted.state,'unresolved');
 assert.equal(await sha256File(file),expectedSha256);
 assert.deepEqual(await Promise.all(runtimeFiles.map(sha256File)),runtimeHashes);
 const passed=!testCancellation||process.platform==='win32'&&(fault?stopped.schedulingPaused===true:stopped.treeTermination?.succeeded===true);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed,entrypoint,runtimeFiles,runtimeHashes,runtimeUnchanged:true,testCancellation,faultInjected:fault,held,complete,cancelled,failure,stopped,interrupted,status,sourceUnchanged:true,
  scope:'Actual Sonoma queued preparation, queued cancellation without dispatch, checksum refusal, output hash and preparation receipt inspection, persisted results across fresh MCP connection. Optional --cancel requires successful Windows tree termination after attempt creation; failed termination remains failed acceptance. Abrupt parent exit, power loss and host import are separate qualifications.'},null,2),{flag:'wx'});
 assert.ok(passed,'Active cancellation or injected-failure guard acceptance failed');
 console.log(JSON.stringify({root,passed:true}));
}finally{for(const client of clients)await client.close().catch(()=>{});}
