import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,rename,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`visual-scope-${randomUUID()}`);await mkdir(root);
const allowed=path.join(root,'allowed'),outside=path.join(root,'outside');await mkdir(allowed);await mkdir(outside);
const a=path.join(allowed,'a.mp4'),b=path.join(outside,'b.mp4'),moved=path.join(allowed,'renamed.mp4');
for(const [file,color] of [[a,'red'],[b,'blue']]){const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i',`color=c=${color}:s=320x180:r=30:d=1`,'-c:v','libx264',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);}
const ids=[await sha256File(a),await sha256File(b)];
const connect=async(roots)=>{const client=new Client({name:'visual-cache-scope',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:roots,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
let client=await connect(root);
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  await call('avid_index_media',{files:[a,b]});
  const first=await call('avid_index_visual',{ids:[ids[0]],samplesPerFile:1}),second=await call('avid_index_visual',{ids:[ids[1]],samplesPerFile:1});
  await client.close();client=await connect(allowed);
  const scoped=await call('avid_visual_index_runs',{limit:1});assert.deepEqual(scoped.runs.map(run=>run.runId),[first.runId]);assert.equal(scoped.nextAfter,null);
  const denied=await client.callTool({name:'avid_visual_index_run',arguments:{runId:second.runId}});assert.ok(denied.isError);assert.equal(denied.structuredContent.error.code,'INDEXED_SOURCE_UNAVAILABLE');
  // Only rename the generated source in this script's unique fixture directory.
  await rename(a,moved);assert.deepEqual((await call('avid_visual_index_runs',{})).runs,[]);
  await call('avid_index_media',{files:[moved]});
  const restored=await call('avid_visual_index_run',{runId:first.runId});assert.equal(restored.state,'completed');assert.equal(restored.indexId,first.indexId);
  assert.deepEqual((await call('avid_visual_index_runs',{})).runs.map(run=>run.runId),[first.runId]);assert.equal(await sha256File(moved),ids[0]);
  const query={indexId:first.indexId,query:{text:'red scene'},limit:1};
  const baseline=await call('avid_search_visual',query);
  assert.equal(baseline.results[0].thumbnailIntegrity,'sha256_verified');
  const thumbnail=baseline.results[0].image,thumbnailBytes=await readFile(thumbnail);
  try{
    await writeFile(thumbnail,'changed generated thumbnail');
    for(const [name,args] of [['avid_search_visual',query],['avid_visual_samples',{indexId:first.indexId}]]){
      const changedImage=await client.callTool({name,arguments:args});assert.equal(changedImage.isError,true);assert.match(JSON.stringify(changedImage),/thumbnail changed/);
    }
  }finally{await writeFile(thumbnail,thumbnailBytes);}
  assert.deepEqual(await call('avid_search_visual',query),baseline);
  const alias=path.join(allowed,'matching.mp4');await writeFile(alias,await readFile(moved),{flag:'wx'});
  // Change only this run's generated fixtures; original user media is never used.
  await writeFile(moved,'changed generated source');
  for(const [name,args] of [['avid_search_visual',query],['avid_visual_samples',{indexId:first.indexId}],['avid_search_visual_frame',{indexId:first.indexId,id:ids[0],time:0.5,limit:1}]]){
    const stale=await client.callTool({name,arguments:args});assert.equal(stale.isError,true);assert.match(JSON.stringify(stale),/Source changed/);
  }
  await call('avid_index_media',{files:[alias]});
  const recovered=await call('avid_search_visual',query);assert.deepEqual(recovered,baseline);
  assert.equal((await call('avid_visual_samples',{indexId:first.indexId})).samples.length,1);
  await client.close();client=await connect(moved);
  const narrow=await client.callTool({name:'avid_search_visual',arguments:query});assert.equal(narrow.isError,true);
  await client.close();client=await connect(allowed);await writeFile(alias,'changed matching copy');
  const changedBoth=await client.callTool({name:'avid_search_visual',arguments:query});assert.equal(changedBoth.isError,true);assert.match(JSON.stringify(changedBoth),/Source changed/);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({first,second,scoped,denied,restored,baseline,recovered,narrow,changedBoth,staleReadsRefused:true,thumbnailChangeRefusedAndRestored:true,matchingAliasRecoveredIdenticalSearch:true,scope:'Generated local MP4s only; generated thumbnail changed then restored, moved source and matching alias deliberately changed to test refusal. No user media edited or embedding recomputation during recovery.'},null,2));
  console.log(JSON.stringify({passed:true,scopedDiscovery:true,movedSourceRestored:true,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
