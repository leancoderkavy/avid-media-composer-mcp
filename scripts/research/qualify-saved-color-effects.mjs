import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file=path.resolve('.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0/candidate-refreshed.avb');
const hash=await sha256File(file);assert.equal(hash,'ddd4ae79e3863dd4d92cd89c70a9d537c21e8b6cd00efd8dc1b35c940dc29ca5');
const root=path.resolve('.avid-mcp-analysis',`saved-color-effects-${randomUUID()}`);await mkdir(root);
const connect=async()=>{
 const client=new Client({name:'saved-color-effect-qualification',version:'1.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect'}}));return client;
};
const events=[];
const call=async(client,name,args)=>{const result=await client.callTool({name,arguments:args});events.push({name,args,result});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
let client=await connect();
try{
 const snapshot=await call(client,'avid_snapshot_saved_bins',{bins:[file]});assert.equal(snapshot.complete,false);
 const mob=snapshot.bins[0].mobs.find(m=>m.name==='MCP_Sonoma_AAF_Selects.Copy.05.Copy.01');assert.ok(mob);
 await client.close();client=await connect();
 const result=await call(client,'avid_saved_timeline_range',{revision:snapshot.revision,mobId:mob.mobId,start:0,end:120,trackOrdinal:0});
 assert.equal(result.results.length,2);
 for(const [index,node] of result.results.entries()){
  const {parametersFingerprint,keyframesFingerprint,inputReference,...declarations}=node.effect;
  assert.deepEqual(declarations,{id:'EFF2_LUTSFX',hasParameters:true,hasKeyframes:true,linearLutDeclaration:{name:'Levels scaling (full range to video levels)',bitDepth:10,black:64,white:940,invertedFlagPresent:true}});
  for(const fingerprint of [parametersFingerprint,keyframesFingerprint]){assert.equal(fingerprint.schema,1);assert.match(fingerprint.sha256,/^[a-f0-9]{64}$/);}
  assert.deepEqual(inputReference,{sourceMobId:'urn:smpte:umid:060a2b34.01010105.01010f10.13000000.36b2e936.12888806.a3b2d8bb.c16d18d9',sourceTrackId:1,sourceStart:index===0?2850:3300,length:60,rate:30,basis:'declared-equal-length-input'});
  assert.equal(node.opaque,true);assert.equal(node.timelineStart,index*60);assert.equal(node.timelineEnd,(index+1)*60);
  assert.equal(node.sourceMobId,undefined);assert.equal(node.sourceStart,undefined);
 }
 const trace=await call(client,'avid_trace_saved_sources',{revision:snapshot.revision,mobId:mob.mobId,start:30,end:90});
 assert.equal(trace.incomplete,true);
 const inputs=trace.steps.filter(step=>step.effectInputOnly);
 assert.equal(inputs.length,2);assert.deepEqual(inputs.map(step=>[step.sourceStart,step.sourceEnd]),[[2880,2910],[3300,3330]]);
 assert.ok(inputs.every(step=>step.kind==='TKFX'&&step.status==='reference'));
 assert.equal(await sha256File(file),hash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({file,hash,events,unchanged:true,scope:'Actual saved refreshed bin through MCP capture/reconnect, effect declarations and equal-length input-reference diagnostics. Rendered correspondence and parameter meaning remain unverified.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,revision:snapshot.revision,effects:result.results.map(n=>n.effect),unchanged:true}));
}finally{await client.close();}
