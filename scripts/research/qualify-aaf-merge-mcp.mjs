import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.ok(process.argv.length===2||(process.argv.length===4&&process.argv[2]==='--server-entry'));
const serverEntry=path.resolve(process.argv[3]??'dist/index.js'),serverEntrySha256=await sha256File(serverEntry);
const root=path.resolve('.avid-mcp-analysis',`aaf-merge-mcp-${randomUUID()}`);await mkdir(root);
const prior=JSON.parse(await readFile('.avid-mcp-analysis/aaf-reference-copy-0ee70ca5-4193-4330-987d-ce902e81d9d1/evidence.json','utf8'));
const sources=prior.sources.map(s=>({file:s.file,expectedSha256:s.sha256}));
const client=new Client({name:'aaf-merge-qualification',version:'1.0'}),calls=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[serverEntry],cwd:path.dirname(serverEntry),stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});calls.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const merged=await call('avid_merge_aaf_references',{request:{sources}});assert.equal(merged.graphVerified,true);assert.equal(merged.masters.length,2);assert.equal(merged.media.length,2);
 const built=await call('avid_build_aaf_selects',{request:{template:merged.template,expectedSha256:merged.sha256,name:'MCP_Merged_Distinct_Selects',rate:'30',tracks:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound',channels:2}],selects:merged.masters.map(m=>({mobId:m.mobId,start:2850,length:60,slotIds:[1,[2,3]]}))}});
 const inspected=await call('avid_inspect_aaf_selects',{file:built.output});assert.equal(inspected.composition.frames,120);assert.equal(new Set(inspected.composition.tracks[0].cuts.map(c=>c.mobId)).size,2);
 assert.equal(await sha256File(serverEntry),serverEntrySha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({serverEntry,serverEntrySha256,merged,built,inspected,hostImportVerified:false},null,2),{flag:'wx'});console.log(path.join(root,'evidence.json'));
}finally{await client.close();}
