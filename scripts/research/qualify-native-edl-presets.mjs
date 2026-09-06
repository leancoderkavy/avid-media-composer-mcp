import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`native-edl-presets-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'edl-presets-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_CAPABILITIES:'inspect'}}));
try {
  const result=await client.callTool({name:'avid_native_read',arguments:{query:'edl_settings'}},undefined,{timeout:120000});
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,scope:'Actual inspect-only MCP EDL preset discovery. No export or preset changes.'},null,2));
  assert.ok(!result.isError,JSON.stringify(result));const names=result.structuredContent.data.settingNames;
  assert.ok(Array.isArray(names)&&names.every(name=>typeof name==='string'));
  console.log(JSON.stringify({root,settingNames:names}));
} finally {await client.close();}
