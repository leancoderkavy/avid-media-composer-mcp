import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_AAF_Selects_20260905.avb',mobId=process.argv[2]==='--sequence'?'060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9':'060a2b340101010501010f1013-000000-36b2e93612888806-a3b2d8bbc16d-18d9',source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==="--sequence","Only optional --sequence is supported");
const root=path.resolve('.avid-mcp-analysis',`source-viewer-${randomUUID()}`);await mkdir(root);const binHash=await sha256File(path.join(project,bin)),sourceHash=await sha256File(source);
const client=new Client({name:'source-viewer-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const before=await call('avid_native_read',{query:'viewers',bin});
 const plan=await call('avid_native_preview',{operation:{action:'show_clip',bin,mobId}}),applied=await call('avid_native_apply',{token:plan.token});
 const after=await call('avid_native_read',{query:'viewers',bin});
 assert.equal(await sha256File(path.join(project,bin)),binHash);assert.equal(await sha256File(source),sourceHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({before,applied,after,binHash,sourceHash,sourceUnchanged:true,scope:'Requested disposable Sonoma MOB loading through preview/apply. Exact viewer identity verification is recorded separately and may fail. No playback, seek, saved edit or undo claim.'},null,2));console.log(JSON.stringify({passed:applied.viewerVerified===true,root}));assert.equal(applied.viewerVerified,true);
}finally{await client.close();}
