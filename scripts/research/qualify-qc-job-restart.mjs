import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-job-restart-${randomUUID()}`);await mkdir(root);
const file=path.resolve('.avid-mcp-analysis/qc-coverage-35b18d6e-126b-4a95-967a-6304da9988c7/short-audio.mkv');
const id='5bed78facbd0e2e8ba43921bd4067e0aeb505bd5c3511b599a383ed793cf2120';
assert.equal(await sha256File(file),id);
const connect=async()=>{const client=new Client({name:'qc-job-restart-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
let client=await connect();const results=[];
try{
 await call(client,'avid_index_media',{files:[file]});
 for(const options of [{end:4},{start:3,end:4,videoStream:null}])results.push(await call(client,'avid_start_analysis_job',{job:{kind:'qc',id,options}}));
 for(let i=0;i<results.length;i++){
  const deadline=Date.now()+60000;
  while(['queued','running'].includes(results[i].status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));results[i]=await call(client,'avid_analysis_job_status',{jobId:results[i].id});}
 }
 assert.equal(results[0].status,'completed');assert.equal(results[0].result.audioCoverage.samplesPerChannel,48000);assert.equal(results[0].result.audioCoverage.amountMatchesRequestedDuration,false);
 assert.equal(results[1].status,'failed');assert.match(results[1].error,/decoded no samples/);assert.equal(results[1].result,undefined);
 // Disconnect after terminal status without relying on a history request to flush writes.
 const reportHash=await sha256File(results[0].result.output);
 const artifacts=(await readdir(path.join(root,'avid-mcp-library'))).filter(n=>n.startsWith('qc-')).sort();assert.equal(artifacts.length,2);
 await client.close();client=await connect();
 const recovered=[];
 for(const job of results){const record=await call(client,'avid_analysis_job_status',{jobId:job.id});assert.equal(record.status,job.status);assert.deepEqual(record.result,job.result);assert.equal(record.error,job.error);assert.equal(record.automaticReplay,false);recovered.push(record);}
 const history=await call(client,'avid_analysis_job_history',{});assert.equal(history.records.length,2);assert.equal(history.automaticReplay,false);
 assert.equal(await sha256File(results[0].result.output),reportHash);assert.equal(await sha256File(file),id);
 assert.deepEqual((await readdir(path.join(root,'avid-mcp-library'))).filter(n=>n.startsWith('qc-')).sort(),artifacts);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,results,recovered,history,reportHash,sourceUnchanged:true,artifactsUnchanged:true,limitations:['Completed and failed QC jobs only; no interrupted-computation recovery tested']},null,2));
 console.log(JSON.stringify({ok:true,root,statuses:recovered.map(r=>r.status)}));
}catch(error){await writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),results},null,2));throw error;}finally{await client.close();}
