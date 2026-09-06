import {NativeClient} from '../../dist/native/client.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {sha256File} from '../../dist/analysis/file-inventory.js';import {runProcess} from '../../dist/process.js';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`native-track-investigation-${randomUUID()}`);await mkdir(root);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_AAF_Selects_20260905.avb',file=path.join(project,bin);
const before=await sha256File(file),client=new NativeClient('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe'),records=[];
const read=async(method,body={})=>{const result=await client.call(method,body);records.push({method,body,result});await writeFile(path.join(root,'native.json'),JSON.stringify(records,null,2));return result;};
const current=await read('GetOpenProjectInfo');assert.equal(path.resolve(current[0].path).toLowerCase(),path.resolve(project).toLowerCase());
await read('GetBinInfo',{relative_bin_path:bin});
const clips=await read('GetListOfBinItems',{bin_relative_path:bin,bin_flags:['AllTypes']});assert.ok(clips.length<=20);
for(const clip of clips){await read('GetMobInfo',{mob_id:clip.mob_id});await read('GetMobTrackInfo',{mob_id:clip.mob_id});}
for(const primeInfo of [false,true,false,true]){
  await read('GetListOfBinItems',{bin_relative_path:bin,bin_flags:['AllTypes']});
  if(primeInfo)await read('GetMobInfo',{mob_id:clips[0].mob_id});
  await read('GetMobTrackInfo',{mob_id:clips[0].mob_id});
}
await read('GetViewerMobs');
const result=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:2*1024*1024});assert.equal(result.exitCode,0,result.stderr);const saved=JSON.parse(result.stdout);await writeFile(path.join(root,'saved.json'),JSON.stringify(saved,null,2));
assert.equal(await sha256File(file),before);
console.log(JSON.stringify({root,clips:clips.map(item=>({id:item.mob_id,name:item.name})),tracks:records.filter(row=>row.method==='GetMobTrackInfo').map(row=>({id:row.body.mob_id,bodies:row.result.length})),saved:saved.mobs.map(mob=>({id:mob.mobId,name:mob.name,type:mob.mobType,tracks:mob.tracks.length})),binUnchanged:true}));
