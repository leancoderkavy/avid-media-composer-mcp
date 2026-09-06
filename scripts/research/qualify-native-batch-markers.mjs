import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',sourceBin='MCP_Color_ac0a950e18ee.avb',sourceMob='060a2b340101010501010f1013-000000-4db8fc4012898806-9c3dd8bbc16d-18d9';
const media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sourceFile=path.join(project,sourceBin),before=await Promise.all([sourceFile,media].map(sha256File));
assert.equal(before[0],'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');assert.equal(before[1],'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const scale=process.argv[2]==='--scale',resume=scale?undefined:process.argv[2];assert.ok(process.argv.length<=3&&(!resume||path.isAbsolute(resume)),'Optional --scale or absolute failed batch evidence root');
const root=resume??path.resolve('.avid-mcp-analysis',`native-batch-markers-${randomUUID()}`);if(!resume)await mkdir(root);
const previous=resume?JSON.parse(await readFile(path.join(root,'events.json'),'utf8')):null;
const recorded=previous?.find(event=>event.response.structuredContent?.data?.action?.action==='add_markers'&&event.tool==='avid_native_apply')?.response.structuredContent.data;
if(resume)assert.ok(recorded?.applicationCompleted,'Recovery requires a retained completed batch response');
const retainMarkers=scale||recorded?.action.markers.length===100;
const name=recorded?.action.bin.slice(0,-4)??`MCP_Batch_${randomUUID().replaceAll('-','').slice(0,8)}`;assert.match(name,/^MCP_Batch_[a-f0-9]{8}$/);const bin=name+'.avb',events=[];
if(resume)await writeFile(path.join(root,'resume-started.json'),JSON.stringify({bin}),{flag:'wx'});
const client=new Client({name:'native-batch-marker-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(tool,args)=>{const response=await client.callTool({name:tool,arguments:args},undefined,{timeout:120000});events.push({tool,args,response});await writeFile(path.join(root,resume?'resume-events.json':'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin})).binStateVerified,true);};
try{
 if(!resume){await apply({action:'create_bin',name});assert.equal((await apply({action:'copy_clip',bin:sourceBin,mobId:sourceMob,destinationBin:bin})).copyIdentityVerified,true);await reopen();}
 const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);const mobId=clips[0].mob_id;
 if(resume)assert.equal(mobId,recorded.action.mobId);
 const current=await call('avid_native_read',{query:'markers',bin,mobId});
 const original=resume?previous.find(event=>event.tool==='avid_native_read'&&event.args.query==='markers')?.response.structuredContent.data:current;assert.ok(Array.isArray(original));
 const tracks=await call('avid_native_read',{query:'tracks',bin,mobId});
 const markers=recorded?.action.markers??(scale?Array.from({length:100},(_,index)=>({guid:randomUUID(),offset:index,track:{type:index%2?'TRACKTYPE_SOUND':'TRACKTYPE_PICTURE',number:1},name:`Scale ${index+1}`,comment:`Reviewed batch marker ${index+1}`,color:index%2?'Yellow':'Green'})):[{guid:randomUUID(),offset:15,track:{type:'TRACKTYPE_PICTURE',number:1},name:'QC first',comment:'Batch first reviewed marker',color:'Green'},{guid:randomUUID(),offset:75,track:{type:'TRACKTYPE_PICTURE',number:1},name:'QC second',comment:'Batch second reviewed marker',color:'Yellow'}]);
 const verify=items=>{assert.equal(items.length,original.length+markers.length);for(const marker of markers){const actual=items.find(item=>item.guid===marker.guid);assert.ok(actual);assert.equal(actual.offset??0,marker.offset);for(const key of ['name','comment','color'])assert.equal(actual[key],marker[key]);assert.equal(actual.length,1);assert.equal(actual.user,'Avid MCP');assert.deepEqual({type:actual.track_label.type??'TRACKTYPE_PICTURE',number:actual.track_label.number},marker.track);}for(const marker of original)assert.ok(items.some(item=>JSON.stringify(item)===JSON.stringify(marker)));};
 const applied=resume?recorded:await apply({action:'add_markers',bin,mobId,markers});if(!resume)assert.equal(applied.markersVerified,true,JSON.stringify(applied));else verify(current);
 await reopen();const persisted=await call('avid_native_read',{query:'markers',bin,mobId});
 verify(persisted);
 let restored=null;
 if(!retainMarkers){for(const marker of markers)await apply({action:'delete_marker',bin,mobId,guid:marker.guid});await reopen();
 restored=await call('avid_native_read',{query:'markers',bin,mobId});assert.deepEqual(restored,original);}
 assert.deepEqual(await Promise.all([sourceFile,media].map(sha256File)),before);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({bin,mobId,tracks,markers,applied,persisted,restored,sourceHashes:before,sourceUnchanged:true,markerBaselineRestored:!retainMarkers,markersRetained:retainMarkers,scope:retainMarkers?'100 markers across V1/stereo A1 on one owned 30 fps copy, saved/reopened and retained for follow-up. No atomicity, cleanup, whole-bin graph preservation or cross-rate claim.':'Two markers on one owned 30 fps copied sequence, saved/reopened then explicitly deleted and marker list restored. No atomicity, whole-bin byte restoration, cross-rate or bulk-scale claim.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,bin,count:markers.length,markerBaselineRestored:!retainMarkers,markersRetained:retainMarkers,sourceUnchanged:true}));
}finally{await client.close();}
