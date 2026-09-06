import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`native-ui-undo-reopen-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'native-ui-undo-reopen-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,edit,project-write'}}));
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
try{
 const bin='MCP_CopyMCP_93108dc0c7b8.avb',mobId='060a2b340101010501010f1013-000000-184e5ee212898806-7c27d8bbc16d-18d9',file=path.join('D:/Avid Projects/MCP_Sonoma_30p_20260905',bin);
 const restored=path.resolve('.avid-mcp-analysis/native-ui-trim-20260906/undone.avb');assert.equal(await sha256File(file),await sha256File(restored),'Fixture changed after saved undo; do not overwrite or replay edits');
 const invoke=async(name,args)=>{const value=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!value.isError,JSON.stringify(value));return value.structuredContent.data;};
 const before=await invoke('avid_native_read',{query:'clips',bin});assert.equal(before.length,1);assert.equal(before[0].mob_id,mobId);
 const receipts=[];
 for(const action of ['close_bin','open_bin']){const plan=await invoke('avid_native_preview',{operation:{action,bin}});const result=await invoke('avid_native_apply',{token:plan.token});receipts.push(result);assert.equal(result.binStateVerified,true);}
 const clips=await invoke('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);assert.equal(clips[0].mob_id,mobId);
 const captured=path.join(root,'reopened.avb');await writeFile(captured,await readFile(file),{flag:'wx'});
 const decoded=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',captured],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(decoded.exitCode,0,decoded.stderr);
 const graph=JSON.parse(decoded.stdout);assert.equal(graph.sha256,await sha256File(captured));await writeFile(path.join(root,'reopened.json'),JSON.stringify(graph,null,2));
 const baseline=JSON.parse(await readFile('.avid-mcp-analysis/native-ui-trim-20260906/baseline.json','utf8'));
 const sorted=g=>[...g.mobs].sort((a,b)=>a.mobId.localeCompare(b.mobId));assert.deepEqual(sorted(graph),sorted(baseline));
 const evidence={bin,mobId,clips,receipts,sha256:graph.sha256,allDecodedMobsEqualBaseline:true,scope:'Actual native bin close/reopen after UI trim and immediate saved undo; all decoded AVB mobs restored. Does not prove undo-history survival, arbitrary edits or playback fidelity.'};
 await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({root,bin,allDecodedMobsEqualBaseline:true}));
}finally{await client.close();}
