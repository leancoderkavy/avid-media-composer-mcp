import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root=path.resolve('.avid-mcp-analysis',`trim-source-trace-${randomUUID()}`);
await mkdir(root);
const bin=path.resolve('.avid-mcp-analysis/native-ui-backward-20260906/baseline.avb');
const hash=await sha256File(bin);
assert.equal(hash,'a32ac6db26653ff723c4d947d70a9e60ce2f1b806c7f9215984e27b53f33b03b');
const client=new Client({name:'trim-source-trace-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write',AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe')}}));
const invoke=async(name,args)=>{
 const result=await client.callTool({name,arguments:args});
 assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;
};
try{
 const snapshot=await invoke('avid_snapshot_saved_bins',{bins:[bin]});
 const trace=await invoke('avid_trace_saved_sources',{revision:snapshot.revision,bin,mobId:'urn:smpte:umid:060a2b34.01010105.01010f10.13000000.184e5ee2.12898806.7c27d8bb.c16d18d9',start:59,end:61,maxDepth:8});
 const direct=trace.steps.filter(s=>s.depth===0);
 assert.equal(direct.length,6);
 for(const [index,step] of direct.entries())assert.deepEqual([step.start,step.end,step.sourceStart,step.sourceEnd,step.status],index%2===0?[59,60,2909,2910,'reference']:[60,61,3300,3301,'reference']);
 // Independently inspected saved nodes: master picture offset 0 then file
 // source offset 2; both sound channels use master offset 1 then offset 1.
 assert.equal(trace.steps.length,24);assert.equal(trace.incomplete,true);
 assert.equal(trace.descriptors.length,5);
 assert.equal(trace.descriptors.filter(d=>d.status==='absent').length,2);
 const video=trace.descriptors.find(d=>d.descriptor?.classId==='CDCI');
 const audio=trace.descriptors.find(d=>d.descriptor?.classId==='MPGA');
 const physical=trace.descriptors.find(d=>d.descriptor?.classId==='MDES');
 assert.deepEqual([video.descriptor.values.edit_rate,video.descriptor.values.length,video.descriptor.values.stored_width,video.descriptor.values.stored_height],[30,5726,1280,720]);
 assert.deepEqual([audio.descriptor.values.edit_rate,audio.descriptor.values.length,audio.descriptor.values.sample_rate,audio.descriptor.values.channels],[48000,9164224,48000,2]);
 assert.equal(video.descriptor.locator.classId,'MSML');assert.equal(audio.descriptor.locator.classId,'MSML');
 assert.equal(physical.descriptor.locator.classId,'WINF');assert.ok(physical.descriptor.locator.paths.some(p=>p.field==='path'&&p.value.length>0));
 for(let group=0;group<6;group++){
  const base=group%2===0?2909:3300,chain=trace.steps.slice(group*4,group*4+4);
  assert.deepEqual(chain.map(s=>s.depth),[0,1,2,3]);
  assert.deepEqual(chain.map(s=>s.status),['reference','reference','reference','unresolved']);
  assert.deepEqual(chain.map(s=>s.sourceStart),[base,base+(group<2?0:1),base+2,base+2]);
  assert.ok(chain.every(s=>s.sourceEnd===s.sourceStart+1));
  assert.equal(chain[3].sourceTrackId,0);
 }
 assert.equal(await sha256File(bin),hash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({snapshot,trace,hash,inputUnchanged:true,scope:'Actual saved-bin MCP traversal around the restored trim cut; no new editor edit or physical media handle verification'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,incomplete:trace.incomplete,statuses:trace.steps.map(s=>({depth:s.depth,status:s.status,mediaKind:s.mediaKind,sourceStart:s.sourceStart,sourceEnd:s.sourceEnd}))}));
}finally{await client.close();}
