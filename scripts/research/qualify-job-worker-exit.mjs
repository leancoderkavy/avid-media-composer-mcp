import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.equal(process.platform,'win32');
assert.ok(process.argv.slice(2).every(arg=>['--cancel','--disconnect','--inspect-descendants'].includes(arg)),'Unknown argument');
const cancel=process.argv.includes('--cancel');
const disconnect=process.argv.includes('--disconnect');assert.ok(!(cancel&&disconnect),'Choose cancel or disconnect');
const inspectDescendants=process.argv.includes('--inspect-descendants');assert.ok(!inspectDescendants||cancel||disconnect,'Descendant qualification requires cancel or disconnect');
const processInventory=()=>{
 const response=spawnSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,Name | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(response.status,0,response.stderr);const value=JSON.parse(response.stdout);return Array.isArray(value)?value:[value];
};
const root=path.resolve('.avid-mcp-analysis',`job-worker-exit-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(file),id);
const connect=async()=>{const client=new Client({name:'job-worker-exit',version:'1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}});await client.connect(transport);return {client,transport};};
let connection=await connect();const events=[];let serverExit;
const call=async(name,args)=>{const response=await connection.client.callTool({name,arguments:args});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[file]});
 const first=await call('avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}}),next=await call('avid_start_analysis_job',{job:{kind:'qc',id,options:{end:1}}});
 assert.equal((await call('avid_analysis_job_status',{jobId:first.id})).status,'running');assert.equal((await call('avid_analysis_job_status',{jobId:next.id})).status,'queued');
 const pid=connection.transport.pid;assert.ok(Number.isInteger(pid)&&pid>0);
 const inventory=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid}" | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(inventory.status,0,inventory.stderr);
 const parsed=JSON.parse(inventory.stdout),workers=(Array.isArray(parsed)?parsed:[parsed]).filter(worker=>/[/\\]library[/\\]worker\.js/.test(worker.CommandLine));assert.equal(workers.length,1);const worker=workers[0];assert.ok(Number.isInteger(worker.ProcessId)&&worker.ProcessId>0);
 const current=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ProcessId = ${worker.ProcessId}" | Select-Object ProcessId,CreationDate,ParentProcessId | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(current.status,0);const matched=JSON.parse(current.stdout);assert.equal(matched.CreationDate,worker.CreationDate);assert.equal(matched.ParentProcessId,pid);
 let observedTree=[],treeAfter=[];
 if(inspectDescendants){
   for(let attempt=0;attempt<10;attempt++){
     const all=processInventory(),owner=all.find(value=>value.ProcessId===worker.ProcessId&&value.CreationDate===worker.CreationDate&&value.ParentProcessId===pid);assert.ok(owner,'Owned worker exited before descendant observation');
     observedTree=[owner];const seen=new Set([owner.ProcessId]);
     for(let index=0;index<observedTree.length;index++)for(const row of all)if(row.ParentProcessId===observedTree[index].ProcessId&&!seen.has(row.ProcessId)){seen.add(row.ProcessId);observedTree.push(row);}
     if(observedTree.some(value=>/^ffmpeg\.exe$/i.test(value.Name)))break;
     await new Promise(resolve=>setTimeout(resolve,100));
   }
   await writeFile(path.join(root,'observed-tree.json'),JSON.stringify(observedTree,null,2),{flag:'wx'});
   assert.ok(observedTree.some(value=>/^ffmpeg\.exe$/i.test(value.Name)),'No active ffmpeg descendant observed; cancellation proof would be too weak');
 }
 if(disconnect){
   // Research-only observation of the exact child owned by this SDK transport.
   const serverHandle=connection.transport._process;assert.equal(serverHandle?.pid,pid);
   serverHandle.once('close',(code,signal)=>{serverExit={code,signal:signal??null};});
   await connection.client.close();
   await writeFile(path.join(root,'termination.json'),JSON.stringify({worker,disconnected:true,serverExit},null,2),{flag:'wx'});
   assert.deepEqual(serverExit,{code:0,signal:null},'Server did not confirm natural closure; client force-kill is not graceful shutdown');
   connection=await connect();
 }else if(cancel){
   const cancelling=await call('avid_cancel_analysis_job',{jobId:first.id});
   assert.ok(['cancelling','cancelled'].includes(cancelling.status));
   await writeFile(path.join(root,'termination.json'),JSON.stringify({worker,cancelling},null,2),{flag:'wx'});
 }else{
   const killed=spawnSync('taskkill.exe',['/PID',String(worker.ProcessId),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:15000});await writeFile(path.join(root,'termination.json'),JSON.stringify({worker,killed:{status:killed.status,stdout:killed.stdout,stderr:killed.stderr}},null,2),{flag:'wx'});assert.equal(killed.status,0);
 }
 const wait=async jobId=>{for(let n=0;n<60;n++){const value=await call('avid_analysis_job_status',{jobId});if(['failed','completed','cancelled'].includes(value.status))return value;await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Worker completion not observed within observation window');};
 const failed=await wait(first.id);
 if(inspectDescendants){
   const all=processInventory();treeAfter=observedTree.map(before=>({before,current:all.find(value=>value.ProcessId===before.ProcessId)??null}));
   await writeFile(path.join(root,'tree-after-cancel.json'),JSON.stringify(treeAfter,null,2),{flag:'wx'});
   assert.ok(treeAfter.every(value=>!value.current||value.current.CreationDate!==value.before.CreationDate),'An observed process identity survived cancellation');
 }
 const completed=await wait(next.id);assert.equal(failed.status,cancel||disconnect?'cancelled':'failed');assert.equal(failed.result,undefined);assert.ok(failed.workerExit);assert.notEqual(failed.workerExit.code,0);
 if(disconnect){assert.equal(completed.status,'cancelled');assert.equal(completed.cancellationReason,'shutdown');assert.equal(completed.workerExit,undefined);assert.equal(completed.result,undefined);}
 else {assert.equal(completed.status,'completed');assert.deepEqual(completed.workerExit,{code:0,signal:null});}
 if(cancel||disconnect){assert.equal(failed.cancellationReason,disconnect?'shutdown':'user');assert.equal(failed.treeTermination?.succeeded,true);}
 await connection.client.close();connection=await connect();
 const recovered=[];for(const job of [failed,completed]){const record=await call('avid_analysis_job_status',{jobId:job.id});assert.equal(record.status,job.status);assert.deepEqual(record.workerExit,job.workerExit);assert.deepEqual(record.treeTermination,job.treeTermination);assert.equal(record.automaticReplay,false);recovered.push(record);}
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({mode:disconnect?'client-disconnect':cancel?'mcp-cancellation':'external-worker-exit',serverExit,failed,completed,recovered,observedTree,treeAfter,sourceUnchanged:true,scope:'Owned analysis worker stopped; queued QC completes for cancellation/worker exit or remains cancelled without dispatch for disconnect. Terminal exit and tree-attempt details survive reconnect. Optional process snapshots verify observed descendant identities disappeared; not atomic containment of all possible descendants, forced event ordering, abrupt parent-loss containment or power-loss recovery.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,passed:true}));
}finally{await connection.client.close();}
