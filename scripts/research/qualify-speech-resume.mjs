import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const flags=process.argv.slice(2),hostKill=flags.includes('--host-tree-kill');assert.ok(new Set(flags).size===flags.length&&flags.filter(flag=>flag!=='--host-tree-kill').length<=1&&flags.every(flag=>["--multilingual-auto","--base","--host-tree-kill"].includes(flag)),"Choose at most one supported model flag and optional --host-tree-kill");
if(hostKill)assert.equal(process.platform,'win32','Host tree termination qualification currently requires Windows');
const options=flags.includes("--base")?{model:"base",language:"auto"}:flags.includes("--multilingual-auto")?{model:"tiny",language:"auto"}:{model:"tiny.en",language:"auto"};
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`speech-resume-${randomUUID()}`);await mkdir(root);
let transport;
const connect=async()=>{const client=new Client({name:'speech-resume-proof',version:'1.0'});transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}});await client.connect(transport);return client;};
const baselineModel=()=>options.model==='base'?'onnx-community/whisper-base':options.model==='tiny'?'onnx-community/whisper-tiny':'onnx-community/whisper-tiny.en';
let client=await connect();
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const until=async(read,accept)=>{const deadline=Date.now()+120000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);throw new Error('Job did not reach expected state');};
try{
  await call('avid_index_media',{files:[source]});
  const started=await call('avid_start_analysis_job',{job:{kind:'speech',id,start:0,end:180,options}});
  const run=await until(async()=>(await call('avid_speech_runs',{id})).runs[0],value=>value?.completedWindows>=1);assert.ok(run.completedWindows<run.plannedWindows,'Job finished before cancellation');
  let cancelled;
  if(hostKill){
    const pid=transport.pid;assert.ok(Number.isSafeInteger(pid)&&pid>0);
    const closed=new Promise(resolve=>{client.onclose=resolve;});
    const killed=await promisify(execFile)('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:30000});
    await Promise.race([closed,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned MCP host did not close')),30000);timer.unref();})]);
    assert.equal(transport.pid,null);
    cancelled={status:'host-tree-terminated',pid,stdout:killed.stdout,stderr:killed.stderr};
    client=await connect();
  }else{
    await call('avid_cancel_analysis_job',{jobId:started.id});cancelled=await until(()=>call('avid_analysis_job_status',{jobId:started.id}),value=>['cancelled','completed','failed'].includes(value.status));assert.equal(cancelled.status,'cancelled');
  }
  const before=await call('avid_speech_run',{runId:run.runId});assert.equal(before.state,'partial');assert.ok(before.completedWindows>0&&before.completedWindows<before.plannedWindows);
  const file=(runId,i)=>path.join(root,'avid-mcp-library',`speech-run-${runId}`,`${i}.json`),prefix=await Promise.all(Array.from({length:before.completedWindows},(_,i)=>readFile(file(run.runId,i),'utf8')));
  await client.close();client=await connect();assert.deepEqual(await call('avid_speech_run',{runId:run.runId}),before);
  const resumed=await call('avid_start_analysis_job',{job:{kind:'speech_resume',runId:run.runId}}),completed=await until(()=>call('avid_analysis_job_status',{jobId:resumed.id}),value=>['completed','failed','cancelled'].includes(value.status));assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.result.reusedWindows,before.completedWindows);
  for(let i=0;i<prefix.length;i++){assert.equal(await readFile(file(run.runId,i),'utf8'),prefix[i]);assert.equal(await readFile(file(completed.result.runId,i),'utf8'),prefix[i]);}
  const verified=await call('avid_speech_run',{runId:completed.result.runId});assert.equal(verified.state,'completed');assert.equal(verified.completedWindows,before.plannedWindows);assert.equal(verified.options.model,options.model);assert.equal(completed.result.model,baselineModel());
  assert.deepEqual(completed.result.languageDecision,before.languageDecision);
  const baseline=await call('avid_transcribe_media',{id,start:0,end:180,options});assert.deepEqual(completed.result.segments,baseline.segments,'Resumed segments must equal uninterrupted result');
  const replay=await client.callTool({name:'avid_resume_speech',arguments:{runId:completed.result.runId}});assert.equal(replay.isError,true);
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({options,hostKill,cancelled,before,completed,verified,baseline,prefixUnchanged:true,sourceUnchanged:true,completedResumeRejected:true,scope:`Real MCP ${hostKill?'forced Windows host process-tree termination':'worker cancellation'}/reconnect/resume and exact segment equivalence on Sonoma; not power loss, speech accuracy or broad recovery acceptance`},null,2));
  console.log(JSON.stringify({passed:true,reusedWindows:before.completedWindows,totalWindows:verified.completedWindows,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
