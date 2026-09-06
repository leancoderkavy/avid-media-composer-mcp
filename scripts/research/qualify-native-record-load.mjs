// Isolate record-viewer loading from comment writes and bin-column changes.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';

const phase=process.argv[2];
assert.ok((phase==='prepare'&&process.argv.length===3)||(phase==='capture'&&process.argv.length===4),'Usage: prepare | capture <absolute prepared evidence directory>');
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',sourceBin='MCP_Color_ac0a950e18ee.avb';
const sourceMobId='060a2b340101010501010f1013-000000-4db8fc4012898806-9c3dd8bbc16d-18d9';
const sourceFile=path.join(project,sourceBin),media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const root=phase==='prepare'?path.resolve('.avid-mcp-analysis',`record-load-${randomUUID()}`):process.argv[3];assert.ok(path.isAbsolute(root));
if(phase==='prepare')await mkdir(root);
const prior=phase==='capture'?JSON.parse(await readFile(path.join(root,'prepared.json'),'utf8')):null;
const name=prior?.name??`MCP_Load_${randomUUID().replaceAll('-','').slice(0,8)}`;
assert.match(name,/^MCP_Load_[a-f0-9]{8}$/);
const bin=name+'.avb',file=path.join(project,bin),entry=path.resolve('dist/index.js'),entryHash=await sha256File(entry);
assert.equal(await sha256File(sourceFile),'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');
assert.equal(await sha256File(media),'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
if(prior){assert.equal(prior.entryHash,entryHash);assert.equal(prior.bin,bin);assert.equal(await sha256File(path.join(root,'control.avb')),prior.controlHash);}
await writeFile(path.join(root,`${phase}-started.json`),JSON.stringify({phase,bin,entryHash}),{flag:'wx'});
const graph=async input=>{const r=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',input],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(r.exitCode,0,r.stderr);const g=JSON.parse(r.stdout);assert.equal(g.sha256,await sha256File(input));return g;};
const capture=async label=>{const p=path.join(root,label+'.avb');await copyFile(file,p,constants.COPYFILE_EXCL);const g=await graph(p);await writeFile(path.join(root,label+'.json'),JSON.stringify(g,null,2),{flag:'wx'});return g;};
const client=new Client({name:'record-load-qualification',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,result:r});await writeFile(path.join(root,`${phase}-events.json`),JSON.stringify(events,null,2));assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin})).binStateVerified,true);};
try{
 if(phase==='prepare'){
  await apply({action:'create_bin',name});
  assert.equal((await apply({action:'copy_clip',bin:sourceBin,mobId:sourceMobId,destinationBin:bin})).copyIdentityVerified,true);
  await reopen();
  const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);
  const mobId=clips[0].mob_id;assert.notEqual(mobId,sourceMobId);
  const baseline=await capture('baseline');
  await reopen();
  const control=await capture('control');assert.deepEqual(control.mobs,baseline.mobs,'Save/reopen control changed before UI loading');
  await writeFile(path.join(root,'prepared.json'),JSON.stringify({name,bin,mobId,mobName:clips[0].mob_name,entryHash,controlHash:control.sha256,controlDecodedUnchanged:true},null,2),{flag:'wx'});
  console.log(JSON.stringify({root,bin,mobId,mobName:clips[0].mob_name,controlDecodedUnchanged:true}));
 }else{
  const viewers=await call('avid_native_read',{query:'viewers',bin});
  assert.ok(viewers.viewers.some(v=>v.mob_id===prior.mobId&&v.view_type==='Record'),'Expected fixture loaded in Record viewer before capture');
  const beforeSave=await capture('after-load-before-save');
  await reopen();
  const after=await capture('after-load-reopened'),control=await graph(path.join(root,'control.avb'));
  const changedMobs=after.mobs.filter(m=>!isDeepStrictEqual(m,control.mobs.find(b=>b.mobId===m.mobId))).map(m=>m.mobId);
  await writeFile(path.join(root,'result.json'),JSON.stringify({bin,mobId:prior.mobId,viewers,beforeSaveHash:beforeSave.sha256,afterHash:after.sha256,allDecodedMobsEqualControl:isDeepStrictEqual(after.mobs,control.mobs),changedMobs,removedMobs:control.mobs.filter(b=>!after.mobs.some(m=>m.mobId===b.mobId)).map(b=>b.mobId),scope:'Controlled save/reopen versus observed record loading and save/reopen. Graph differences are retained, not accepted as equivalent. No comment or column edits in this experiment.'},null,2),{flag:'wx'});
  console.log(JSON.stringify({root,allDecodedMobsEqualControl:isDeepStrictEqual(after.mobs,control.mobs),changedMobs}));
 }
 assert.equal(await sha256File(sourceFile),'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');
 assert.equal(await sha256File(media),'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
 assert.equal(await sha256File(entry),entryHash);
 await writeFile(path.join(root,`${phase}-source-integrity.json`),JSON.stringify({sourceBinUnchanged:true,mediaUnchanged:true,entryUnchanged:true}),{flag:'wx'});
}finally{await client.close();}
