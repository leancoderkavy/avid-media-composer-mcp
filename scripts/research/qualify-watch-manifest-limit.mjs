import {mkdir,copyFile,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`watch-manifest-limit-${randomUUID()}`),folder=path.join(root,'media');await mkdir(folder,{recursive:true});
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',copy=path.join(folder,'clip.mp4');
assert.equal(await sha256File(source),id);await copyFile(source,copy,1);await writeFile(path.join(folder,'z.txt'),'fixture',{flag:'wx'});
const events=[];
const call=async(name,args,expectedError)=>{
 const client=new Client({name:'watch-manifest-limit',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
 try{const response=await client.callTool({name,arguments:args});events.push({name,args,response});if(expectedError){assert.equal(response.isError,true);assert.equal(response.structuredContent.error.code,expectedError);return response.structuredContent.error;}assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;}finally{await client.close();}
};
const watch=await call('avid_configure_watch_folder',{options:{folder,maxFiles:1}}),directory=path.join(root,'avid-mcp-library','watches'),manifest=path.join(directory,watch.id+'.json');
const record=JSON.parse(await readFile(manifest,'utf8')),padding=path.join(folder,'padding.mp4');record.observations[padding]={signature:'fixture',stable:false,error:''};
record.observations[padding].error='界'.repeat(Math.floor((4*1024*1024-64-Buffer.byteLength(JSON.stringify(record)))/3));
const before=JSON.stringify(record);await writeFile(manifest,before);const beforeHash=await sha256File(manifest);
const refusal=await call('avid_scan_watch_folder',{watchId:watch.id},'WATCH_MANIFEST_LIMIT_EXCEEDED');assert.ok(refusal.details.bytes>refusal.details.maxBytes);assert.equal(await sha256File(manifest),beforeHash);assert.deepEqual(await readdir(directory),[watch.id+'.json']);
const listed=await call('avid_list_watch_folders',{});assert.equal(listed[0].id,watch.id);assert.equal(listed[0].unavailable,undefined);
const reset=await call('avid_configure_watch_folder',{watchId:watch.id,options:{folder,maxFiles:2}});assert.deepEqual(reset.observations,{});
assert.equal((await call('avid_scan_watch_folder',{watchId:watch.id})).pending,1);const indexed=await call('avid_scan_watch_folder',{watchId:watch.id});assert.equal(indexed.indexed[0].id,id);
assert.equal(await sha256File(source),id);assert.equal(await sha256File(copy),id);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({beforeHash,beforeBytes:Buffer.byteLength(before),refusal,listed,indexed,sourceAndCopyUnchanged:true,events,scope:'Actual MCP reconnects and Sonoma indexing with a synthetic near-limit UTF-8 observation manifest; refused oversized publication preserves readable bytes and no temporary/lock files, explicit checkpoint reset restores indexing. Not large-library storage or power-loss qualification.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
