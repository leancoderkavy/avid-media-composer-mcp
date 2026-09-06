import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const seed=process.argv[2],expectRefusal=process.argv[3]==='--expect-refusal';assert.ok(seed&&path.isAbsolute(seed)&&(process.argv.length===3||process.argv.length===4&&expectRefusal));
const previous=JSON.parse(await readFile(path.join(seed,'evidence.json'),'utf8')),baseline=JSON.parse(await readFile(path.join(seed,'cleaned.json'),'utf8'));
const fixture=JSON.parse(await readFile(path.join(previous.input,'fixture.json'),'utf8'));
assert.match(fixture.bin,/^MCP_TrimMarkers_[a-f0-9]{8}\.avb$/);assert.equal(fixture.file,path.join(fixture.project,fixture.bin));assert.equal(await sha256File(fixture.file),baseline.sha256);assert.equal(await sha256File(path.join(seed,'cleaned.avb')),baseline.sha256);assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
const root=path.resolve('.avid-mcp-analysis',`native-marker-unicode-${randomUUID()}`);await mkdir(root);const events=[];
const client=new Client({name:'native-marker-unicode',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const markers=()=>call('avid_native_read',{query:'markers',bin:fixture.bin,mobId:fixture.mobId});
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin:fixture.bin})).binStateVerified,true);};
const capture=async stage=>{const file=path.join(root,stage+'.avb'),sha256=await sha256File(fixture.file);await copyFile(fixture.file,file,1);assert.equal(await sha256File(file),sha256);const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);assert.equal(graph.sha256,sha256);await writeFile(path.join(root,stage+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});return graph;};
const unicode='Caf\u00e9 \u6771\u4eac \ud83c\udfac',updated='R\u00e9sum\u00e9 \u6d77\u8fba \ud83c\udf0a';
try{
 assert.deepEqual(await markers(),[]);const before=await capture('baseline');
 if(expectRefusal){
  const add={action:'add_marker',bin:fixture.bin,mobId:fixture.mobId,offset:30,track:{type:'TRACKTYPE_PICTURE',number:1},name:'Review',comment:'Review',color:'Green'};
  for(const operation of [{...add,comment:unicode},{...add,name:unicode},{action:'change_marker',bin:fixture.bin,mobId:fixture.mobId,guid:'missing-marker',comment:unicode,color:'Blue'}]){
   const response=await client.callTool({name:'avid_native_preview',arguments:{operation}});events.push({name:'avid_native_preview',args:{operation},response});assert.equal(response.isError,true);assert.match(JSON.stringify(response),/printable ASCII/);
  }
  await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.deepEqual(await markers(),[]);assert.equal(await sha256File(fixture.file),baseline.sha256);const cleaned=await capture('cleaned');assert.deepEqual(cleaned.mobs,before.mobs);assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({seed,input:previous.input,refusalVerified:true,cleanedBaselineGraph:true,sourceFilesUnchanged:true,scope:'Actual MCP preview refusal for Unicode single-marker name/comment creation and comment update. No apply requests, saved fixture bytes and protected sources unchanged.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,refusalVerified:true}));
 }else{
 const first=await apply({action:'add_marker',bin:fixture.bin,mobId:fixture.mobId,offset:30,track:{type:'TRACKTYPE_PICTURE',number:1},name:'Unicode comment probe',comment:unicode,color:'Green'});const firstId=first.result[0].guid;
 await reopen();const created=await markers();assert.equal(created.length,1);assert.equal(created[0].guid,firstId);const createdGraph=await capture('created');
 const change=await apply({action:'change_marker',bin:fixture.bin,mobId:fixture.mobId,guid:firstId,comment:updated,color:'Blue'});await reopen();const changed=await markers();assert.equal(changed.length,1);assert.equal(changed[0].guid,firstId);const changedGraph=await capture('updated');
 const second=await apply({action:'add_marker',bin:fixture.bin,mobId:fixture.mobId,offset:75,track:{type:'TRACKTYPE_PICTURE',number:1},name:unicode,comment:'Unicode name probe',color:'Green'});const secondId=second.result[0].guid;
 await reopen();const named=await markers();assert.equal(named.length,2);assert.ok(named.some(marker=>marker.guid===secondId));const namedGraph=await capture('named');
 const saved=(graph,guid)=>{const records=graph.mobs.flatMap(mob=>mob.markers??[]).filter(marker=>marker.id===guid);assert.equal(records.length,1);return records[0];};
 const findings={createdComment:{requested:unicode,native:created[0].comment,saved:saved(createdGraph,firstId).comment,verified:first.markerAddedVerified},updatedComment:{requested:updated,native:changed[0].comment,saved:saved(changedGraph,firstId).comment,verified:change.markerChangedVerified},createdName:{requested:unicode,native:named.find(marker=>marker.guid===secondId).name,saved:saved(namedGraph,secondId).name,verified:second.markerAddedVerified}};
 for(const finding of Object.values(findings))finding.exact=finding.requested===finding.native&&finding.requested===finding.saved;
 assert.equal((await apply({action:'delete_markers',bin:fixture.bin,mobId:fixture.mobId,guids:[firstId,secondId]})).markersRemovedVerified,true);await reopen();assert.deepEqual(await markers(),[]);const cleaned=await capture('cleaned');assert.deepEqual(cleaned.mobs,before.mobs);assert.deepEqual(cleaned.warnings,before.warnings);
 assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({seed,input:previous.input,findings,cleanedBaselineGraph:true,sourceFilesUnchanged:true,scope:'Actual single-marker name/comment Unicode probe and ChangeMarker update, native/readback plus independent saved inspection, followed by explicit cleanup. Reports exactness rather than assuming all Unicode is supported; no batch, arbitrary language, GUI or atomic undo claim.'},null,2),{flag:'wx'});console.log(JSON.stringify({root,findings,cleaned:true}));
 }
}finally{await client.close();}
