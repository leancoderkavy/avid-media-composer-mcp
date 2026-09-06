import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const input=process.argv[2];assert.ok(input&&path.isAbsolute(input)&&process.argv.length===3);
const previous=JSON.parse(await readFile(path.join(input,'evidence.json'),'utf8'));
const fixture=JSON.parse(await readFile(path.join(previous.input,'fixture.json'),'utf8')),baseline=JSON.parse(await readFile(path.join(input,'cleaned.json'),'utf8'));
assert.match(fixture.bin,/^MCP_TrimMarkers_[a-f0-9]{8}\.avb$/);assert.equal(fixture.file,path.join(fixture.project,fixture.bin));assert.equal(await sha256File(fixture.file),baseline.sha256);assert.equal(await sha256File(path.join(input,'cleaned.avb')),baseline.sha256);
assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
const root=path.resolve('.avid-mcp-analysis',`native-single-removal-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'native-single-removal',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const read=()=>call('avid_native_read',{query:'markers',bin:fixture.bin,mobId:fixture.mobId});
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin:fixture.bin})).binStateVerified,true);};
const capture=async stage=>{
 const file=path.join(root,stage+'.avb'),sha256=await sha256File(fixture.file);await copyFile(fixture.file,file,1);assert.equal(await sha256File(file),sha256);
 const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);assert.equal(graph.sha256,sha256);await writeFile(path.join(root,stage+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});return graph;
};
try{
 assert.deepEqual(await read(),[]);
 const notes=[30,75].map((offset,index)=>({guid:randomUUID(),offset,track:{type:'TRACKTYPE_PICTURE',number:1},name:index?'Preserve note':'Remove note',comment:'Single removal qualification',color:'Green'}));
 assert.equal((await apply({action:'add_markers',bin:fixture.bin,mobId:fixture.mobId,markers:notes})).markersVerified,true);await reopen();const before=await read();assert.equal(before.length,2);const original=await capture('original');
 assert.equal((await apply({action:'delete_marker',bin:fixture.bin,mobId:fixture.mobId,guid:notes[0].guid})).markerRemovedVerified,true);await reopen();assert.deepEqual(await read(),before.filter(marker=>marker.guid!==notes[0].guid));
 const preserved=await capture('preserved'),expected=structuredClone(original.mobs);for(const mob of expected)if(mob.markers)mob.markers=mob.markers.filter(marker=>marker.id!==notes[0].guid);
 assert.deepEqual(preserved.mobs,expected);assert.deepEqual(preserved.warnings,original.warnings);
 assert.equal((await apply({action:'delete_marker',bin:fixture.bin,mobId:fixture.mobId,guid:notes[1].guid})).markerRemovedVerified,true);await reopen();assert.deepEqual(await read(),[]);
 const cleaned=await capture('cleaned');assert.deepEqual(cleaned.mobs,baseline.mobs);assert.deepEqual(cleaned.warnings,baseline.warnings);assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({input,notes,savedSurvivorVerified:true,cleanedBaselineGraph:true,sourceFilesUnchanged:true,scope:'Two explicit single UUID marker deletions with save/reopen, outside-note preservation and decoded baseline cleanup. One owned Windows fixture; no atomic undo or arbitrary ID qualification.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,passed:true}));
}finally{await client.close();}
