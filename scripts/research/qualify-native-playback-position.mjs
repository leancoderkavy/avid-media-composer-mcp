import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`native-playback-position-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'selected-clips-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_CAPABILITIES:'inspect'}}));
try {
  const result=await client.callTool({name:'avid_native_read',arguments:{query:'viewers',bin:'MCP_AAF_Selects_20260905.avb'}},undefined,{timeout:120000});
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,scope:'Inspect-only viewer position after a UI playback experiment. Position does not prove decoded video or audio.'},null,2));
  assert.ok(!result.isError,JSON.stringify(result));const names=result.structuredContent.data.viewers;
  assert.ok(Array.isArray(names)&&names.every(clip=>typeof clip.mob_id==='string'&&Number.isInteger(clip.current_frame)));
  console.log(JSON.stringify({root,viewers:names}));
} finally {await client.close();}
