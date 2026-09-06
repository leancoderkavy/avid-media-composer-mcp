import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const input=process.argv[2];assert.ok(input&&path.isAbsolute(input),'Pass absolute completed marker evidence directory');
const entry=process.argv[3]??path.resolve('dist/index.js');assert.ok(path.isAbsolute(entry)&&process.argv.length<=4);
const evidenceFile=path.join(input,'evidence.json'),evidence=JSON.parse(await readFile(evidenceFile,'utf8'));
assert.equal(evidence.markerBaselineRestored,true);
const files=['before-markers','persisted-markers','cleaned-markers'].map(label=>path.join(input,label+'.avb'));
const protectedFiles=[...files,evidenceFile,entry],before=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`saved-markers-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const client=new Client({name:'saved-marker-qualification',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:input,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect'}}));return client;};
const events=[];
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const canonical=id=>id.replace(/^urn:smpte:umid:/,'').replaceAll('.','').replaceAll('-','');
let client=await connect();
try{
 const captured=await call(client,'avid_snapshot_saved_bins',{bins:files});
 const mob=captured.bins[1].mobs.find(mob=>canonical(mob.mobId)===canonical(evidence.mobId));assert.ok(mob);
 const args={revision:captured.revision,mobId:mob.mobId,bin:files[1],limit:1};
 const first=await call(client,'avid_saved_markers',args);assert.equal(first.total,2);assert.equal(first.nextAfter,0);
 await client.close();client=await connect();
 const second=await call(client,'avid_saved_markers',{...args,after:first.nextAfter});assert.equal(second.nextAfter,null);
 for(const marker of [...first.markers,...second.markers]){
   const native=evidence.persisted.find(item=>item.guid===marker.guid);assert.ok(native);
   assert.equal(marker.location.sequenceFrame,native.offset??0);assert.equal(marker.location.trackIndex,native.track_label.number);
   assert.equal(marker.location.status,'declared_effect_input');assert.equal(marker.location.mediaKind,'picture');
   for(const field of ['name','comment','user','color'])assert.equal(marker[field],native[field]);
 }
 for(const bin of [files[0],files[2]])assert.equal((await call(client,'avid_saved_markers',{...args,bin})).total,0);
 const ambiguous=await client.callTool({name:'avid_saved_markers',arguments:{revision:captured.revision,mobId:mob.mobId}});assert.equal(ambiguous.isError,true);
 assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),before);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({captured,first,second,entry,protectedFiles,before,unchanged:true,ambiguityRefused:true,scope:'Saved Sonoma snapshots through MCP and reconnect; effect-input coordinates match retained native readback. No live write or full effect mapping claim.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,markers:2,reconnect:true,emptyBeforeAndAfter:true,unchanged:true}));
}finally{await client.close();}
