import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.equal(process.platform,'win32');
const root=path.resolve('.avid-mcp-analysis',`job-worker-exit-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(file),id);
const connect=async()=>{const client=new Client({name:'job-worker-exit',version:'1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}});await client.connect(transport);return {client,transport};};
let connection=await connect();const events=[];
const call=async(name,args)=>{const response=await connection.client.callTool({name,arguments:args});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[file]});
 const first=await call('avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}}),next=await call('avid_start_analysis_job',{job:{kind:'qc',id,options:{end:1}}});
 assert.equal((await call('avid_analysis_job_status',{jobId:first.id})).status,'running');assert.equal((await call('avid_analysis_job_status',{jobId:next.id})).status,'queued');
 const pid=connection.transport.pid;assert.ok(Number.isInteger(pid)&&pid>0);
 const inventory=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid}" | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(inventory.status,0,inventory.stderr);
 const parsed=JSON.parse(inventory.stdout),workers=(Array.isArray(parsed)?parsed:[parsed]).filter(worker=>/[/\\]library[/\\]worker\.js/.test(worker.CommandLine));assert.equal(workers.length,1);const worker=workers[0];assert.ok(Number.isInteger(worker.ProcessId)&&worker.ProcessId>0);
 const current=spawnSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ProcessId = ${worker.ProcessId}" | Select-Object ProcessId,CreationDate,ParentProcessId | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(current.status,0);const matched=JSON.parse(current.stdout);assert.equal(matched.CreationDate,worker.CreationDate);assert.equal(matched.ParentProcessId,pid);
 const killed=spawnSync('taskkill.exe',['/PID',String(worker.ProcessId),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:15000});await writeFile(path.join(root,'termination.json'),JSON.stringify({worker,killed:{status:killed.status,stdout:killed.stdout,stderr:killed.stderr}},null,2),{flag:'wx'});assert.equal(killed.status,0);
 const wait=async jobId=>{for(let n=0;n<60;n++){const value=await call('avid_analysis_job_status',{jobId});if(['failed','completed','cancelled'].includes(value.status))return value;await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Worker completion not observed within observation window');};
 const failed=await wait(first.id),completed=await wait(next.id);assert.equal(failed.status,'failed');assert.equal(failed.result,undefined);assert.ok(failed.workerExit);assert.notEqual(failed.workerExit.code,0);assert.equal(completed.status,'completed');assert.deepEqual(completed.workerExit,{code:0,signal:null});
 await connection.client.close();connection=await connect();
 const recovered=[];for(const job of [failed,completed]){const record=await call('avid_analysis_job_status',{jobId:job.id});assert.equal(record.status,job.status);assert.deepEqual(record.workerExit,job.workerExit);assert.equal(record.automaticReplay,false);recovered.push(record);}
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({failed,completed,recovered,sourceUnchanged:true,scope:'Owned analysis worker tree killed while MCP parent stayed alive. Failed job retained no result, queued real MP4 QC completed, terminal exit details survived reconnect. Not parent-loss/orphan containment or power-loss recovery.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,passed:true}));
}finally{await connection.client.close();}
