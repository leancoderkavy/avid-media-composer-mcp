import fs from 'node:fs';
import {mkdir,readFile,readdir,writeFile,access} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

if(process.argv[2]==='child'){
 process.on('message',()=>{});
 const [root,file,expectedSha256,phase]=process.argv.slice(3),original=fs.promises.writeFile;
 fs.promises.writeFile=async(target,...args)=>{
  if(phase==='before-receipt'&&path.basename(String(target))==='receipt.json'){
   process.send({phase,directory:path.dirname(String(target))});await new Promise(()=>{});
  }
  await original(target,...args);
  if(phase==='attempt'&&path.basename(String(target))==='attempt.json'){
   process.send({phase,directory:path.dirname(String(target))});await new Promise(()=>{});
  }
 };
 syncBuiltinESMExports();
 const {SourceClockMedia}=await import('../../dist/library/source-clock.js');
 const {loadConfig}=await import('../../dist/config.js');
 await new SourceClockMedia(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'})).prepare({file,expectedSha256,videoStream:0,audioStream:1});
 throw new Error('Preparation escaped crash barrier');
}else{
 const {runProcess}=await import('../../dist/process.js');
 const {sha256File}=await import('../../dist/analysis/file-inventory.js');
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {StdioClientTransport,getDefaultEnvironment}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 const root=path.resolve('.avid-mcp-analysis',`source-clock-crash-${randomUUID()}`);await mkdir(root);
 const file=path.join(root,'fixture.mp4');
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-ac','2',file],{timeoutMs:30000});
 assert.equal(generated.exitCode,0,generated.stderr);const expectedSha256=await sha256File(file),results=[];
 for(const phase of ['attempt','before-receipt']){
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'child',root,file,expectedSha256,phase],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let stderr='',timer;child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  try{
   const ready=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error(`Barrier timeout: ${stderr}`)),30000);
    child.once('message',resolve);child.once('error',reject);child.once('close',()=>reject(new Error(`Premature exit: ${stderr}`)));
   });clearTimeout(timer);assert.equal(ready.phase,phase);
   const directory=ready.directory;
   const inventory=async()=>Object.fromEntries(await Promise.all((await readdir(directory)).sort().map(async name=>[name,await sha256File(path.join(directory,name))])));
   const before=await inventory();assert.deepEqual(Object.keys(before),phase==='attempt'?['attempt.json']:['attempt.json','prepared.mov']);
   const attempt=JSON.parse(await readFile(path.join(directory,'attempt.json'),'utf8'));assert.equal(attempt.sourceSha256,expectedSha256);
   assert.equal(child.kill('SIGKILL'),true);const termination=await closed;
   await assert.rejects(access(path.join(directory,'receipt.json')),{code:'ENOENT'});
   await assert.rejects(access(path.join(directory,'failure.json')),{code:'ENOENT'});
   const client=new Client({name:'source-clock-crash-retry',version:'1.0'});
   try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
    const result=await client.callTool({name:'avid_prepare_source_clock_media',arguments:{options:{file,expectedSha256,videoStream:0,audioStream:1}}},undefined,{timeout:120000});
    assert.ok(!result.isError,JSON.stringify(result));const receipt=result.structuredContent.data;
    assert.equal(receipt.verified,true);assert.notEqual(path.dirname(receipt.output),directory);
    assert.equal(await sha256File(receipt.output),receipt.outputSha256);
    assert.deepEqual(JSON.parse(await readFile(path.join(path.dirname(receipt.output),'receipt.json'),'utf8')),receipt);
    assert.deepEqual(await inventory(),before);assert.equal(await sha256File(file),expectedSha256);
    results.push({phase,termination,interruptedDirectory:directory,retainedHashes:before,retryOutput:receipt.output,retryOutputSha256:receipt.outputSha256,retryVerified:true,sourceUnchanged:true,interruptedArtifactsUnchanged:true});
   }finally{await client.close();}
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({file,expectedSha256,results,scope:'Production preparation killed at instrumented write barriers with no active subprocess. Fresh MCP retry recomputes into a new directory. No mid-FFmpeg orphan handling, interrupted receipt write, automatic discovery, cleanup or power-loss durability qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,results}));
}
