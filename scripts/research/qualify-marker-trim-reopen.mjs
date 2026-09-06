import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const input=process.argv[2];assert.ok(input&&path.isAbsolute(input)&&process.argv.length===3);
const fixture=JSON.parse(await readFile(path.join(input,'fixture.json'),'utf8'));
const restored=JSON.parse(await readFile(path.join(input,'restored-capture.json'),'utf8'));
assert.match(fixture.bin,/^MCP_TrimMarkers_[a-f0-9]{8}\.avb$/);assert.equal(fixture.file,path.join(fixture.project,fixture.bin));
assert.equal(await sha256File(fixture.file),restored.sha256);
assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
const root=path.resolve('.avid-mcp-analysis',`marker-trim-reopen-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'marker-trim-reopen',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const markers=()=>call('avid_native_read',{query:'markers',bin:fixture.bin,mobId:fixture.mobId});
try{
 const before=await markers();assert.deepEqual(before,restored.markers);
 for(const action of ['close_bin','open_bin']){const preview=await call('avid_native_preview',{operation:{action,bin:fixture.bin}});assert.equal((await call('avid_native_apply',{token:preview.token})).binStateVerified,true);}
 const after=await markers(),sha256=await sha256File(fixture.file),capture=path.join(root,'reopened.avb');await copyFile(fixture.file,capture,1);assert.equal(await sha256File(capture),sha256);
 const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',capture],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);assert.equal(graph.sha256,sha256);await writeFile(path.join(root,'reopened.json'),JSON.stringify(graph,null,2),{flag:'wx'});
 const prior=JSON.parse(await readFile(path.join(input,'restored.json'),'utf8'));
 assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);assert.equal(await sha256File(fixture.file),sha256);
 const evidence={input,before,after,sha256,nativeMarkersUnchanged:isDeepStrictEqual(before,after),savedMobsUnchanged:isDeepStrictEqual(prior.mobs,graph.mobs),savedWarningsUnchanged:isDeepStrictEqual(prior.warnings,graph.warnings),sourceFilesUnchanged:true,scope:'One explicit owned-bin close/reopen after trim/undo. No marker write or application restart; no general identity mapping.'};
 await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({root,...evidence}));
}finally{await client.close();}
