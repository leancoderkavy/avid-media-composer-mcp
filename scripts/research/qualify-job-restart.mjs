import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=path.resolve('.avid-mcp-analysis',`job-restart-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const connect=async()=>{const client=new Client({name:'job-restart-proof',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
let client=await connect();
try{
  const started=await call(client,'avid_start_analysis_job',{job:{kind:'index',files:[file]}});
  let finished=started;const deadline=Date.now()+60000;
  while(['queued','running'].includes(finished.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));finished=await call(client,'avid_analysis_job_status',{jobId:started.id});}
  assert.equal(finished.status,'completed');
  const before=await call(client,'avid_analysis_job_history',{});assert.equal(before.records[0].status,'completed');
  await client.close();client=await connect();
  const recovered=await call(client,'avid_analysis_job_status',{jobId:started.id});
  assert.equal(recovered.status,'completed');assert.deepEqual(recovered.result,finished.result);
  const history=await call(client,'avid_analysis_job_history',{});assert.equal(history.records.length,1);assert.equal(history.automaticReplay,false);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({started,finished,recovered,history},null,2));
  console.log(JSON.stringify({passed:true,jobId:started.id,recoveredStatus:recovered.status,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
