// Isolated lock profile referencing real, read-only saved import evidence.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.ok(process.argv.slice(2).every(arg=>arg==='--expect-stopped'));
const expectStopped=process.argv.includes('--expect-stopped');
const originalRoot=path.resolve('.avid-mcp-analysis/native-aaf-import-mcp-f4ee1204-197e-406e-a665-1984bf55e00a');
const original=JSON.parse(await readFile(path.join(originalRoot,'evidence.json'),'utf8'));
const originalAttempt=path.join(original.applied.evidenceDirectory,'attempt.json'),attemptBytes=await readFile(originalAttempt);
const attempt=JSON.parse(attemptBytes.toString('utf8'));
const files=[originalAttempt,path.resolve(attempt.project,attempt.action.bin),attempt.inspection.file,...attempt.inspection.media.map(item=>item.file)],hashes=await Promise.all(files.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`import-recovery-${randomUUID()}`),directory=path.join(root,`native-import-${randomUUID()}`);await mkdir(directory,{recursive:true});await mkdir(path.join(root,'.avid-mcp'));
const isolatedAttempt=path.join(directory,'attempt.json');await writeFile(isolatedAttempt,attemptBytes,{flag:'wx'});
const lock=path.join(root,'.avid-mcp/native-write.lock'),lockText=JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n'+JSON.stringify({state:'import-unresolved',attempt:isolatedAttempt,cause:'isolated recovery qualification'});await writeFile(lock,lockText,{flag:'wx'});
const client=new Client({name:'import-lock-recovery',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),USERPROFILE:root,AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${attempt.project};${path.resolve('.avid-mcp-analysis')}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,export'}}));
try{
 const status=await client.callTool({name:'avid_native_lock_status',arguments:{}});assert.ok(!status.isError,JSON.stringify(status));const data=status.structuredContent.data;assert.equal(data.state,'import-unresolved');assert.equal(data.recoverable,true);
 const wrong=await client.callTool({name:'avid_recover_native_import_lock',arguments:{expectedSha256:data.sha256,expectedEvidenceSha256:'0'.repeat(64)}});assert.ok(wrong.isError);assert.equal(await readFile(lock,'utf8'),lockText);
 const exported=await client.callTool({name:'avid_recover_native_export_lock',arguments:{expectedSha256:data.sha256}});assert.ok(exported.isError);assert.equal(await readFile(lock,'utf8'),lockText);
 const result=await client.callTool({name:'avid_recover_native_import_lock',arguments:{expectedSha256:data.sha256,expectedEvidenceSha256:data.evidenceSha256}});
 let after;
 if(expectStopped){
  assert.ok(!result.isError,JSON.stringify(result));assert.equal(result.structuredContent.data.released,true);
  const archive=JSON.parse(await readFile(result.structuredContent.data.archive,'utf8'));assert.equal(archive.lock.evidenceSha256,data.evidenceSha256);assert.equal(archive.importRetried,false);
  after=await client.callTool({name:'avid_native_lock_status',arguments:{}});assert.equal(after.structuredContent.data.locked,false);await assert.rejects(readFile(lock),{code:'ENOENT'});
 }else{
  assert.ok(result.isError,JSON.stringify(result));assert.match(JSON.stringify(result),/Close Avid Media Composer/);assert.equal(await readFile(lock,'utf8'),lockText);
 }
 assert.deepEqual(await Promise.all(files.map(sha256File)),hashes);assert.deepEqual(await readFile(isolatedAttempt),attemptBytes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({status,wrong,exported,result,after,expectStopped,files,hashes,filesUnchanged:true,scope:'Isolated lock fixture, actual installed Avid process observation; no import dispatch or real lock mutation'},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),expectStopped,filesUnchanged:true}));
}finally{await client.close();}
