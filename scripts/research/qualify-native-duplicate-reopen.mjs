import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Copy_322e7c6bfa2f.avb',file=path.join(project,bin);
const baselineRoot=path.resolve('.avid-mcp-analysis/native-duplicate-saved-f51d5686-5a3c-438d-918a-6dba81847acd');
const baseline=JSON.parse(await readFile(path.join(baselineRoot,bin+'.json'),'utf8'));
assert.equal(await sha256File(file),baseline.sha256,'Owned fixture changed since saved duplication; stop before host actions');
const protectedFiles=[path.join(project,'MCP_AAF_Selects_20260905.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'];
const hashes=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`native-duplicate-reopen-${randomUUID()}`);await mkdir(root);
const expected=['060a2b340101010501010f1013-000000-b92a4d5912898806-82a0d8bbc16d-18d9','060a2b340101010501010f1013-000000-b92f24fa12898806-e637d8bbc16d-18d9'].sort();
const events=[],client=new Client({name:'native-duplicate-reopen',version:'1'});
const invoke=async(name,args)=>{
  const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});
  await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));
  assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;
};
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),
    AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,
    AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
  const before=await invoke('avid_native_read',{query:'clips',bin});assert.deepEqual(before.map(v=>v.mob_id).sort(),expected);
  for(const action of ['close_bin','open_bin']){
    const preview=await invoke('avid_native_preview',{operation:{action,bin}});
    const applied=await invoke('avid_native_apply',{token:preview.token});assert.equal(applied.binStateVerified,true);
  }
  const after=await invoke('avid_native_read',{query:'clips',bin});
  const identityNames=rows=>rows.map(v=>({id:v.mob_id,name:v.mob_name})).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(identityNames(after),identityNames(before));
  const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});
  assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);
  await writeFile(path.join(root,'reopened.json'),JSON.stringify(graph,null,2),{flag:'wx'});
  assert.equal(graph.sha256,await sha256File(file));
  const sorted=g=>[...g.mobs].sort((a,b)=>a.mobId.localeCompare(b.mobId));assert.deepEqual(sorted(graph),sorted(baseline));assert.deepEqual(graph.warnings,baseline.warnings);
  assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),hashes);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,bin,before,after,beforeSha256:baseline.sha256,afterSha256:graph.sha256,
    allDecodedMobsEqual:true,protectedFiles,hashes,sourceUnchanged:true,
    scope:'Guarded MCP close/reopen of the owned saved duplicate bin. Native identities/names and every decoded saved MOB/warning preserved. Not undo-history survival, unknown AVB bytes, rendering, general duplication or application restart.'},null,2),{flag:'wx'});
  console.log(JSON.stringify({root,passed:true,allDecodedMobsEqual:true,beforeSha256:baseline.sha256,afterSha256:graph.sha256}));
}finally{await client.close();}
