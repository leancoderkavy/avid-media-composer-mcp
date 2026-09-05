// Export a new reference master and consume it with the shipped AAF builder.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source=JSON.parse(await readFile('.avid-mcp-analysis/native-pcm-link-4f20d2e6-cab0-41e9-8c6a-a25528ee2898/evidence.json','utf8'));
assert.equal(await sha256File(source.media),source.mediaSha256);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',binFile=path.join(project,source.bin),before=await sha256File(binFile);
const root=path.resolve('.avid-mcp-analysis',`native-aaf-master-mcp-${randomUUID()}`);await mkdir(root);const records=[];
const client=new Client({name:'native-aaf-master-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${project};${path.resolve('.avid-mcp-analysis')}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args,error=false)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));assert.equal(Boolean(result.isError),error,JSON.stringify(result));return error?result:result.structuredContent.data;};
try{
 const operation={action:'export_aaf_master',bin:source.bin,mobId:source.mobId,preset:'AAF',sourceFile:source.media,expectedSourceSha256:source.mediaSha256};
 const wrong=await call('avid_native_preview',{operation:{...operation,expectedSourceSha256:'0'.repeat(64)}},true);assert.match(JSON.stringify(wrong),/checksum changed/);
 const preview=await call('avid_native_preview',{operation}),applied=await call('avid_native_apply',{token:preview.token});assert.equal(applied.outputVerified,true);assert.equal(applied.verification.masterContractVerified,true);
 const replay=await call('avid_native_apply',{token:preview.token},true);assert.match(JSON.stringify(replay),/consumed/);
 const inspection=applied.verification.inspection;assert.equal(inspection.masters.length,1);const master=inspection.masters[0];assert.deepEqual(master.slots.map(s=>[s.kind,s.rate,s.length]),[['picture','30',5726],['sound','30',5726],['sound','30',5726]]);
 const built=await call('avid_build_aaf_selects',{request:{template:inspection.template,expectedSha256:inspection.sha256,name:'MCP_Reference_Pipeline_Selects',rate:'30',tracks:master.slots.map((s,index)=>({name:`Track ${index+1}`,kind:s.kind})),selects:[2850,3300].map(start=>({mobId:master.mobId,start,length:60,slotIds:master.slots.map(s=>s.slotId)}))}});
 const selects=await call('avid_inspect_aaf_selects',{file:built.output});assert.equal(selects.composition.frames,120);assert.equal(selects.composition.tracks.length,3);
 for(const track of selects.composition.tracks)assert.deepEqual(track.cuts.map(c=>[c.start,c.length]),[[2850,60],[3300,60]]);
 assert.equal(await sha256File(binFile),before);assert.equal(await sha256File(source.media),source.mediaSha256);
 const lock=await call('avid_native_lock_status',{});assert.equal(lock.locked,false);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({preview,applied,replayRejected:true,wrongChecksumRejected:true,built,selects,sourceAndBinUnchanged:true,nativeImportAttempted:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output:applied.verification.output,selects:built.output,sourceAndBinUnchanged:true}));
}finally{await client.close();}
