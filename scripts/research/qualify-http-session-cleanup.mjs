import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpServer} from '../../dist/http-app.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.platform,'win32');
const mode=process.argv[2]??'delete';assert.ok(['delete','expire','shutdown'].includes(mode));assert.ok(process.argv.length<=3);
const root=path.resolve('.avid-mcp-analysis',`http-session-${mode}-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(file),id);
const token=randomUUID()+randomUUID(),idleMs=mode==='expire'?2000:8000;
const options={authToken:token,sessionIdleTimeoutMs:idleMs,config:loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'})};
let server=createHttpServer(options);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let url=new URL(`http://127.0.0.1:${server.address().port}/mcp`);const connections=[],events=[];
const connect=async()=>{const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}),client=new Client({name:'http-session-cleanup',version:'1'});connections.push({client,transport});await client.connect(transport);return {client,transport};};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const inventory=()=>{const result=spawnSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,Name | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,0,result.stderr);const rows=JSON.parse(result.stdout);return Array.isArray(rows)?rows:[rows];};
try{
 const first=await connect();await call(first.client,'avid_index_media',{files:[file]});
 const running=await call(first.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}}),queued=await call(first.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:1}}});
 assert.equal(running.status,'running');assert.equal(queued.status,'queued');
 const jobs=[running,queued];
 if(mode==='shutdown'){
   const other=await connect();
   const otherRunning=await call(other.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}}),otherQueued=await call(other.client,'avid_start_analysis_job',{job:{kind:'qc',id,options:{end:1}}});
   assert.equal(otherRunning.status,'running');assert.equal(otherQueued.status,'queued');jobs.push(otherRunning,otherQueued);
 }
 let tree=[];
 let allWorkersHaveFfmpeg=false;
 for(let attempt=0;attempt<10;attempt++){
   const rows=inventory(),workers=rows.filter(row=>row.ParentProcessId===process.pid&&row.Name.toLowerCase()==='node.exe');assert.equal(workers.length,jobs.length/2,'Expected one owned active worker per session');
   const branches=workers.map(worker=>{
     const branch=[worker],seen=new Set([worker.ProcessId]);
     for(let index=0;index<branch.length;index++)for(const row of rows)if(row.ParentProcessId===branch[index].ProcessId&&!seen.has(row.ProcessId)){seen.add(row.ProcessId);branch.push(row);}
     return branch;
   });
   tree=branches.flat();allWorkersHaveFfmpeg=branches.every(branch=>branch.some(row=>/^ffmpeg\.exe$/i.test(row.Name)));
   if(allWorkersHaveFfmpeg)break;
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 await writeFile(path.join(root,'observed-tree.json'),JSON.stringify(tree,null,2),{flag:'wx'});
 assert.ok(allWorkersHaveFfmpeg,'Active FFmpeg was not observed under every worker');
 const sessionId=first.transport.sessionId;assert.ok(sessionId);
 if(mode==='delete')await first.transport.terminateSession();
 if(mode==='shutdown')await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 await first.client.close();
 if(mode==='expire')await new Promise(resolve=>setTimeout(resolve,idleMs*2+200));
 if(mode==='shutdown'){
   server=createHttpServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   url=new URL(`http://127.0.0.1:${server.address().port}/mcp`);
 }
 const stale=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Mcp-Session-Id':sessionId,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})});
 const staleBody=await stale.text();assert.equal(stale.status,404,staleBody);
 const next=await connect(),records=[];
 for(const job of jobs){
   let record;
   for(let attempt=0;attempt<40;attempt++){record=await call(next.client,'avid_analysis_job_status',{jobId:job.id});if(record.status==='cancelled')break;await new Promise(resolve=>setTimeout(resolve,100));}
   assert.equal(record.status,'cancelled');assert.equal(record.cancellationReason,'shutdown');assert.equal(record.result,undefined);assert.equal(record.automaticReplay,false);records.push(record);
 }
 for(let index=0;index<records.length;index+=2){assert.ok(records[index].workerExit);assert.equal(records[index].treeTermination?.succeeded,true);assert.equal(records[index+1].workerExit,undefined);}
 const after=inventory(),processChecks=tree.map(before=>({before,current:after.find(row=>row.ProcessId===before.ProcessId)??null}));
 await writeFile(path.join(root,'process-checks.json'),JSON.stringify(processChecks,null,2),{flag:'wx'});
 assert.ok(processChecks.every(row=>!row.current||row.current.CreationDate!==row.before.CreationDate),'An observed process identity survived session cleanup');
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({mode,idleMs,staleStatus:stale.status,records,processChecks,sourceUnchanged:true,passed:true,scope:'Real active FFmpeg and queued QC cleanup after HTTP session DELETE, idle expiry with closed streams, or listener closure with connections ended and a new listener. Reconnected terminal journals and observed process identity disappearance, not atomic containment, active-stream expiry, OS signals or abrupt parent loss.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,mode,passed:true}));
}finally{
 for(const {client,transport} of connections){await transport.terminateSession().catch(()=>{});await client.close().catch(()=>{});}
 await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
}
