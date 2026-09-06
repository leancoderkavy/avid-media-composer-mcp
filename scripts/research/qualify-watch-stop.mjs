import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {MediaLibrary} from '../../dist/library/media-library.js';
import {WatchFolders} from '../../dist/library/watch-folders.js';
import {loadConfig} from '../../dist/config.js';
const root=path.resolve('.avid-mcp-analysis',`watch-stop-${randomUUID()}`),folder=path.join(root,'media');await mkdir(folder,{recursive:true});
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',copies=[path.join(folder,'a.mp4'),path.join(folder,'b.mp4')];
assert.equal(await sha256File(source),id);for(const copy of copies)await copyFile(source,copy,1);
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'}),service=new WatchFolders(config);
await service.configure({folder});await service.configure({folder});const watches=await service.list();for(const watch of watches)await service.scan(watch.id);
const snapshots=()=>Promise.all(watches.map(watch=>readFile(path.join(root,'avid-mcp-library','watches',watch.id+'.json'),'utf8').then(JSON.parse)));
const until=async(predicate)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Watch stop qualification timed out');};
const original=MediaLibrary.prototype.index;let release,held=false;const calls=[];
MediaLibrary.prototype.index=async function(files){calls.push([...files]);const result=await original.call(this,files);if(calls.length===1)await new Promise(resolve=>{release=resolve;held=true;});return result;};
try{
 service.start(10);await until(()=>held);
 const stopping=service.stop();assert.equal(stopping.running,false);assert.equal(stopping.scanInProgress,true);release();
 await until(()=>!service.status().scanInProgress);assert.equal(calls.length,1);
 const stopped=await snapshots();assert.equal(Object.values(stopped[0].observations).filter(record=>record.mediaId).length,1);assert.equal(Object.values(stopped[1].observations).filter(record=>record.mediaId).length,0);
 service.start(10);await until(()=>calls.length===4&&!service.status().scanInProgress);service.stop();const resumed=await snapshots();
 for(const record of resumed)assert.ok(Object.values(record.observations).every(observation=>observation.mediaId===id));assert.equal(calls.filter(files=>files[0]===copies[0]).length,2);
 for(const file of [source,...copies])assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({stopping,stopped,resumed,calls,status:service.status(),sourceAndCopiesUnchanged:true,scope:'Actual production WatchFolders timers and real Sonoma MediaLibrary indexing; harness holds the first completed index promise so stop occurs before its checkpoint. Resume completes remaining files/watches without duplicate indexing. Direct module qualification, not MCP transport timing or forced-process termination.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{release?.();service.stop();MediaLibrary.prototype.index=original;}
