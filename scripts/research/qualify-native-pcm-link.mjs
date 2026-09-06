// Creates a fresh disposable bin and links the verified source-clock MOV once.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const media=path.resolve('.avid-mcp-analysis/sonoma-source-clock-857e680b-48a7-4dc9-a52e-478f864ef2b9/Sonoma_SourceClock_Stereo.mov');
const mediaSha256=await sha256File(media);assert.equal(mediaSha256,'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb');
const projectPath='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const originalBin=path.join(projectPath,'MCP_AAF_Selects_20260905.avb'),originalBinSha256=await sha256File(originalBin);
const root=path.resolve('.avid-mcp-analysis',`native-pcm-link-${randomUUID()}`);await mkdir(root);
const binName=`MCP_PCM_${randomUUID().slice(0,8)}`,bin=`${binName}.avb`,records=[];
const client=new Client({name:'native-pcm-link-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${projectPath};${path.dirname(media)}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation});return call('avid_native_apply',{token:preview.token});};
try{
  const project=await call('avid_native_read',{query:'project'});
  assert.equal(path.resolve(project.path),path.resolve(projectPath));assert.equal(project.frame_rate.num,30);
  await action({action:'create_bin',name:binName});
  assert.deepEqual(await call('avid_native_read',{query:'clips',bin}),[]);
  const linked=await action({action:'link_media',bin,media});
  assert.equal(linked.applicationCompleted,true);assert.equal(linked.postStateRead,true);
  const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);
  const mobId=clips[0].mob_id,info=await call('avid_native_read',{query:'clip',bin,mobId});
  const columns=Object.fromEntries(info.map(column=>[column.column_name,column.column_value]));
  assert.equal(Number(columns.FPS),30);
  await action({action:'close_bin',bin});const savedBinSha256=await sha256File(path.join(projectPath,bin));
  await action({action:'open_bin',bin});
  const reopened=await call('avid_native_read',{query:'clips',bin});assert.equal(reopened.length,1);assert.equal(reopened[0].mob_id,mobId);
  assert.equal(await sha256File(originalBin),originalBinSha256);assert.equal(await sha256File(media),mediaSha256);
  const report={bin,mobId,media,mediaSha256,savedBinSha256,columns,originalBinUnchanged:true,mediaUnchanged:true,reopenedIdentityVerified:true,limitations:['No sequence or render from this new master has been tested.','Host metadata does not prove channel identity, color or source-clock fidelity.']};
  await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),...report}));
}finally{await client.close();}
