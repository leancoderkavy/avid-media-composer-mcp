import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const priorPath=process.argv[2];if(!priorPath)throw new Error('Pass qualify-people-range evidence.json');const prior=JSON.parse(await readFile(priorPath,'utf8')),baseline=JSON.parse(await readFile(path.join(path.dirname(path.resolve(priorPath)),'avid-mcp-library',`people-${prior.job.result.indexId}`,'index.json'),'utf8'));
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`people-resume-${randomUUID()}`);await mkdir(root);
const directory=indexId=>path.join(root,'avid-mcp-library',`people-${indexId}`);
const snapshot=async indexId=>Object.fromEntries(await Promise.all((await readdir(directory(indexId))).sort().map(async name=>[name,await sha256File(path.join(directory(indexId),name))])));
const connect=async()=>{const client=new Client({name:'people-resume-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));return client;};let client=await connect();
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const until=async(read,accept)=>{const deadline=Date.now()+180000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);throw new Error('Expected people job state was not observed');};
const cancel=async(jobId,indexId)=>{
  await call('avid_cancel_analysis_job',{jobId});const stopped=await until(()=>call('avid_analysis_job_status',{jobId}),row=>['cancelled','completed','failed'].includes(row.status));assert.equal(stopped.status,'cancelled');
  if(process.platform==='win32'){
    const manifest=path.join(directory(indexId),'request.json').replaceAll("'","''"),probe=await runProcess('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${manifest}') }).Count`],{timeoutMs:10000,maxOutputBytes:4096});assert.equal(probe.exitCode,0);assert.equal(Number(probe.stdout.trim()),0,'A face backend from the cancelled job is still live');
  }
  return stopped;
};
try{
  await call('avid_index_media',{files:[source]});const firstJob=await call('avid_start_analysis_job',{job:{kind:'people',ids:[id],samples:120,threshold:0.45,range:{start:60,end:120}}});
  const firstRun=await until(async()=>(await call('avid_people_runs',{mediaId:id})).runs[0],row=>row?.extractedFrames>=2);assert.ok(firstRun.extractedFrames<120);
  const firstCancelled=await cancel(firstJob.id,firstRun.indexId),first=await call('avid_people_run',{indexId:firstRun.indexId}),firstFiles=await snapshot(first.indexId);assert.equal(first.analyzedFrames,0);
  await client.close();client=await connect();assert.deepEqual(await call('avid_people_run',{indexId:first.indexId}),first);
  const secondJob=await call('avid_start_analysis_job',{job:{kind:'people_resume',indexId:first.indexId}});
  const secondRun=await until(async()=>(await call('avid_people_runs',{mediaId:id})).runs.find(row=>row.parentIndexId===first.indexId),row=>row?.analyzedFrames>=1);assert.ok(secondRun.analyzedFrames<120);
  const secondCancelled=await cancel(secondJob.id,secondRun.indexId),second=await call('avid_people_run',{indexId:secondRun.indexId}),secondFiles=await snapshot(second.indexId);assert.ok(second.analyzedFrames>0&&second.analyzedFrames<120);
  await client.close();client=await connect();const resumedJob=await call('avid_start_analysis_job',{job:{kind:'people_resume',indexId:second.indexId}}),completed=await until(()=>call('avid_analysis_job_status',{jobId:resumedJob.id}),row=>['completed','failed','cancelled'].includes(row.status));assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.result.reusedExtractions,120);assert.equal(completed.result.reusedAnalysisFrames,second.analyzedFrames);
  const verified=await call('avid_people_run',{indexId:completed.result.indexId});assert.equal(verified.state,'completed');const final=JSON.parse(await readFile(path.join(directory(completed.result.indexId),'index.json'),'utf8'));assert.deepEqual(final.faces,baseline.faces);
  assert.deepEqual(await snapshot(first.indexId),firstFiles);assert.deepEqual(await snapshot(second.indexId),secondFiles);assert.equal(await sha256File(source),id);
  const replay=await client.callTool({name:'avid_resume_people',arguments:{indexId:completed.result.indexId}});assert.equal(replay.isError,true);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({priorPath,firstCancelled,first,secondCancelled,second,completed,verified,parentDirectoriesUnchanged:true,sourceUnchanged:true,exactFaceEquality:true,completedResumeRejected:true,scope:'Actual Windows MCP cancellation in extraction and analysis, process absence checks, reconnect and new-index resume; not broad failure/recognition acceptance'},null,2));
  console.log(JSON.stringify({passed:true,reusedExtractions:completed.result.reusedExtractions,reusedAnalysisFrames:completed.result.reusedAnalysisFrames,faces:final.faces.length,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
