import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.equal(process.platform,'win32');
const root=path.resolve('.avid-mcp-analysis',`stdio-caption-deadline-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),id);
const connections=[],events=[];let writing=Promise.resolve();
const connect=async()=>{const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}),client=new Client({name:'stdio-caption-deadline',version:'1'});connections.push(client);await client.connect(transport);return {client,transport};};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});events.push({name,response});const bytes=JSON.stringify(events,null,2);writing=writing.then(()=>writeFile(path.join(root,'events.json'),bytes));await writing;assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 const owner=await connect(),observer=await connect();await call(owner.client,'avid_index_media',{files:[source]});
 // Observe only the exact child owned by this SDK transport; do not target a PID lookup.
 const child=owner.transport._process;assert.equal(child?.pid,owner.transport.pid);assert.ok(child.pid);
 const kill=child.kill.bind(child),requests=[];let exit;
 child.kill=(signal)=>{requests.push({signal,at:new Date().toISOString()});return kill(signal);};
 child.once('close',(code,signal)=>{exit={code,signal:signal??null};});
 const times=Array.from({length:12},(_,index)=>index*10),pending=call(owner.client,'avid_caption_batch',{id,times}).then(result=>({result}),error=>({error:String(error)}));
 let before;const deadline=Date.now()+180000;
 while(Date.now()<deadline){before=(await call(observer.client,'avid_caption_runs',{id})).runs[0];if(before?.completedCaptions>=1)break;await new Promise(resolve=>setTimeout(resolve,200));}
 await writeFile(path.join(root,'before-close.json'),JSON.stringify(before??null,null,2),{flag:'wx'});
 assert.ok(before&&before.completedCaptions>0&&before.completedCaptions<times.length,'Did not observe an active partial batch');
 const directory=path.join(root,'avid-mcp-library',`caption-run-${before.runId}`),first=await readFile(path.join(directory,'0.json'));
 const closeStarted=Date.now();await owner.client.close();
 const exitDeadline=Date.now()+10000;while(!exit&&Date.now()<exitDeadline)await new Promise(resolve=>setTimeout(resolve,25));
 const reply=await pending;await writeFile(path.join(root,'owner-exit.json'),JSON.stringify({pid:child.pid,requests,exit,elapsedMs:Date.now()-closeStarted,reply},null,2),{flag:'wx'});
 assert.ok(exit,'Original child closure not confirmed');assert.ok(requests.some(row=>['SIGTERM','SIGKILL'].includes(row.signal)),'SDK did not exercise forced shutdown');
 const fresh=await connect(),stopped=await call(fresh.client,'avid_caption_run',{runId:before.runId});
 assert.equal(stopped.state,'partial');assert.ok(stopped.completedCaptions>=before.completedCaptions&&stopped.completedCaptions<times.length);
 assert.deepEqual(await readFile(path.join(directory,'0.json')),first);
 const prefix=await Promise.all(stopped.captions.map((_,index)=>readFile(path.join(directory,`${index}.json`))));
 const resumed=await call(fresh.client,'avid_resume_captions',{runId:before.runId});assert.equal(resumed.state,'completed');assert.equal(resumed.completedCaptions,times.length);assert.equal(resumed.reusedCaptions,stopped.completedCaptions);assert.notEqual(resumed.runId,before.runId);
 assert.deepEqual(resumed.captions.slice(0,stopped.completedCaptions),stopped.captions);
 for(let index=0;index<prefix.length;index++){assert.deepEqual(await readFile(path.join(directory,`${index}.json`)),prefix[index]);assert.deepEqual(await readFile(path.join(root,'avid-mcp-library',`caption-run-${resumed.runId}`,`${index}.json`)),prefix[index]);}
 assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({before,requests,exit,reply,stopped,resumed,prefixUnchanged:true,sourceUnchanged:true,passed:true,scope:'Real Windows SDK stdio close force-stops its own server after a partial direct Florence batch. Original child closure is confirmed before explicit fresh-session resume; verified prefix reused in a new run. Not automatic replay, arbitrary descendant containment, power loss or factual caption quality.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,reused:stopped.completedCaptions,total:times.length}));
}finally{for(const client of connections)await client.close().catch(()=>{});}
