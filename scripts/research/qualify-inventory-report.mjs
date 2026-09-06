import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const root=path.resolve('.avid-mcp-analysis',`inventory-report-${randomUUID()}`);await mkdir(root);
const connect=async capabilities=>{const client=new Client({name:'inventory-report-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:capabilities}}));return client;};
const id=await sha256File(source);let client=await connect('inspect,export,project-write');
try{
 const indexed=await client.callTool({name:'avid_index_media',arguments:{files:[source]}});assert.ok(!indexed.isError,JSON.stringify(indexed));
 const response=await client.callTool({name:'avid_media_report',arguments:{ids:[id]}});assert.ok(!response.isError,JSON.stringify(response));const result=response.structuredContent.data;
 const html=await readFile(result.output,'utf8');assert.ok(html.includes('Streams')&&html.includes('h264')&&html.includes('Camera tags, color declarations'));assert.ok(html.includes(id));
 await client.close();client=await connect('inspect');
 const directory=path.dirname(result.output),before=(await readdir(directory)).sort();
 const denied=await client.callTool({name:'avid_media_report',arguments:{ids:[id]}});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.error.code,"CAPABILITY_DENIED");assert.equal(denied.structuredContent.error.details.required,"export");assert.deepEqual((await readdir(directory)).sort(),before);assert.equal(await readFile(result.output,'utf8'),html);assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,id,sourceUnchanged:true,inspectOnlyDenied:true,denied,scope:'Actual stdio MCP Sonoma indexing/report generation and export-capability refusal; probe declarations only, not camera identity or playback fidelity'},null,2));console.log(JSON.stringify({passed:true,...result,root}));
}finally{await client.close();}
