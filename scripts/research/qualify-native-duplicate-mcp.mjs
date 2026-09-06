import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Copy_322e7c6bfa2f.avb';
const mobId='060a2b340101010501010f1013-000000-b92a4d5912898806-82a0d8bbc16d-18d9';
assert.equal(await sha256File(path.join(project,bin)),'8395e0435ad36a5197f431df7262e297e7c4815f942329cdd9d57993e4a95df1');
const protectedFiles=[path.join(project,'MCP_AAF_Selects_20260905.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'];
const hashes=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`native-duplicate-mcp-${randomUUID()}`);await mkdir(root);
const events=[],client=new Client({name:'native-duplicate-mcp',version:'1'});
const call=async(name,args,expectError=false)=>{
  const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,response});
  await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));
  assert.equal(!!response.isError,expectError,JSON.stringify(response));return response.structuredContent;
};
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),
    AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,
    AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit'}}));
  const before=(await call('avid_native_read',{query:'clips',bin})).data;
  assert.equal(before.length,2);assert.ok(before.some(row=>row.mob_id===mobId));
  const preview=(await call('avid_native_preview',{operation:{action:'duplicate_clip',bin,mobId}})).data;
  const applied=(await call('avid_native_apply',{token:preview.token})).data;
  assert.equal(applied.duplicateIdentityVerified,true,JSON.stringify(applied));assert.equal(applied.persistenceVerified,false);assert.equal(applied.sourceFidelityVerified,false);
  await call('avid_native_apply',{token:preview.token},true);
  const after=(await call('avid_native_read',{query:'clips',bin})).data;
  assert.equal(after.length,3);assert.ok(before.every(row=>after.some(item=>item.mob_id===row.mob_id&&item.mob_name===row.mob_name)));
  assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),hashes);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,bin,mobId,before,applied,after,protectedFiles,hashes,sourceUnchanged:true,
    scope:'Actual guarded single-clip duplication through stdio MCP, existing membership/name preservation and consumed-token refusal. New item remains in owned bin. No save/reopen, graph, undo or rendering claim for this new duplicate.'},null,2),{flag:'wx'});
  console.log(JSON.stringify({root,passed:true,duplicatedMobId:applied.postState.duplicatedMobId}));
}finally{await client.close();}
