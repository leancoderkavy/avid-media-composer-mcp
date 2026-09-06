import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {verifyWindowsLoopbackOwner} from '../../dist/integrations/loopback-owner.js';

assert.equal(process.platform,'win32','This fixture qualifies Windows listener pairing');
const root=path.resolve('.avid-mcp-analysis',`installed-provider-${randomUUID()}`);await mkdir(root);
const run=async args=>{const result=await runProcess(process.execPath,args,{timeoutMs:300000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(await run([npm,'pack','--json','--ignore-scripts','--pack-destination',root]));
assert.equal(path.basename(packed[0].filename),packed[0].filename);
const archive=path.join(root,packed[0].filename),archiveSha256=await sha256File(archive);
const installation=JSON.parse(await run(['dist/cli.js','--package-install',archive,'--package-root',path.join(root,'packages'),'--package-sha256',archiveSha256]));
const media=path.join(root,'fixture.mp4');await writeFile(media,'synthetic path fixture; no video decoding');const mediaSha256=await sha256File(media);
let requests=0,headerMatched=false,selectionMatched=false;
const listener=createServer(async(req,res)=>{
  requests++;let body='';for await(const chunk of req)body+=chunk;
  headerMatched=req.headers['x-license-key']==='synthetic-fixture-key';
  const data=JSON.parse(body);selectionMatched=data.search_all===false&&data.media_paths.length===1&&data.media_paths[0]===media;
  res.setHeader('content-type','application/json');res.end(JSON.stringify({matches:[{frame_idx:'2',timestamp:'00:00:02',scene_start_timestamp:'00:00:01',scene_end_timestamp:'00:00:03',original_index:0,hash_str:'fixture',video_path:media,image:'omitted-preview'}]}));
});
await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
let client;
try{
  const port=listener.address().port,owner=await verifyWindowsLoopbackOwner({port,address:'127.0.0.1',binary:process.execPath,sha256:await sha256File(process.execPath)});
  client=new Client({name:'installed-provider-proof',version:'1.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[installation.entry],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_JUMPER_URL:`http://127.0.0.1:${port}/api/v1`,AVID_MCP_JUMPER_LICENSE_KEY:'synthetic-fixture-key',AVID_MCP_JUMPER_BINARY:owner.binary,AVID_MCP_JUMPER_SHA256:owner.sha256,AVID_MCP_JUMPER_IDENTITY:owner.identity}}));
  const result=await client.callTool({name:'avid_jumper_read',arguments:{operation:'search',query:'fixture',cacheDirectory:root,mediaPaths:[media],limit:1}},undefined,{timeout:30000});
  assert.ok(!result.isError,JSON.stringify(result));assert.equal(result.structuredContent.data.matches.length,1);
  assert.equal(result.structuredContent.data.imagesOmitted,true);assert.ok(!JSON.stringify(result).includes('omitted-preview'));assert.equal(requests,1);assert.ok(headerMatched&&selectionMatched);
  assert.equal(await sha256File(media),mediaSha256);assert.equal(await sha256File(installation.entry),installation.entrySha256);assert.equal(await sha256File(archive),archiveSha256);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,checkedAt:new Date().toISOString(),installation,archiveSha256,mediaSha256,result,requests,headerMatched,selectionMatched,limitations:'Fresh installed MCP paired dispatch to harness-owned Windows HTTP fixture. Synthetic path only, no decoded media, licensed Jumper, runtime-version or connection-race qualification.'},null,2));
  console.log(JSON.stringify({ok:true,root}));
}finally{await client?.close();listener.closeAllConnections();await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
