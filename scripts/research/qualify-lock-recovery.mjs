// Uses an isolated USERPROFILE for the MCP child's lock files; never alters the real native lock.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`recovery-proof-${randomUUID()}`);await mkdir(root);
const directory=path.join(root,'attempt');await mkdir(directory);await mkdir(path.join(directory,'export'));await mkdir(path.join(root,'.avid-mcp'));
const output=path.join(directory,'export','render.mp4'),lock=path.join(root,'.avid-mcp','native-write.lock');await writeFile(output,'test artifact');
await writeFile(path.join(directory,'attempt.json'),JSON.stringify({project:root,output,action:{action:'export_mp4'}}));
const lockText=JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n'+JSON.stringify({state:'export-unresolved',output,cause:'isolated test'});await writeFile(lock,lockText);
const client=new Client({name:'recovery-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),USERPROFILE:root,AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
try{
  const status=await client.callTool({name:'avid_native_lock_status',arguments:{}});assert.ok(!status.isError,JSON.stringify(status));const data=status.structuredContent.data;
  assert.equal(data.output,output);assert.equal(data.recoverable,true);
  const result=await client.callTool({name:'avid_recover_native_export_lock',arguments:{expectedSha256:data.sha256}});
  assert.equal(result.isError,true);assert.match(JSON.stringify(result),/Close Avid Media Composer/);assert.equal(await readFile(lock,'utf8'),lockText);assert.equal(await readFile(output,'utf8'),'test artifact');
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({status,result,lockPreserved:true,outputPreserved:true,scope:'Real running-host refusal; stopped-host release covered separately'},null,2));
  console.log(JSON.stringify({passed:true,runningAvidRefused:true,lockPreserved:true,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
