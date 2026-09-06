// Two explicit phases leave time for human/computer-use UI observation between writes.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';

const phase=process.argv[2];
const verifySet=phase==='verify-set',readOnly=phase==='inspect'||verifySet;
const reopenBeforeSet=phase==='set'&&process.argv[3]==='--reopen';
let recordedReopenBeforeSet=reopenBeforeSet;
assert.ok((phase==='set'&&(process.argv.length===3||(reopenBeforeSet&&process.argv.length===4)))||(['restore','inspect','verify-set'].includes(phase)&&process.argv.length===4),'Usage: set [--reopen] | restore|inspect|verify-set <absolute evidence directory>');
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const bin='MCP_Comment_70ef2dbe8bb6.avb';
const mobId='060a2b340101010501010f1013-000000-586eeafc12898806-dc71d8bbc16d-18d9';
const file=path.join(project,bin),sourceFile=path.join(project,'MCP_Color_ac0a950e18ee.avb');
const media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const root=phase==='set'?path.resolve('.avid-mcp-analysis',`native-comment-ui-${randomUUID()}`):process.argv[3];
assert.ok(path.isAbsolute(root));
if(phase==='set')await mkdir(root);
const serverEntry=path.resolve('dist/index.js'),serverEntrySha256=await sha256File(serverEntry);
const baselineHash='2cfc1d91e29110544e45ab6098acf10c53a2d74c758e9b1a1f63c50160ab2fd7';
const comment='MCP UI review - Sonoma comment visible';
const prior=phase==='restore'?JSON.parse(await readFile(path.join(root,'set.json'),'utf8')):null;
if(prior){assert.equal(prior.bin,bin);assert.equal(prior.mobId,mobId);assert.equal(prior.comment,comment);assert.equal(prior.serverEntrySha256,serverEntrySha256);}
if(!readOnly)assert.equal(await sha256File(file),prior?.savedHash??baselineHash,'Fixture changed: inspect before writing');
if(verifySet){const started=JSON.parse(await readFile(path.join(root,'set-started.json'),'utf8'));assert.equal(started.bin,bin);assert.equal(started.mobId,mobId);assert.equal(started.serverEntrySha256,serverEntrySha256);recordedReopenBeforeSet=started.reopenBeforeSet;}
const sourceHash=await sha256File(sourceFile),mediaHash=await sha256File(media);
assert.equal(sourceHash,'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');
assert.equal(mediaHash,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
// Exclusive phase claim refuses replay after either success or an uncertain prior attempt.
if(!readOnly)await writeFile(path.join(root,`${phase}-started.json`),JSON.stringify({phase,bin,mobId,serverEntrySha256,reopenBeforeSet}),{flag:'wx'});
const graph=async input=>{const result=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',input],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout).mobs;};
if(phase==='set')await copyFile(file,path.join(root,'baseline.avb'),constants.COPYFILE_EXCL);
assert.equal(await sha256File(path.join(root,'baseline.avb')),baselineHash);
const baseline=await graph(path.join(root,'baseline.avb'));
const canonical=id=>id.replace(/^urn:smpte:umid:/,'').replace(/[.-]/g,'').toLowerCase();
assert.equal(baseline.filter(m=>canonical(m.mobId)===canonical(mobId)).length,1,'Expected unique saved target before any native mutation');
const client=new Client({name:'native-comment-ui-qualification',version:'1.0'}),events=[];
const eventFile=path.join(root,`${phase==='inspect'?`inspect-${randomUUID()}`:phase}-events.json`);
await client.connect(new StdioClientTransport({command:process.execPath,args:[serverEntry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:readOnly?'inspect':'inspect,edit,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,result});await writeFile(eventFile,JSON.stringify(events,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const apply=async operation=>call('avid_native_apply',{token:(await call('avid_native_preview',{operation})).token});
const read=async()=>{const data=await call('avid_native_read',{query:'clip_columns',bin,mobId});const rows=data.columns.filter(c=>c.column_name==='Comments');assert.equal(rows.length,1);return rows[0].column_value;};
try{
 if(phase==='inspect'){
  const currentHash=await sha256File(file),currentComment=await read();
  const columns=await call('avid_native_read',{query:'bin_columns',bin});
  const decoded=await graph(file);
  assert.equal(await sha256File(file),currentHash);
  const observation={currentHash,baselineHash,savedBytesUnchanged:currentHash===baselineHash,currentComment,columns,decodedMobs:decoded,decodedMatchesBaseline:JSON.stringify(decoded)===JSON.stringify(baseline),sourceUnchanged:(await sha256File(sourceFile))===sourceHash&&(await sha256File(media))===mediaHash};
  await writeFile(path.join(root,`inspection-${randomUUID()}.json`),JSON.stringify(observation,null,2),{flag:'wx'});
  console.log(JSON.stringify(observation));
 }else{
 if(reopenBeforeSet){
  for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin})).binStateVerified,true);
  assert.deepEqual(await graph(file),baseline,'Reopening changed decoded fixture state; inspect before writing');
 }
 const expectedComment=phase==='set'?'':comment,newComment=phase==='set'||verifySet?comment:'';
 if(!verifySet){
 assert.equal(await read(),expectedComment);
 const receipt=await apply({action:'set_clip_comment',bin,mobId,expectedComment,comment:newComment});
 assert.equal(receipt.commentVerified,true,'Uncertain write: inspect events; do not replay');
 assert.equal(await read(),newComment);
 for(const action of ['close_bin','open_bin'])assert.equal((await apply({action,bin})).binStateVerified,true);
 assert.equal(await read(),newComment);
 }
 assert.equal(await read(),newComment);
 const expected=structuredClone(baseline);
 const sequence=expected.filter(m=>canonical(m.mobId)===canonical(mobId));assert.equal(sequence.length,1);
 sequence[0].comment=newComment||null;
 const resultPhase=verifySet?'set':phase;
 await copyFile(file,path.join(root,`${resultPhase}.avb`),constants.COPYFILE_EXCL);
 assert.deepEqual(await graph(path.join(root,`${resultPhase}.avb`)),expected);
 assert.equal(await sha256File(sourceFile),sourceHash);assert.equal(await sha256File(media),mediaHash);
 assert.equal(await sha256File(serverEntry),serverEntrySha256);
 await writeFile(path.join(root,`${resultPhase}.json`),JSON.stringify({phase:resultPhase,bin,mobId,comment,serverEntry,serverEntrySha256,reopenBeforeSet:recordedReopenBeforeSet,verifiedAfterHarnessFailure:verifySet,savedHash:await sha256File(file),nativeReadbackVerified:true,savedGraphVerified:true,sourceUnchanged:true,uiVerified:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,phase,bin,comment:newComment,passed:true,uiVerified:false}));
 }
}finally{await client.close();}
