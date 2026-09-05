// Reuse the saved snapshot from the completed native MCP import; no native write.
import path from 'node:path';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis/native-aaf-import-mcp-f4ee1204-197e-406e-a665-1984bf55e00a');
const evidence=JSON.parse(await readFile(path.join(root,'evidence.json'),'utf8'));
const bin=path.join('D:/Avid Projects/MCP_Sonoma_30p_20260905',evidence.bin);assert.equal(await sha256File(bin),evidence.savedBinSha256);
const sequence=evidence.snapshot.bins[0].mobs.find(mob=>mob.name==='MCP_PCM_AAF_Selects');assert.ok(sequence);
const client=new Client({name:'imported-aaf-ranges',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(bin),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
try{
 const result=await client.callTool({name:'avid_saved_timeline_range',arguments:{revision:evidence.snapshot.revision,mobId:sequence.mobId,start:0,end:120,limit:200}});assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 const sources=data.results.filter(item=>item.sourceStart!==undefined);
 assert.equal(data.nextAfter,null);assert.equal(sources.length,6);
 const shape=item=>[item.timelineStart,item.timelineEnd,item.sourceStart,item.overlapSourceEnd];
 const expected=[[0,60,2850,2910],[60,120,3300,3360]];
 assert.deepEqual(sources.filter(item=>item.mediaKind==='picture').map(shape),expected);
 for(const channel of [1,2]){
  const sound=sources.filter(item=>item.channelCombiner?.channelIndex===channel);assert.deepEqual(sound.map(shape),expected);
  assert.ok(sound.every(item=>item.sourceTrackId===channel&&item.channelCombiner.channelCount===2));
 }
 assert.ok(sources.every(item=>item.sourceMobId==='urn:smpte:umid:060a2b34.01010105.01010f10.13000000.a2fb387f.12888806.bab3d8bb.c16d18d9'));
 assert.equal(await sha256File(bin),evidence.savedBinSha256);
 const report=path.join(root,`ranges-${randomUUID()}.json`);await writeFile(report,JSON.stringify({result,binUnchanged:true,sourceRangesVerified:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:report,sourceRangesVerified:true,binUnchanged:true}));
}finally{await client.close();}
