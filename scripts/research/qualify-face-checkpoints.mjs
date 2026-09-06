import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorPath=process.argv[2];if(!priorPath)throw new Error('Pass qualify-people-range evidence.json');
const prior=JSON.parse(await readFile(priorPath,'utf8')),priorRoot=path.join(path.dirname(path.resolve(priorPath)),'avid-mcp-library',`people-${prior.job.result.indexId}`),request=JSON.parse(await readFile(path.join(priorRoot,'request.json'),'utf8')),baseline=JSON.parse(await readFile(path.join(priorRoot,'index.json'),'utf8'));
const root=path.resolve('.avid-mcp-analysis',`face-checkpoints-${randomUUID()}`);await mkdir(root);
const prepare=async name=>{const directory=path.join(root,name);await mkdir(directory);const frames=[];for(let i=0;i<request.frames.length;i++){const file=path.join(directory,`frame-${i}.jpg`);await copyFile(request.frames[i].file,file);frames.push({...request.frames[i],file});}return {root:directory,models:request.models,frames,checkpoint:true};};
const launch=async payload=>{const manifest=path.join(payload.root,'request.json');await writeFile(manifest,JSON.stringify(payload),{flag:'wx'});const child=spawn(path.join(request.models,'runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),[path.resolve('python/avid_faces.py'),manifest],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;assert.ok(stdout.length<8*1024*1024);});child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8192);});let live=true;const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{live=false;resolve({code,signal,stdout,stderr});});});return {child,closed,live:()=>live};};
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sourceHash=await sha256File(source),parent=await prepare('parent'),running=await launch(parent);let checkpointReady=false;const deadline=Date.now()+30000;
let resumeWorker;
try{
while(running.live()&&Date.now()<deadline){try{await access(path.join(parent.root,'faces-2.json'));checkpointReady=true;break;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
assert.ok(checkpointReady&&running.live(),'Worker finished or timed out before cancellation checkpoint');assert.ok(running.child.kill());const stopped=await running.closed;assert.notEqual(stopped.code,0);
const child=await prepare('resumed'),prefix=[];
for(let i=0;i<parent.frames.length;i++){
  let bytes;try{bytes=await readFile(path.join(parent.root,`faces-${i}.json`),'utf8');}catch(error){if(error.code==='ENOENT')break;throw error;}
  const saved=JSON.parse(bytes);assert.equal(saved.input.position,i);assert.equal(saved.input.frameSha256,await sha256File(parent.frames[i].file));
  for(const face of saved.faces){assert.match(face.crop,/^f\d{5}\.jpg$/);await copyFile(path.join(parent.root,face.crop),path.join(child.root,face.crop));}
  await writeFile(path.join(child.root,`faces-${i}.json`),bytes,{flag:'wx'});prefix.push(bytes);
}
assert.ok(prefix.length>0&&prefix.length<parent.frames.length);const resumed=await launch({...child,resume:true});resumeWorker=resumed;const finished=await resumed.closed;assert.equal(finished.code,0,finished.stderr);const result=JSON.parse(finished.stdout);assert.equal(result.reusedFrames,prefix.length);assert.equal(result.completedFrames,parent.frames.length);assert.deepEqual(result.faces,baseline.faces);
for(let i=0;i<prefix.length;i++)assert.equal(await readFile(path.join(parent.root,`faces-${i}.json`),'utf8'),prefix[i]);assert.equal(await sha256File(source),sourceHash);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({priorPath,parentRoot:parent.root,resumedRoot:child.root,stopped:{code:stopped.code,signal:stopped.signal},reusedFrames:result.reusedFrames,completedFrames:result.completedFrames,faces:result.faces.length,exactFaceEquality:true,parentUnchanged:true,sourceUnchanged:true,scope:'Actual standalone face backend interruption and new-directory checkpoint resume; not MCP people recovery or extraction resume'},null,2));
console.log(JSON.stringify({passed:true,reusedFrames:result.reusedFrames,completedFrames:result.completedFrames,faces:result.faces.length,evidence:path.join(root,'evidence.json')}));
}finally{for(const worker of [running,resumeWorker])if(worker?.live()){worker.child.kill();await worker.closed;}}
