import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
assert.equal(process.argv.length,2,'This harness uses only the fixed disposable fixture');
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',sourceBin='MCP_Color_ac0a950e18ee.avb',sourceFile=path.join(project,sourceBin);
const sourceMobId='060a2b340101010501010f1013-000000-4db8fc4012898806-9c3dd8bbc16d-18d9';
const sourceHash=await sha256File(sourceFile);assert.equal(sourceHash,'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');
const media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',mediaHash=await sha256File(media);
const root=path.resolve('.avid-mcp-analysis',`native-comment-${randomUUID()}`);await mkdir(root);
const name=`MCP_Comment_${randomUUID().replaceAll('-','').slice(0,12)}`,bin=name+'.avb',file=path.join(project,bin),events=[];
const client=new Client({name:'native-comment-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(tool,args)=>{const result=await client.callTool({name:tool,arguments:args},undefined,{timeout:120000});events.push({tool,args,result});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const reopen=async()=>{for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin})).binStateVerified,true);};
const graph=async()=>{const r=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(r.exitCode,0,r.stderr);return JSON.parse(r.stdout).mobs;};
try{
 await apply({action:'create_bin',name});
 assert.equal((await apply({action:'copy_clip',bin:sourceBin,mobId:sourceMobId,destinationBin:bin})).copyIdentityVerified,true);
 await reopen();
 const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);const mobId=clips[0].mob_id;assert.notEqual(mobId,sourceMobId);
 const read=async()=>{const result=await call('avid_native_read',{query:'clip_columns',bin,mobId});const comments=result.columns.filter(c=>c.column_name==='Comments');assert.equal(comments.length,1);return comments[0].column_value;};
 assert.equal(await read(),'');const baseline=await graph();await copyFile(file,path.join(root,'baseline.avb'));
 for(const [label,expectedComment,comment] of [['set','','MCP comment qualification - reviewed'],['clear','MCP comment qualification - reviewed','']]){
  const result=await apply({action:'set_clip_comment',bin,mobId,expectedComment,comment});assert.equal(result.commentVerified,true,'Uncertain write: stop and inspect retained events before any retry');
  assert.equal(await read(),comment);await reopen();assert.equal(await read(),comment);
  const expected=structuredClone(baseline),sequence=expected.find(m=>m.name===clips[0].mob_name);assert.ok(sequence);
  sequence.comment=comment||null;
  assert.deepEqual(await graph(),expected);await copyFile(file,path.join(root,`${label}.avb`));
 }
 assert.equal(await sha256File(sourceFile),sourceHash);assert.equal(await sha256File(media),mediaHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({project,bin,mobId,sourceBin,sourceHash,mediaHash,sourceUnchanged:true,setAndClearReopened:true,decodedMobsMatchExpectedComments:true,events,scope:'Temporary ASCII Comments set and clear on a new owned copy, each saved/reopened with native value readback and decoded mobs matching only the expected comment change. Not atomic undo, application restart, arbitrary metadata fields or Unicode support.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,bin,mobId,passed:true}));
}finally{await client.close();}
