import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile,appendFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [python]=process.argv.slice(2);assert.equal(process.argv.length,3);assert.ok(path.isAbsolute(python));
const root=path.resolve('.avid-mcp-analysis',`snapshot-freshness-${randomUUID()}`);await mkdir(root);
const original='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_Sonoma_Media.avb',originalHash=await sha256File(original),file=path.join(root,'owned.avb');await copyFile(original,file);
const server=path.resolve('dist/index.js'),serverHash=await sha256File(server),calls=[];
const connect=async()=>{const client=new Client({name:'snapshot-freshness',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_PYTHON:python,AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
const call=async(client,name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});calls.push({name,args,result:r});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
let client=await connect();
try{
 const snapshot=await call(client,'avid_snapshot_saved_bins',{bins:[file]}),args={revision:snapshot.revision,bin:file};
 const snapshotFile=path.join(root,'avid-mcp-library',`snapshot-${snapshot.revision}.json`),snapshotHash=await sha256File(snapshotFile);
 const matching=await call(client,'avid_verify_snapshot_bin',args);assert.equal(matching.status,'matches');assert.equal(matching.currentSha256,originalHash);
 await appendFile(file,Buffer.from('owned verification fixture change'));
 const changed=await call(client,'avid_verify_snapshot_bin',args);assert.equal(changed.status,'changed');assert.equal(changed.capturedSha256,originalHash);assert.notEqual(changed.currentSha256,originalHash);
 await client.close();client=await connect();assert.deepEqual(await call(client,'avid_verify_snapshot_bin',args),changed);
 const retained=path.join(root,'retained-changed.avb');assert.equal(path.dirname(file),root);assert.equal(path.dirname(retained),root);await rename(file,retained);
 const missing=await call(client,'avid_verify_snapshot_bin',args);assert.equal(missing.status,'missing');assert.equal(missing.currentSha256,null);
 assert.equal(await sha256File(snapshotFile),snapshotHash);assert.equal(await sha256File(original),originalHash);assert.equal(await sha256File(server),serverHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,snapshot,matching,changed,missing,original,originalHash,snapshotHash,serverHash,retained,scope:'Owned copy of real Sonoma bin; explicit checksum match/change/missing and MCP reconnect. Protected original and snapshot unchanged; no native editor operation or edit-lock claim.'},null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,root}));
}finally{await client.close();}
