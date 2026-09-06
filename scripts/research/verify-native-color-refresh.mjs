import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const root=path.resolve('.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0');
const fixture=JSON.parse(await readFile(path.join(root,'evidence.json'),'utf8'));
for(const name of ['refreshed-graph.json','refresh-result.json']){
 const existing=await stat(path.join(root,name)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
 assert.equal(existing,false,'Previous verification artifacts exist; inspect them without replaying native operations');
}
await writeFile(path.join(root,'refresh-verification-started.json'),JSON.stringify({startedAt:new Date().toISOString()}),{flag:'wx'});
assert.equal(fixture.bin,'MCP_Color_ca6d9cb31bcc.avb');assert.equal(fixture.clips[0].mob_id,'060a2b340101010501010f1013-000000-47b86c9012898806-94f3d8bbc16d-18d9');
const client=new Client({name:'native-color-refresh-verification',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:fixture.project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write,edit,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});events.push({name,args,result});await writeFile(path.join(root,'refresh-events.json'),JSON.stringify(events,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 for(const action of ['close_bin','open_bin']){const plan=await call('avid_native_preview',{operation:{action,bin:fixture.bin}});assert.equal((await call('avid_native_apply',{token:plan.token})).binStateVerified,true);}
 const file=path.join(fixture.project,fixture.bin),parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);
 const graph=JSON.parse(parsed.stdout);await copyFile(file,path.join(root,'candidate-refreshed.avb'));await writeFile(path.join(root,'refreshed-graph.json'),JSON.stringify(graph,null,2),{flag:'wx'});
 assert.equal(await sha256File(path.join(fixture.project,fixture.sourceBin)),fixture.sourceHash);
 const operation={action:'export_mp4',bin:fixture.bin,mobId:fixture.clips[0].mob_id,preset:'MCP_H264_Stereo_Legal_20260905',expected:{videoCodec:'h264',width:1920,height:1080,frames:120,rate:{num:30,den:1},audio:[{codec:'pcm_s24le',channels:2,sampleRate:48000}],color:{range:'tv',space:'bt709',transfer:'bt709',primaries:'bt709'}}};
 const preview=await call('avid_native_preview',{operation}),applied=await call('avid_native_apply',{token:preview.token});assert.equal(applied.outputVerified,true);assert.equal(applied.verification.decodedFrames,120);
 await writeFile(path.join(root,'refresh-result.json'),JSON.stringify({graph,applied,sourceBinUnchanged:true,scope:'UI Color Adapters refresh on owned duplicate followed by saved capture and technical native export verification. Pixel comparison remains required.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,output:applied.verification.output,sha256:applied.verification.sha256,savedHash:graph.sha256}));
}finally{await client.close();}
