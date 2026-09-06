import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpServer} from '../../dist/http-app.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root=path.resolve('.avid-mcp-analysis',`http-job-lifecycle-${randomUUID()}`);await mkdir(root);
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(file),id);
const token=randomUUID()+randomUUID();
const server=createHttpServer({authToken:token,config:loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${token}`}}});
const client=new Client({name:'http-job-lifecycle-proof',version:'1.0'}),events=[];
const call=async(name,args)=>{
 const response=await client.callTool({name,arguments:args});events.push({name,response});
 await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));return response;
};
let job;
try{
 await client.connect(transport);
 const indexed=await call('avid_index_media',{files:[file]});assert.ok(!indexed.isError);
 const started=await call('avid_start_analysis_job',{job:{kind:'qc',id,options:{end:180}}});assert.ok(!started.isError);job=started.structuredContent.data;
 await new Promise(resolve=>setTimeout(resolve,200));
 const status=await call('avid_analysis_job_status',{jobId:job.id});
 const cancellation=await call('avid_cancel_analysis_job',{jobId:job.id});
 const sourceUnchanged=(await sha256File(file))===id;
 const passed=!status.isError&&['running','completed'].includes(status.structuredContent?.data?.status)&&!cancellation.isError;
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({started:job,status,cancellation,sourceUnchanged,passed,scope:'Real HTTP start, later status and explicit cancellation across requests. A returned job ID alone does not prove session lifetime. Source media is read-only.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed,status:status.structuredContent?.data?.status,cancelError:cancellation.isError??false}));
 assert.ok(sourceUnchanged);assert.ok(passed,'HTTP job did not remain accessible and cancellable across requests');
}finally{
 if(job)await client.callTool({name:'avid_cancel_analysis_job',arguments:{jobId:job.id}}).catch(()=>{});
 await transport.terminateSession().catch(()=>{});await client.close();
 await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
}
