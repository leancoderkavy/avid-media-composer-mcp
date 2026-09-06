import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const input=process.argv[2],entry=process.argv[3]??path.resolve('dist/index.js');assert.ok(input&&path.isAbsolute(input)&&path.isAbsolute(entry)&&process.argv.length<=4);
const fixture=JSON.parse(await readFile(path.join(input,'fixture.json'),'utf8')),files=['loaded','trimmed','restored'].map(stage=>path.join(input,stage+'.avb'));
const before=await Promise.all([...files,entry].map(sha256File)),root=path.resolve('.avid-mcp-analysis',`marker-trim-refusal-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const client=new Client({name:'marker-trim-refusal',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:input,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe')}}));return client;};
let client=await connect();const events=[];
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));return response;};
try{
 const response=await call('avid_snapshot_saved_bins',{bins:files});assert.ok(!response.isError,JSON.stringify(response));const snapshot=response.structuredContent.data;
 const canonical=id=>id.replace(/^urn:smpte:umid:/,'').replaceAll('.','').replaceAll('-','');
 const mobId=snapshot.bins[0].mobs.find(mob=>canonical(mob.mobId)===canonical(fixture.mobId))?.mobId;assert.ok(mobId);
 await client.close();client=await connect();
 for(const [a,b,cut,delta] of [[0,1,60,1],[1,2,61,-1]]){
  const result=await call('avid_verify_saved_trim',{baseline:snapshot.revision,candidate:snapshot.revision,baselineBin:files[a],candidateBin:files[b],mobId,cut,delta,trackOrdinals:[0,1,2]});
  assert.equal(result.isError,true);assert.equal(result.structuredContent.error.code,'SAVED_TRIM_MARKER_IDENTITIES_CHANGED');
  assert.deepEqual(result.structuredContent.error.details,{beforeMarkerCount:3,afterMarkerCount:3,exactStateVerified:false,nativeIdentityContinuityVerified:false,nextStep:'inspect_saved_and_native_markers'});
 }
 const restored=await call('avid_saved_markers',{revision:snapshot.revision,bin:files[2],mobId});assert.ok(!restored.isError);
 assert.equal(restored.structuredContent.data.total,3);assert.ok(restored.structuredContent.data.markers.every(marker=>marker.guid===null&&typeof marker.id==='string'));
 assert.deepEqual(await Promise.all([...files,entry].map(sha256File)),before);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({input,entry,snapshot,events,protectedHashes:before,inputsUnchanged:true,scope:'Saved marker identity-change refusal through MCP after reconnect. No UI execution or exact undo acceptance.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,forwardAndInverseRefused:true,nonUuidSavedIdsPreserved:true,inputsUnchanged:true}));
}finally{await client.close();}
