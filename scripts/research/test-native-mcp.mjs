import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../../dist/server.js';
import {loadConfig} from '../../dist/config.js';
import {writeFile} from 'node:fs/promises';
const server=createServer(loadConfig({AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects;D:/Sonoma Escape Edit',AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}));
const client=new Client({name:'native-host-qualification',version:'1'});
const [a,b]=InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(b),client.connect(a)]);
const receipts=[];
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});receipts.push({name,response});if(response.isError)throw new Error(JSON.stringify(response.structuredContent));return response.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation});return call('avid_native_apply',{token:preview.token});};
const bin='MCP_OpenSource_20260905.avb';
try{
  const clips=await call('avid_native_read',{query:'clips',bin});
  if(clips.length)throw new Error('Disposable bin must be empty; do not replay this test');
  const linked=await action({action:'link_media',bin,media:'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'});
  const mobId=linked.result[0].mob_id;
  await call('avid_native_read',{query:'clip',bin,mobId});
  const marker=await action({action:'add_marker',bin,mobId,offset:30,track:{type:'TRACKTYPE_PICTURE',number:1},comment:'Open-source native MCP qualification',color:'Green',name:'MCP_TEST'});
  const guid=marker.result[0].guid;
  await action({action:'change_marker',bin,mobId,guid,comment:'Updated via native MCP',color:'Blue'});
  await call('avid_native_read',{query:'markers',bin,mobId});
  await action({action:'delete_marker',bin,mobId,guid});
  await action({action:'show_clip',bin,mobId});
  console.log(JSON.stringify({completed:true,calls:receipts.length,mobId}));
}finally{
  await writeFile('.avid-mcp-analysis/native-mcp-20260905.json',JSON.stringify(receipts,null,2));
  await client.close();await server.close();
}
