import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeClient} from '../../dist/native/client.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const binary='C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe';
const serverEntry=path.resolve(process.argv[2]??'dist/index.js'),serverEntrySha256=await sha256File(serverEntry);
if(process.argv[3])assert.equal(serverEntrySha256,process.argv[3]);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Color_ac0a950e18ee.avb',file=path.resolve(project,bin);
const hash=await sha256File(file);assert.equal(hash,'8dabb465c84239d5d13ae0715500f0173f9946c171295da2a51cb09c584fd329');
const root=path.resolve('.avid-mcp-analysis',`native-bin-columns-${randomUUID()}`);await mkdir(root);
const native=new NativeClient(binary),before=(await native.call('GetBinColumnInfo',{bin_path:file})).flatMap(body=>body.column);
const client=new Client({name:'native-bin-column-qualification',version:'1.0'}),events=[];
const transport=()=>new StdioClientTransport({command:process.execPath,args:[serverEntry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:binary,AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_CAPABILITIES:'inspect'}});
await client.connect(transport());
try{
 const result=await client.callTool({name:'avid_native_read',arguments:{query:'bin_columns',bin}});events.push(result);
 assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 assert.deepEqual(data.columns,before);assert.equal(data.bin,file);
 assert.equal(data.columns.length,179);assert.equal(data.columns.find(c=>c.column_name==='Name').column_is_readonly,false);
 assert.equal(data.columns.find(c=>c.column_name==='Comments').column_is_custom,true);
 assert.ok(data.columns.some(c=>c.column_name==='   '&&c.column_is_readonly));
 const mobId='060a2b340101010501010f1013-000000-4db8fc4012898806-9c3dd8bbc16d-18d9';
 const raw=await native.call('GetMobInfo',{mob_id:mobId,includes_empty_columns:true,only_visible_columns:false});
 const values=await client.callTool({name:'avid_native_read',arguments:{query:'clip_columns',bin,mobId}});events.push(values);
 assert.ok(!values.isError,JSON.stringify(values));const clipData=values.structuredContent.data;
 assert.deepEqual(clipData.columns,raw.map(c=>({column_name:c.column_name,column_value:c.column_value??''})));
 assert.equal(clipData.columns.length,179);assert.equal(clipData.columns.find(c=>c.column_name==='Comments').column_value,'');
 await client.close();
 const reconnected=new Client({name:'native-bin-column-reconnect',version:'1.0'});
 try{
  await reconnected.connect(transport());
  const result=await reconnected.callTool({name:'avid_native_read',arguments:{query:'bin_columns',bin}});events.push(result);
  assert.ok(!result.isError,JSON.stringify(result));assert.deepEqual(result.structuredContent.data,data);
  const values=await reconnected.callTool({name:'avid_native_read',arguments:{query:'clip_columns',bin,mobId}});events.push(values);
  assert.ok(!values.isError,JSON.stringify(values));assert.deepEqual(values.structuredContent.data,clipData);
 }finally{await reconnected.close();}
 const after=(await native.call('GetBinColumnInfo',{bin_path:file})).flatMap(body=>body.column);assert.deepEqual(after,data.columns);
 assert.equal(await sha256File(file),hash);
 assert.equal(await sha256File(serverEntry),serverEntrySha256);
 const evidence=path.join(root,'evidence.json');
 await writeFile(evidence,JSON.stringify({serverEntry,serverEntrySha256,file,hash,before,events,after,reconnected:true,unchanged:true,scope:'Read-only column declarations on the qualified Windows build, compared with direct native reads and a second MCP process. No column mutation, UI visibility or arbitrary field-edit support inferred.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,evidence,columns:data.columns.length,custom:data.columns.filter(c=>c.column_is_custom).map(c=>c.column_name),reconnected:true,unchanged:true}));
}finally{await client.close();}
