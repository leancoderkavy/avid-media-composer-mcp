import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis/native-aaf-import-mcp-f4ee1204-197e-406e-a665-1984bf55e00a');
const evidence=JSON.parse(await readFile(path.join(root,'evidence.json'),'utf8'));
const snapshot=path.join(root,'avid-mcp-library',`snapshot-${evidence.snapshot.revision}.json`),before=await sha256File(snapshot);
const sequence=evidence.snapshot.bins[0].mobs.find(mob=>mob.name==='MCP_PCM_AAF_Selects');assert.ok(sequence);
const fresh=process.argv.includes('--fresh');assert.ok(process.argv.slice(2).every(arg=>arg==='--fresh'));
const bin=path.join('D:/Avid Projects/MCP_Sonoma_30p_20260905',evidence.bin),binBefore=await sha256File(bin);
const client=new Client({name:'snapshot-complexity-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe')}}));
try{
 let revision=evidence.snapshot.revision,diff;
 if(fresh){
  const captured=await client.callTool({name:'avid_snapshot_saved_bins',arguments:{bins:[bin]}});assert.ok(!captured.isError,JSON.stringify(captured));
  revision=captured.structuredContent.data.revision;assert.equal(captured.structuredContent.data.bins[0].sha256,binBefore);
  diff=await client.callTool({name:'avid_diff_saved_snapshots',arguments:{baseline:evidence.snapshot.revision,candidate:revision}});assert.ok(!diff.isError,JSON.stringify(diff));
 }
 const result=await client.callTool({name:'avid_saved_sequence_complexity',arguments:{revision,mobId:sequence.mobId}});
 assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 assert.equal(data.sourceReferences,6);assert.equal(data.distinctSourceMobs,1);assert.equal(data.durationSeconds,4);
 assert.equal(await sha256File(snapshot),before);
 assert.equal(await sha256File(bin),binBefore);
 const output=path.join(root,`complexity-${randomUUID()}.json`);
 await writeFile(output,JSON.stringify({result,diff,binSha256:binBefore,binUnchanged:true,snapshotSha256:before,snapshotUnchanged:true,scope:fresh?'Fresh saved-bin snapshot with historical semantic comparison; excludes unsaved editor state':'Historical native-import snapshot; current bin checksum no longer matches historical capture'},null,2));
 console.log(JSON.stringify({ok:true,output,sourceReferences:data.sourceReferences,tracks:data.trackCount}));
}finally{await client.close();}
