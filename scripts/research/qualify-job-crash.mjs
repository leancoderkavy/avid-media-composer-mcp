import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.platform,'win32','This qualification uses Windows process-tree termination');
const parentOnly=process.argv.includes('--parent-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--parent-only'),'Unknown argument');
const root=path.resolve('.avid-mcp-analysis',`job-crash-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(file),id);
const connect=async()=>{
 const client=new Client({name:'job-crash-proof',version:'1.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}});
 await client.connect(transport);return {client,transport};
};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
let connection=await connect();const before=[];let ownedWorkers=[];
try{
 await call(connection.client,'avid_index_media',{files:[file]});
 const running=await call(connection.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}});
 const queued=await call(connection.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:1}}});
 for(const job of [running,queued])before.push(await call(connection.client,'avid_analysis_job_status',{jobId:job.id}));
 assert.deepEqual(before.map(job=>job.status),['running','queued']);
 const journalFiles=before.map(job=>path.join(root,'avid-mcp-library','jobs',`${job.id}.json`));
 const stored=await Promise.all(journalFiles.map(async filename=>JSON.parse(await readFile(filename,'utf8'))));
 assert.deepEqual(stored.map(job=>job.status),['running','queued']);
 // Only the process created by this transport and its descendants are terminated.
 const pid=connection.transport.pid;assert.ok(Number.isInteger(pid)&&pid>0);
 if(parentOnly){
  const inventory=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid}" | Select-Object ProcessId,CreationDate | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(inventory.status,0,inventory.stderr);
  const parsed=JSON.parse(inventory.stdout);ownedWorkers=Array.isArray(parsed)?parsed:[parsed];
  assert.ok(ownedWorkers.length>0);
 }
 const killed=spawnSync('taskkill.exe',['/PID',String(pid),...(parentOnly?[]:['/T']),'/F'],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(killed.status,0,`${killed.stdout}\n${killed.stderr}`);
 await connection.client.close();
 const hashes=await Promise.all(journalFiles.map(sha256File));
 connection=await connect();
 const recovered=[];
 for(const job of before){
  const record=await call(connection.client,'avid_analysis_job_status',{jobId:job.id});
  assert.equal(record.status,'unresolved');assert.equal(record.recordedStatus,job.status);
  assert.equal(record.automaticReplay,false);assert.equal(record.result,undefined);recovered.push(record);
 }
 const history=await call(connection.client,'avid_analysis_job_history',{});
 assert.equal(history.records.length,2);assert.ok(history.records.every(record=>record.status==='unresolved'));
 // Requests in the new session must not rewrite or replay the abandoned records.
 assert.deepEqual(await Promise.all(journalFiles.map(sha256File)),hashes);
 assert.equal(await sha256File(file),id);
 const damagedId='00000000-0000-4000-8000-000000000000';
 await writeFile(path.join(root,'avid-mcp-library','jobs',`${damagedId}.json`),'invalid interrupted fixture',{flag:'wx'});
 const damagedPage=await call(connection.client,'avid_analysis_job_history',{limit:1});
 assert.deepEqual(damagedPage.records,[]);assert.equal(damagedPage.unreadable,1);assert.equal(damagedPage.nextAfter,damagedId);
 const healthyPage=await call(connection.client,'avid_analysis_job_history',{after:damagedPage.nextAfter});
 assert.equal(healthyPage.records.length,2);assert.ok(healthyPage.records.every(record=>record.status==='unresolved'));
 if(parentOnly){
  const live=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid}" | Select-Object ProcessId,CreationDate | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(live.status,0,live.stderr);
  await writeFile(path.join(root,'worker-observation.json'),JSON.stringify({ownedWorkers,after:live.stdout},null,2));
  assert.equal(live.stdout.trim(),'','Analysis worker survived parent-only termination');
 }
 const qcArtifacts=(await readdir(path.join(root,'avid-mcp-library'))).filter(name=>name.startsWith('qc-'));
 assert.deepEqual(qcArtifacts,[],'Interrupted QC left report artifacts requiring review');
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,pid,parentOnly,ownedWorkers,termination:{status:killed.status,stdout:killed.stdout},before,recovered,history,damagedPage,healthyPage,journalHashes:hashes,qcArtifacts,sourceUnchanged:true,limitations:[parentOnly?'Parent-only forced termination; child absence at later observation does not establish prompt termination or all descendant behavior':'Forced termination of the owned Windows process tree; not power loss or parent-only death with orphaned workers','Unresolved status recovery only; QC computation is not resumed']},null,2));
 console.log(JSON.stringify({ok:true,root,statuses:recovered.map(job=>job.status)}));
}catch(error){await writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),before},null,2));throw error;}
finally{
 await connection.client.close();
 // Clean up only still-matching processes observed as this harness server's children.
 for(const worker of ownedWorkers){
  assert.ok(Number.isInteger(worker.ProcessId)&&worker.ProcessId>0);
  const current=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ProcessId = ${worker.ProcessId}" | Select-Object ProcessId,CreationDate | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});
  if(current.status===0&&current.stdout.trim()&&JSON.parse(current.stdout).CreationDate===worker.CreationDate){
   const cleanup=spawnSync('taskkill.exe',['/PID',String(worker.ProcessId),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:15000});
   await writeFile(path.join(root,`cleanup-${worker.ProcessId}.json`),JSON.stringify({status:cleanup.status,stdout:cleanup.stdout,stderr:cleanup.stderr}));
  }
 }
}
