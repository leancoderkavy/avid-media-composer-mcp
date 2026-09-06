import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const root=process.argv[2],stage=process.argv[3];assert.ok(root&&path.isAbsolute(root)&&['loaded','trimmed','restored'].includes(stage)&&process.argv.length===4);
const fixture=JSON.parse(await readFile(path.join(root,'fixture.json'),'utf8'));assert.match(fixture.bin,/^MCP_TrimMarkers_[a-f0-9]{8}\.avb$/);assert.equal(fixture.file,path.join(fixture.project,fixture.bin));
assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
const client=new Client({name:'capture-marker-trim',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
const read=async query=>{const response=await client.callTool({name:'avid_native_read',arguments:{query,bin:fixture.bin,mobId:fixture.mobId}},undefined,{timeout:120000});events.push({query,response});await writeFile(path.join(root,stage+'-events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 const viewers=await read('viewers');assert.ok(viewers.viewers.some(viewer=>viewer.mob_id===fixture.mobId&&viewer.view_type==='Record'),'Expected exact owned sequence in Record viewer');
 const markers=await read('markers'),tracks=await read('tracks');
 const file=path.join(root,stage+'.avb'),sha256=await sha256File(fixture.file);await copyFile(fixture.file,file,1);assert.equal(await sha256File(file),sha256);assert.equal(await sha256File(fixture.file),sha256);
 const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);assert.equal(graph.sha256,sha256);
 await writeFile(path.join(root,stage+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});
 assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
 await writeFile(path.join(root,stage+'-capture.json'),JSON.stringify({sha256,viewers,markers,tracks,protectedSourcesUnchanged:true,scope:'Read-only capture after separately observed UI action; no save or trim executed by this script.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,stage,sha256,viewers,markers}));
}finally{await client.close();}
