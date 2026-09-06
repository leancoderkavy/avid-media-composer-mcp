import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const input=process.argv[2];assert.ok(input&&path.isAbsolute(input)&&process.argv.length===3);
const fixture=JSON.parse(await readFile(path.join(input,'fixture.json'),'utf8'));
assert.match(fixture.bin,/^MCP_TrimMarkers_[a-f0-9]{8}\.avb$/);assert.equal(fixture.file,path.join(fixture.project,fixture.bin));assert.equal(await sha256File(fixture.file),'cf0d7cd433d3a9e9b09fee1800ca60abc14bcd8d7ab14ccd134acd74a94ed694');
assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
const root=path.resolve('.avid-mcp-analysis',`native-marker-update-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'native-marker-update',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const read=()=>call('avid_native_read',{query:'markers',bin:fixture.bin,mobId:fixture.mobId});
const capture=async stage=>{
 const file=path.join(root,stage+'.avb'),sha256=await sha256File(fixture.file);await copyFile(fixture.file,file,1);assert.equal(await sha256File(file),sha256);
 const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);assert.equal(graph.sha256,sha256);await writeFile(path.join(root,stage+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});return graph;
};
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin:fixture.bin})).binStateVerified,true);};
try{
 assert.deepEqual(await read(),[]);const baseline=await capture('baseline');
 const notes=[30,75].map((offset,index)=>({guid:randomUUID(),offset,track:{type:'TRACKTYPE_PICTURE',number:1},name:index?'Preserve this note':'Update this note',comment:'Original review',color:'Green'}));
 assert.equal((await apply({action:'add_markers',bin:fixture.bin,mobId:fixture.mobId,markers:notes})).markersVerified,true);await reopen();
 const original=await read();assert.equal(original.length,2);const originalGraph=await capture('original');
 const guid=notes[0].guid;assert.ok(original.some(marker=>marker.guid===guid));
 assert.equal((await apply({action:'change_marker',bin:fixture.bin,mobId:fixture.mobId,guid,comment:'Updated review',color:'Blue'})).markerChangedVerified,true);await reopen();
 assert.deepEqual(await read(),original.map(marker=>marker.guid===guid?{...marker,comment:'Updated review',color:'Blue'}:marker));await capture('updated');
 assert.equal((await apply({action:'change_marker',bin:fixture.bin,mobId:fixture.mobId,guid,comment:'Original review',color:'Green'})).markerChangedVerified,true);await reopen();
 assert.deepEqual(await read(),original);const restored=await capture('restored');assert.deepEqual(restored.mobs,originalGraph.mobs);assert.deepEqual(restored.warnings,originalGraph.warnings);
 assert.equal((await apply({action:'delete_markers',bin:fixture.bin,mobId:fixture.mobId,guids:notes.map(marker=>marker.guid)})).markersRemovedVerified,true);await reopen();assert.deepEqual(await read(),[]);
 const cleaned=await capture('cleaned');assert.deepEqual(cleaned.mobs,baseline.mobs);assert.deepEqual(cleaned.warnings,baseline.warnings);
 assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({input,notes,original,restoredMarkerGraph:true,cleanedBaselineGraph:true,sourceFilesUnchanged:true,scope:'Actual UUID marker text/color update and explicit restoration with save/reopen and outside-note preservation, followed by cleanup. One owned Windows fixture; no atomic undo or non-UUID update qualification.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,passed:true}));
}finally{await client.close();}
