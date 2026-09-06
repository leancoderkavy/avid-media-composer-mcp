// Inspect the saved PCM fixture through actual MCP; no native editor writes.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const bin='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_PCMAAF_dcf153d5.avb',before=await sha256File(bin);
const root=path.resolve('.avid-mcp-analysis',`stereo-timeline-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'stereo-timeline-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(bin),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
const records=[];
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});records.push({name,args,result});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const snapshot=await call('avid_snapshot_saved_bins',{bins:[bin]});
 const sequence=snapshot.bins[0].mobs.find(mob=>mob.name==='MCP_PCM_AAF_Selects');assert.ok(sequence);
 const args={revision:snapshot.revision,mobId:sequence.mobId,start:45,end:75,trackOrdinal:1,limit:2};
 const first=await call('avid_saved_timeline_range',args);assert.equal(first.results.length,2);assert.notEqual(first.nextAfter,null);
 const second=await call('avid_saved_timeline_range',{...args,after:first.nextAfter});assert.equal(second.results.length,2);assert.equal(second.nextAfter,null);
 const nodes=[...first.results,...second.results];
 assert.deepEqual(nodes.map(n=>[n.channelCombiner.channelIndex,n.sourceTrackId,n.overlapStart,n.overlapEnd,n.overlapSourceStart,n.overlapSourceEnd]),[[1,1,45,60,2895,2910],[2,2,45,60,2895,2910],[1,1,60,75,3300,3315],[2,2,60,75,3300,3315]]);
 const usage=await call('avid_saved_source_usage',{revision:snapshot.revision,sourceMobId:nodes[0].sourceMobId});
 const audioUsages=usage.usages.filter(use=>use.mobId===sequence.mobId&&use.mediaKind==='sound');assert.equal(audioUsages.length,4);assert.deepEqual(audioUsages.map(use=>use.channelCombiner.channelIndex),[1,2,1,2]);
 const trace=await call('avid_trace_saved_sources',{revision:snapshot.revision,mobId:sequence.mobId,start:45,end:75,bin:snapshot.bins[0].file});
 const tracedAudio=trace.steps.filter(step=>step.depth===0&&step.mediaKind==='sound');
 assert.deepEqual(tracedAudio.map(step=>[step.channelCombiner.channelIndex,step.sourceTrackId,step.start,step.end,step.sourceStart,step.sourceEnd]),[[1,1,45,60,2895,2910],[2,2,45,60,2895,2910],[1,1,60,75,3300,3315],[2,2,60,75,3300,3315]]);
 assert.ok(!trace.steps.some(step=>['overlapping_nodes','unsupported_channel_group'].includes(step.status)));
 assert.ok(trace.steps.some(step=>step.depth>0&&step.mediaKind==='sound'));
 assert.ok(!first.warnings.some(w=>w.mobId===sequence.mobId&&w.track===1));assert.equal(await sha256File(bin),before);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({snapshot,first,second,usage,trace,stereoSourceTraceVerified:true,binSha256:before,binUnchanged:true,stereoSourceRangesVerified:true,records},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),stereoSourceRangesVerified:true,stereoSourceTraceVerified:true,traceSteps:trace.steps.length,traceIncomplete:trace.incomplete,binUnchanged:true}));
}finally{await client.close();}
