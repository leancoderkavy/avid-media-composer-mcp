// Continue only the already-completed import whose range assertion stopped the first run.
import path from 'node:path';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const parent=path.resolve('.avid-mcp-analysis/aaf-workflow-mcp-cbe5901f-91b7-4b74-8109-d669dff04bb6'),journalFile=path.join(parent,'calls.json'),journalSha256=await sha256File(journalFile);
const records=JSON.parse(await readFile(journalFile,'utf8'));
assert.ok(!records.some(r=>r.name==='avid_native_apply'&&r.result.structuredContent?.data?.action?.action==='export_mp4'));
const imported=records.find(r=>r.name==='avid_native_apply'&&r.result.structuredContent?.data?.action?.action==='import_aaf_selects').result.structuredContent.data;
assert.equal(imported.sequence.mob_id,'060a2b340101010501010f1013-000000-aefa3d0112888806-8b35d8bbc16d-18d9');
const snapshot=records.find(r=>r.name==='avid_snapshot_saved_bins').result.structuredContent.data;
const ranges=records.at(-1).result.structuredContent.data;assert.equal(records.at(-1).name,'avid_saved_timeline_range');
const sources=ranges.results.filter(item=>item.sourceStart!==undefined);assert.equal(sources.length,6);
const shape=item=>[item.timelineStart,item.timelineEnd,item.sourceStart,item.overlapSourceEnd],expected=[[0,60,2850,2910],[60,120,3300,3360]];
assert.deepEqual(sources.filter(item=>item.mediaKind==='picture').map(shape),expected);
for(const channel of [1,2])assert.deepEqual(sources.filter(item=>item.mediaKind==='sound'&&item.sourceTrackId===channel).map(shape),expected);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin=imported.action.bin,binFile=path.join(project,bin),binSha256=await sha256File(binFile);
const sourceFiles=[journalFile,imported.action.file,...JSON.parse(await readFile(path.join(imported.evidenceDirectory,'attempt.json'),'utf8')).inspection.media.map(m=>m.file)],hashes=await Promise.all(sourceFiles.map(sha256File));
const root=path.join(parent,`render-continuation-${randomUUID()}`);await mkdir(root);const calls=[];
const client=new Client({name:'aaf-workflow-render-continuation',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args,error=false)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});calls.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));assert.equal(Boolean(result.isError),error,JSON.stringify(result));return error?result:result.structuredContent.data;};
try{
 const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.filter(c=>c.mob_id===imported.sequence.mob_id).length,1);
 const operation={action:'export_mp4',bin,mobId:imported.sequence.mob_id,preset:'MCP_H264_Stereo_Legal_20260905',expected:{videoCodec:'h264',width:1920,height:1080,frames:120,rate:{num:30,den:1},videoStartTime:0,audio:[{codec:'pcm_s24le',channels:2,sampleRate:48000,startTime:0}],color:{range:'tv',space:'bt709',transfer:'bt709',primaries:'bt709'}}};
 const preview=await call('avid_native_preview',{operation});const rendered=await call('avid_native_apply',{token:preview.token});assert.equal(rendered.outputVerified,true);
 const replay=await call('avid_native_apply',{token:preview.token},true);assert.match(JSON.stringify(replay),/consumed/);
 assert.equal(await sha256File(binFile),binSha256);assert.deepEqual(await Promise.all(sourceFiles.map(sha256File)),hashes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({parent,journalSha256,bin,binSha256,snapshot,ranges,rendered,replayRejected:true,importRepeated:false,filesUnchanged:true,channelTopology:'two separate sound tracks; source-channel fidelity requires rendered comparison'},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output:rendered.verification.output,bin,importRepeated:false}));
}finally{await client.close();}
