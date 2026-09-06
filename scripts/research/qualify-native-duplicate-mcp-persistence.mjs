import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const receipt=JSON.parse(await readFile('.avid-mcp-analysis/native-duplicate-mcp-a69f0f95-fc1b-452c-b3d4-8b60e55bb667/evidence.json','utf8'));
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Copy_322e7c6bfa2f.avb',file=path.join(project,bin);
assert.equal(receipt.bin,bin);assert.equal(receipt.passed,true);
const baseline=JSON.parse(await readFile(path.join('.avid-mcp-analysis/native-duplicate-saved-f51d5686-5a3c-438d-918a-6dba81847acd',bin+'.json'),'utf8'));
const root=path.resolve('.avid-mcp-analysis',`native-duplicate-mcp-persist-${randomUUID()}`);await mkdir(root);
const urn=id=>{assert.match(id,/^[0-9a-f]+(?:-[0-9a-f]+)+$/);const hex=id.replaceAll('-','');assert.match(hex,/^[0-9a-f]{64}$/);return 'urn:smpte:umid:'+hex.match(/.{8}/g).join('.');};
const sorted=rows=>[...rows].sort((a,b)=>a.mobId.localeCompare(b.mobId));
const parse=async label=>{
  const response=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});
  assert.equal(response.exitCode,0,response.stderr);const graph=JSON.parse(response.stdout);
  await writeFile(path.join(root,label+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});assert.equal(await sha256File(file),graph.sha256);return graph;
};
const saved=await parse('saved'),newId=urn(receipt.applied.postState.duplicatedMobId);
const added=saved.mobs.filter(m=>m.mobId===newId);assert.equal(added.length,1);
assert.deepEqual(sorted(saved.mobs.filter(m=>m.mobId!==newId)),sorted(baseline.mobs));assert.deepEqual(saved.warnings,baseline.warnings);
const original=baseline.mobs.filter(m=>m.mobId===urn(receipt.mobId));assert.equal(original.length,1);
const semantics=({name,mobId,...rest})=>rest;assert.deepEqual(semantics(added[0]),semantics(original[0]));
assert.deepEqual(await Promise.all(receipt.protectedFiles.map(sha256File)),receipt.hashes);
const events=[],client=new Client({name:'native-duplicate-persistence',version:'1'});
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});
  await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const identities=rows=>rows.map(row=>({id:row.mob_id,name:row.mob_name})).sort((a,b)=>a.id.localeCompare(b.id));
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),
    AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,
    AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit'}}));
  const before=await call('avid_native_read',{query:'clips',bin});assert.deepEqual(identities(before),identities(receipt.after));
  for(const action of ['close_bin','open_bin']){const preview=await call('avid_native_preview',{operation:{action,bin}});
    const applied=await call('avid_native_apply',{token:preview.token});assert.equal(applied.binStateVerified,true);}
  const after=await call('avid_native_read',{query:'clips',bin});assert.deepEqual(identities(after),identities(before));
  const reopened=await parse('reopened');assert.deepEqual(sorted(reopened.mobs),sorted(saved.mobs));assert.deepEqual(reopened.warnings,saved.warnings);
  assert.deepEqual(await Promise.all(receipt.protectedFiles.map(sha256File)),receipt.hashes);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,bin,newId,before,after,savedSha256:saved.sha256,reopenedSha256:reopened.sha256,
    originalDecodedMobsPreserved:true,newDecodedSequenceMatchesSource:true,allDecodedMobsPreservedAfterReopen:true,protectedFiles:receipt.protectedFiles,hashes:receipt.hashes,sourceUnchanged:true,
    scope:'Actual MCP-created duplicate saved via separately observed UI, independent graph verification, then guarded bin close/reopen. All prior decoded mobs preserved; new sequence equals selected source except name/ID. Not unknown AVB fields, undo, batch/master, application restart or rendering.'},null,2),{flag:'wx'});
  console.log(JSON.stringify({root,passed:true,savedSha256:saved.sha256,reopenedSha256:reopened.sha256}));
}finally{await client.close();}
