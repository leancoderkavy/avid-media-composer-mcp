import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.platform,'win32','This qualification uses Windows process-tree termination');
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
let connection=await connect();const before=[];
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
 const killed=spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:15000});
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
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,pid,termination:{status:killed.status,stdout:killed.stdout},before,recovered,history,journalHashes:hashes,sourceUnchanged:true,limitations:['Forced termination of the owned Windows process tree; not power loss or parent-only death with orphaned workers','Unresolved status recovery only; QC computation is not resumed']},null,2));
 console.log(JSON.stringify({ok:true,root,statuses:recovered.map(job=>job.status)}));
}catch(error){await writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),before},null,2));throw error;}
finally{await connection.client.close();}
