import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--persist','Only optional --persist is supported');const persist=process.argv[2]==='--persist';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_AAF_Selects_20260905.avb',mobId='060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9',original='MCP_Sonoma_AAF_Selects',temporary='MCP Rename Qualification',source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const root=path.resolve('.avid-mcp-analysis',`native-rename-${randomUUID()}`);await mkdir(root);const sourceHash=await sha256File(source),binHashBefore=await sha256File(path.join(project,bin)),steps=[];
const client=new Client({name:'native-rename-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 for(const [expectedName,name] of [[original,temporary],[temporary,original]]){
  const plan=await call('avid_native_preview',{operation:{action:'rename_clip',bin,mobId,expectedName,name}}),result=await call('avid_native_apply',{token:plan.token});steps.push(result);await writeFile(path.join(root,'steps.json'),JSON.stringify(steps,null,2));assert.equal(result.renameVerified,true,'Stop and inspect before another rename');
  if(persist){
   for(const action of ['close_bin','open_bin']){
    const plan=await call('avid_native_preview',{operation:{action,bin}}),result=await call('avid_native_apply',{token:plan.token});steps.push(result);await writeFile(path.join(root,'steps.json'),JSON.stringify(steps,null,2));assert.equal(result.postStateRead,true);
    if(action==='close_bin'){
     const inspected=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',path.join(project,bin)],{timeoutMs:30000,maxOutputBytes:2*1024*1024});assert.equal(inspected.exitCode,0,inspected.stderr);
     const timeline=JSON.parse(inspected.stdout),sequence=timeline.mobs.find(item=>item.name===name);assert.ok(sequence);assert.equal(sequence.duration,120);assert.equal(sequence.rate,30);
     const tracks=sequence.tracks.filter(track=>['picture','sound'].includes(track.mediaKind));assert.equal(tracks.length,3);for(const track of tracks)assert.deepEqual(track.nodes.map(node=>[node.timelineStart,node.timelineEnd,node.sourceStart]),[[0,60,2850],[60,120,3300]]);
     await writeFile(path.join(root,`${name===temporary?'renamed':'restored'}-timeline.json`),JSON.stringify(timeline));
    }
   }
   const columns=await call('avid_native_read',{query:'clip',bin,mobId});assert.equal(columns.find(row=>row.column_name==='Name')?.column_value,name);
  }
 }
 assert.equal(await sha256File(source),sourceHash);const binHashAfter=await sha256File(path.join(project,bin));
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({steps,persist,sourceHash,sourceUnchanged:true,binHashBefore,binHashAfter,scope:persist?'Temporary rename and explicit restoration each saved/reopened and independently inspected in disposable bin. Sequence ranges preserved; bin bytes may change. No atomic undo or application restart claim.':'Temporary name change and explicit name restoration in disposable sequence through MCP. No bin save/reopen, atomic undo or general metadata-write claim.'},null,2));console.log(JSON.stringify({passed:true,root}));
}finally{await client.close();}
