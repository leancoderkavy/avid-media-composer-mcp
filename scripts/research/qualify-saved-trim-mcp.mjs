import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`saved-trim-mcp-${randomUUID()}`);await mkdir(root);
const baselineBin=path.resolve('.avid-mcp-analysis/native-ui-baseline-9f2e25b7-5a40-44c8-95fd-958da0aab9ef/baseline.avb'),candidateBin=path.resolve('.avid-mcp-analysis/native-ui-trim-20260906/trimmed.avb');
const client=new Client({name:'saved-trim-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write',AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe')}}));
const invoke=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const before=await invoke('avid_snapshot_saved_bins',{bins:[baselineBin]}),after=await invoke('avid_snapshot_saved_bins',{bins:[candidateBin]});
 const args={baseline:before.revision,candidate:after.revision,baselineBin,candidateBin,mobId:'urn:smpte:umid:060a2b34.01010105.01010f10.13000000.184e5ee2.12898806.7c27d8bb.c16d18d9',cut:60,delta:1,trackOrdinals:[0,1,2]};
 const verified=await invoke('avid_verify_saved_trim',args);assert.equal(verified.verified,true);assert.equal(verified.cutAfter,61);
 const refused=await client.callTool({name:'avid_verify_saved_trim',arguments:{...args,trackOrdinals:[0]}});assert.equal(refused.isError,true);assert.ok(JSON.stringify(refused).includes('exact requested trim'));
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({before,after,verified,refused,scope:'Actual stdio capture and verification of retained Avid UI trim bins; no new editor mutation'},null,2));console.log(JSON.stringify({root,verified:true}));
}finally{await client.close();}
