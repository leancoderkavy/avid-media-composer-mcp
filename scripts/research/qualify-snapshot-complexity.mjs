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
const client=new Client({name:'snapshot-complexity-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
try{
 const result=await client.callTool({name:'avid_saved_sequence_complexity',arguments:{revision:evidence.snapshot.revision,mobId:sequence.mobId}});
 assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 assert.equal(data.sourceReferences,6);assert.equal(data.distinctSourceMobs,1);assert.equal(data.durationSeconds,4);
 assert.equal(await sha256File(snapshot),before);
 const output=path.join(root,`complexity-${randomUUID()}.json`);
 await writeFile(output,JSON.stringify({result,snapshotSha256:before,snapshotUnchanged:true,scope:'Historical native-import snapshot; current bin checksum no longer matches historical capture'},null,2));
 console.log(JSON.stringify({ok:true,output,sourceReferences:data.sourceReferences,tracks:data.trackCount}));
}finally{await client.close();}
