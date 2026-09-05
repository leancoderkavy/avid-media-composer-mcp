import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../../dist/server.js';
import {loadConfig} from '../../dist/config.js';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const attempt='.avid-mcp-analysis/native-subclip-mcp-attempt.json';
await writeFile(attempt,JSON.stringify({started:new Date().toISOString()}),{flag:'wx'});
const server=createServer(loadConfig({AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_CAPABILITIES:'inspect,edit'}));
const client=new Client({name:'subclip-qualification',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(b),client.connect(a)]);
const evidence=[];
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});evidence.push({name,response});await writeFile('.avid-mcp-analysis/native-subclip-mcp.json',JSON.stringify(evidence,null,2));if(response.isError)throw new Error(JSON.stringify(response.structuredContent));return response.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation});return call('avid_native_apply',{token:preview.token});};
const bin='MCP_Sonoma_Media.avb';
try{
  const clips=await call('avid_native_read',{query:'clips',bin});
  const source=clips.find(clip=>clip.mob_name==='Sonoma_Escape_RoughCut_v1_preview');assert.ok(source);
  const result=await action({action:'create_subclip',bin,mobId:source.mob_id,startFrame:2850,endFrame:2880});
  assert.equal(result.postStateRead,true);const created=result.postState.created[0];
  const fields=Object.fromEntries(result.postState.info.map(row=>[row.column_name,row.column_value]));assert.equal(fields.Duration,'1:00');assert.equal(fields.Tracks,'V1 A1-2');
  await action({action:'close_bin',bin});await action({action:'open_bin',bin});
  const after=await call('avid_native_read',{query:'clip',bin,mobId:created.mob_id});
  const persisted=Object.fromEntries(after.map(row=>[row.column_name,row.column_value]));assert.equal(persisted.Duration,'1:00');assert.equal(persisted.Tracks,'V1 A1-2');
  console.log(JSON.stringify({passed:true,created,duration:persisted.Duration,tracks:persisted.Tracks,persistence:'bin close/reopen'}));
}finally{await client.close();await server.close();}
