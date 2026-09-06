import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpServer} from '../../dist/http-app.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root=path.resolve('.avid-mcp-analysis',`http-caption-drain-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),id);
const token=randomUUID()+randomUUID(),server=createHttpServer({authToken:token,authenticatedRateLimitPerMinute:600,config:loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=new URL(`http://127.0.0.1:${server.address().port}/mcp`),connections=[],events=[];let writing=Promise.resolve();
const connect=async()=>{const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}),client=new Client({name:'http-caption-drain',version:'1'});connections.push({client,transport});await client.connect(transport);return {client,transport};};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,response});const bytes=JSON.stringify(events,null,2);writing=writing.then(()=>writeFile(path.join(root,'events.json'),bytes));await writing;assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 const owner=await connect(),observer=await connect();await call(owner.client,'avid_index_media',{files:[source]});
 const standalone=await call(owner.client,'avid_caption_frame',{id,time:10});
 const result=call(owner.client,'avid_caption_batch',{id,times:[0,1,2,3]}).then(value=>({value}),error=>({error:String(error)}));
 let before;const deadline=Date.now()+120000;
 while(Date.now()<deadline){const runs=await call(observer.client,'avid_caption_runs',{id});before=runs.runs[0];if(before?.completedCaptions>=1)break;await new Promise(resolve=>setTimeout(resolve,200));}
 await writeFile(path.join(root,'before-delete.json'),JSON.stringify(before??null,null,2),{flag:'wx'});
 assert.ok(before&&before.completedCaptions>=1&&before.completedCaptions<4,'Did not observe a partially completed active batch');
 const checkpoint=path.join(root,'avid-mcp-library',`caption-run-${before.runId}`,'0.json'),prefix=await readFile(checkpoint);
 const sessionId=owner.transport.sessionId;await owner.transport.terminateSession();await owner.client.close();
 const stale=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Mcp-Session-Id':sessionId,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})});await stale.text();assert.equal(stale.status,404);
 let after;const drainDeadline=Date.now()+120000;
 while(Date.now()<drainDeadline){after=await call(observer.client,'avid_caption_run',{runId:before.runId});if(after.state==='completed')break;await new Promise(resolve=>setTimeout(resolve,200));}
 assert.equal(after.state,'completed');assert.equal(after.completedCaptions,4);assert.deepEqual(await readFile(checkpoint),prefix);
 const reply=await result;assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({standalone,before,after,reply,staleStatus:stale.status,prefixUnchanged:true,sourceUnchanged:true,passed:true,scope:'Real HTTP session DELETE during a partially checkpointed direct Florence batch, with a standalone caption model also loaded. Observer session verifies completion and unchanged checkpoint/source despite closed owner session. Not forced process exit, cancellable job semantics, accuracy or allocator reclamation.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{
 for(const {client,transport} of connections){await transport.terminateSession().catch(()=>{});await client.close().catch(()=>{});}
 await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
}
