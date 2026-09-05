// Exercise shipped source-clock preparation against the original Sonoma MP4.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',expectedSha256='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(file),expectedSha256);
const root=path.resolve('.avid-mcp-analysis',`source-clock-mcp-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'source-clock-qualification',version:'1.0'}),calls=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export',AVID_MCP_COMMAND_TIMEOUT_MS:'120000'}}));
const call=async options=>{const result=await client.callTool({name:'avid_prepare_source_clock_media',arguments:{options}},undefined,{timeout:120000});calls.push({options,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));return result;};
try{
 const options={file,expectedSha256,videoStream:0,audioStream:1};
 const rejected=await call({...options,expectedSha256:'0'.repeat(64)});assert.equal(rejected.isError,true);assert.match(JSON.stringify(rejected),/checksum changed/);
 const result=await call(options);assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 assert.equal(data.videoEssenceSha256,'eb1e856639889b6c99b942316d15284dbbbbdeea94198cd9a3ae39f4dc940b3a');
 assert.equal(data.sourceClockPcmSha256,'b28d287137fcf855971513f761eafc6d57834e3b6415c9eabd12a6b07c0961f2');
 assert.equal(data.verified,true);assert.equal(data.hostImportVerified,false);assert.equal(await sha256File(file),expectedSha256);
 assert.equal(await sha256File(data.output),data.outputSha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({data,wrongChecksumRejected:true,sourceUnchanged:true,priorResearchEssenceMatched:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output:data.output,verified:true,priorResearchEssenceMatched:true}));
}finally{await client.close();}
