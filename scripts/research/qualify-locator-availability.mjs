import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const bin='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_Load_7006b4d8.avb';
const media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const prepared='D:/Coding/avid-media-composer-mcp/.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/avid-mcp-library/source-clock-ca88aee1-c41b-43c9-8d08-7e10fc4fb6b7/prepared.mov';
const binHash=await sha256File(bin),mediaHash=await sha256File(media),preparedHash=await sha256File(prepared);
const root=path.resolve('.avid-mcp-analysis',`locator-availability-${randomUUID()}`);await mkdir(root);
const clients=[],events=[];
const connect=async()=>{
 const client=new Client({name:'saved-locator-qualification',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',
 env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[path.dirname(bin),path.dirname(media),path.dirname(prepared)].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}});
 clients.push(client);await client.connect(transport);return client;
};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 const client=await connect(),snapshot=await call(client,'avid_snapshot_saved_bins',{bins:[bin]});
 const literal=await call(client,'avid_saved_locator_availability',{revision:snapshot.revision,limit:50});
 assert.equal(literal.results.filter(row=>row.status==='unsupported_path').length,2);
 const first=await call(client,'avid_saved_locator_availability',{revision:snapshot.revision,limit:1,interpretAvidDrivePaths:true});
 await client.close();const next=await connect(),rows=[...first.results];let cursor=first.nextAfter;
 while(cursor!==null){const page=await call(next,'avid_saved_locator_availability',{revision:snapshot.revision,after:cursor,limit:2,interpretAvidDrivePaths:true});assert.ok(page.results.every(row=>row.index>cursor));rows.push(...page.results);cursor=page.nextAfter;}
 assert.equal(rows.length,first.totalDeclarations);assert.deepEqual(rows.map(row=>row.index),rows.map((_,index)=>index));
 const present=rows.filter(row=>row.status==='file_present');assert.equal(present.length,2);assert.ok(present.every(row=>row.interpretation==='avid_drive_double_slash'&&row.interpretedPath===prepared));
 assert.equal(await sha256File(bin),binHash);assert.equal(await sha256File(media),mediaHash);assert.equal(await sha256File(prepared),preparedHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,snapshotRevision:snapshot.revision,binHash,mediaHash,preparedHash,binUnchanged:true,mediaUnchanged:true,preparedUnchanged:true,literal,rows,coverage:first.coverage,
 scope:'Real saved Sonoma AVB descriptor extraction and paginated availability checks across a fresh MCP connection. Statuses describe observed saved declarations, not general online/relink or playback verification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,total:rows.length,statuses:rows.map(row=>row.status),rows}));
}finally{for(const client of clients)await client.close().catch(()=>{});}
