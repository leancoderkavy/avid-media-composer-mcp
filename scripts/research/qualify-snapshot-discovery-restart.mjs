import path from 'node:path';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const historical=path.resolve('.avid-mcp-analysis/native-aaf-import-mcp-f4ee1204-197e-406e-a665-1984bf55e00a');
const original=JSON.parse(await readFile(path.join(historical,'evidence.json'),'utf8'));
const revision=original.snapshot.revision,source=path.join(historical,'avid-mcp-library',`snapshot-${revision}.json`),sourceHash=await sha256File(source);
const root=path.resolve('.avid-mcp-analysis',`snapshot-discovery-restart-${randomUUID()}`),directory=path.join(root,'avid-mcp-library');await mkdir(directory,{recursive:true});
const copied=path.join(directory,`snapshot-${revision}.json`);await copyFile(source,copied);
const damaged='00000000-0000-4000-8000-000000000000';
await writeFile(path.join(directory,`snapshot-${damaged}.json`),'damaged qualification fixture',{flag:'wx'});
const abandoned=path.join(directory,`snapshot-${randomUUID()}.json.${randomUUID()}.tmp`);
await writeFile(abandoned,'{unfinished temporary fixture',{flag:'wx'});
const connect=async(allowedRoots='D:/Avid Projects/MCP_Sonoma_30p_20260905')=>{
 const client=new Client({name:'snapshot-discovery-restart',version:'1.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:allowedRoots,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));return client;
};
const call=async(client,name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const discover=async client=>{
 const first=await call(client,'avid_saved_snapshots',{limit:1});
 assert.deepEqual(first.snapshots,[]);assert.equal(first.unavailable,1);assert.equal(first.nextAfter,damaged);
 const last=await call(client,'avid_saved_snapshots',{limit:1,after:first.nextAfter});
 assert.equal(last.snapshots[0].revision,revision);assert.equal(last.nextAfter,null);return {first,last};
};
let client=await connect();
try{
 const before=await discover(client);await client.close();client=await connect();
 const after=await discover(client);assert.deepEqual(after,before);
 const sequence=original.snapshot.bins[0].mobs.find(mob=>mob.name==='MCP_PCM_AAF_Selects');
 const report=await call(client,'avid_saved_sequence_complexity',{revision:after.last.snapshots[0].revision,mobId:sequence.mobId});assert.equal(report.sourceReferences,6);
 await client.close();client=await connect(root);
 const denied=await call(client,'avid_saved_snapshots',{});assert.deepEqual(denied.snapshots,[]);assert.equal(denied.unavailable,2);
 assert.equal(await sha256File(source),sourceHash);assert.equal(await sha256File(copied),sourceHash);
 assert.equal(await readFile(abandoned,'utf8'),'{unfinished temporary fixture');
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,before,after,report,denied,sourceHash,snapshotsUnchanged:true,scope:'Copied historical Sonoma snapshot, real MCP reconnect and restricted-root discovery; no current-bin equality claim'},null,2));
 console.log(JSON.stringify({ok:true,root,revision}));
}finally{await client.close();}
