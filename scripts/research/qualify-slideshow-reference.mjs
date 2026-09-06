// Link distinct 4K content and export its source-bound native reference once.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const matrix=JSON.parse(await readFile('.avid-mcp-analysis/source-clock-matrix-4e14318f-f114-4167-93b4-cd4f7c072f1e/evidence.json','utf8'));
const source=matrix.results.find(r=>r.file.endsWith('Sonoma_Escape_SLIDESHOW_4K.mp4')).result.structuredContent.data;
assert.equal(source.sourceSha256,'f6a3b14c49f71546c798dcae1bce1de2208b259a46558bb8c8365f9151aa0c6a');
assert.equal(source.outputSha256,'8436ee9a2399ce0a70e0499919c05f27d2911409744ffabaaf32f0f6695423a7');
assert.equal(await sha256File(source.source),source.sourceSha256);assert.equal(await sha256File(source.output),source.outputSha256);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',root=path.resolve('.avid-mcp-analysis',`slideshow-reference-${randomUUID()}`);await mkdir(root);
const name=`MCP_Slideshow_${randomUUID().slice(0,8)}`,bin=`${name}.avb`,calls=[];
const client=new Client({name:'slideshow-reference',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${project};${path.resolve('.avid-mcp-analysis')}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,edit,project-write,export'}}));
const call=async(name,args,error=false)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});calls.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));assert.equal(Boolean(result.isError),error,JSON.stringify(result));return error?result:result.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation}),result=await call('avid_native_apply',{token:preview.token});assert.match(JSON.stringify(await call('avid_native_apply',{token:preview.token},true)),/consumed/);return result;};
try{
 assert.equal(path.resolve((await call('avid_native_read',{query:'project'})).path),path.resolve(project));
 await action({action:'create_bin',name});await action({action:'link_media',bin,media:source.output});
 const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.length,1);const mobId=clips[0].mob_id;
 await action({action:'close_bin',bin});await action({action:'open_bin',bin});
 assert.equal((await call('avid_native_read',{query:'clips',bin}))[0].mob_id,mobId);
 const exported=await action({action:'export_aaf_master',bin,mobId,preset:'AAF',sourceFile:source.output,expectedSourceSha256:source.outputSha256});
 assert.equal(exported.verification.masterContractVerified,true);
 assert.equal(await sha256File(source.source),source.sourceSha256);assert.equal(await sha256File(source.output),source.outputSha256);
 assert.equal((await call('avid_native_lock_status',{})).locked,false);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({source,bin,mobId,exported,sourceHashesUnchanged:true,reopenedIdentityVerified:true,allTokensReplayRefused:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),reference:exported.verification.output}));
}finally{await client.close();}
