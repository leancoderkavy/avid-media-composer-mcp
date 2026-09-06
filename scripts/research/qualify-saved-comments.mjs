import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const retained=path.resolve('.avid-mcp-analysis/native-comment-d684d7b5-4806-4a62-b15d-31c7e7a6c9df');
const oracle=JSON.parse(await readFile(path.join(retained,'saved-comment-attributes.json'),'utf8'));assert.equal(oracle.verified,true);
const root=path.resolve('.avid-mcp-analysis',`saved-comments-${randomUUID()}`);await mkdir(root);
const staged=path.join(root,'owned-copy.avb'),events=[],revisions={};
const connect=async()=>{const client=new Client({name:'saved-comment-qualification',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect'}}));return client;};
const call=async(client,name,args)=>{const result=await client.callTool({name,arguments:args});events.push({name,args,result});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
let client=await connect(),mobId;
try{
 for(const record of oracle.records){
  const input=path.join(retained,`${record.label}.avb`);assert.equal(await sha256File(input),record.sha256);await copyFile(input,staged);
  const snapshot=await call(client,'avid_snapshot_saved_bins',{bins:[staged]});revisions[record.label]=snapshot.revision;
  await client.close();client=await connect();
  let after=-1,found=[];
  do{const page=await call(client,'avid_saved_snapshot_mobs',{revision:snapshot.revision,after,limit:1});found.push(...page.mobs.filter(m=>m.name===record.name));after=page.nextAfter;}while(after!==null);
  assert.equal(found.length,1);if(mobId)assert.equal(found[0].mobId,mobId);else mobId=found[0].mobId;
  assert.equal(found[0].comment,record.value);assert.equal(found[0].commentStatus,record.present?'recorded':'absent');
  assert.equal(await sha256File(input),record.sha256);assert.equal(await sha256File(staged),record.sha256);
 }
 const set=await call(client,'avid_diff_saved_snapshots',{baseline:revisions.baseline,candidate:revisions.set});assert.equal(set.totalChanges,1);
 assert.equal(set.changes[0].mobId,mobId);assert.equal(set.changes[0].before.comment,null);assert.equal(set.changes[0].after.comment,'MCP comment qualification - reviewed');
 const {comment:oldComment,...before}=set.changes[0].before,{comment:newComment,...after}=set.changes[0].after;assert.deepEqual(before,after);
 const clear=await call(client,'avid_diff_saved_snapshots',{baseline:revisions.set,candidate:revisions.clear});assert.equal(clear.totalChanges,1);assert.equal(clear.changes[0].after.comment,null);
 const restored=await call(client,'avid_diff_saved_snapshots',{baseline:revisions.baseline,candidate:revisions.clear});assert.equal(restored.totalChanges,0);assert.equal(restored.complete,false);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({retained,oracle,staged,revisions,mobId,events,scope:'MCP capture/reconnect/diff of retained actual native comment AVBs through one owned staging path. Only saved Comments changed in the decoded sequence; opaque effect coverage remains incomplete. Not a new native write or full binary equivalence.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,revisions}));
}finally{await client.close();}
