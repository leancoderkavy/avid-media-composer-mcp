import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const project=await realpath('D:/Avid Projects/MCP_Sonoma_30p_20260905');
const root=path.resolve('.avid-mcp-analysis',`native-open-bins-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'open-bin-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_CAPABILITIES:'inspect'}}));
try {
  const result=await client.callTool({name:'avid_native_read',arguments:{query:'open_bins'}},undefined,{timeout:120000});
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({project,result,scope:'Actual inspect-only MCP open-bin query; no mutation or atomic inventory claim.'},null,2));
  assert.ok(!result.isError,JSON.stringify(result));
  const bins=result.structuredContent.data.bins;
  assert.ok(bins.some(item=>path.basename(item.absolute_path)==='MCP_AAF_Selects_20260905.avb'));
  for(const item of bins){assert.deepEqual(Object.keys(item),['absolute_path']);const relative=path.relative(project,item.absolute_path);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));}
  console.log(JSON.stringify({root,openEntries:bins.length,projectScoped:true}));
} finally {await client.close();}
