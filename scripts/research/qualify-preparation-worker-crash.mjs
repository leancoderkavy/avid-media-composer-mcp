import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir,stat,access,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.argv[2]==='owner'){
 const [root,file,expectedSha256]=process.argv.slice(3),original=childProcess.spawn;
 childProcess.spawn=(executable,args,options)=>{
  const transform=args.includes('-n')&&args.includes('pcm_s24le');
  const actual=[...args];if(transform)actual.splice(actual.indexOf('-i'),0,'-re');
  const child=original(executable,actual,options);
  if(transform)child.once('spawn',()=>process.send({pid:child.pid,output:args.at(-1),readRateLimited:true}));
  return child;
 };
 syncBuiltinESMExports();
 const {SourceClockMedia}=await import('../../dist/library/source-clock.js');
 const {loadConfig}=await import('../../dist/config.js');
 await new SourceClockMedia(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'})).prepare({file,expectedSha256,videoStream:0,audioStream:1});
}else{
 const {runProcess}=await import('../../dist/process.js');
 const {sha256File}=await import('../../dist/analysis/file-inventory.js');
 const {SourceClockMedia}=await import('../../dist/library/source-clock.js');
 const {loadConfig}=await import('../../dist/config.js');
 const root=path.resolve('.avid-mcp-analysis',`preparation-worker-crash-${randomUUID()}`);await mkdir(root);
 const file=path.join(root,'fixture.mp4');
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=5','-c:v','libx264','-c:a','aac','-ac','2',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
 const expectedSha256=await sha256File(file);
 const owner=childProcess.spawn(process.execPath,[fileURLToPath(import.meta.url),'owner',root,file,expectedSha256],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
 let stderr='',timer,worker;owner.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
 const closed=new Promise(resolve=>owner.once('close',(code,signal)=>resolve({code,signal})));
 const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 try{
  worker=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error(`Worker startup timeout: ${stderr}`)),15000);owner.once('message',resolve);owner.once('error',reject);owner.once('close',()=>reject(new Error(`Early owner exit: ${stderr}`)));});clearTimeout(timer);
  assert.ok(Number.isSafeInteger(worker.pid)&&worker.pid>0);
  let size=0;const deadline=Date.now()+4000;
  while(Date.now()<deadline){try{size=(await stat(worker.output)).size;}catch(error){if(error.code!=='ENOENT')throw error;}if(size>65536)break;await delay(20);}
  assert.ok(size>65536,'FFmpeg did not write enough media beyond its header');assert.ok(alive(worker.pid));assert.equal(owner.kill('SIGKILL'),true);const termination=await closed;
  const observations=[];const end=Date.now()+12000;
  do{observations.push({at:new Date().toISOString(),workerPresent:alive(worker.pid),outputBytes:(await stat(worker.output)).size});if(!observations.at(-1).workerPresent)break;await delay(100);}while(Date.now()<end);
  assert.equal(observations.at(-1).workerPresent,false,'Owned bounded FFmpeg worker exit not observed');
  const directory=path.dirname(worker.output);await assert.rejects(access(path.join(directory,'receipt.json')),{code:'ENOENT'});await assert.rejects(access(path.join(directory,'failure.json')),{code:'ENOENT'});
  const partialProbe=await runProcess('ffprobe',['-v','error','-show_streams','-of','json',worker.output],{timeoutMs:10000});
  assert.notEqual(partialProbe.exitCode,0,'Expected interrupted MOV to be unreadable in this fixture');
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}),status=await new SourceClockMedia(config).status(path.basename(directory).slice(13));
  assert.equal(status.state,'unresolved');assert.equal(status.workerState,'unknown');assert.equal(await sha256File(file),expectedSha256);
  const evidence={file,expectedSha256,worker,termination,bytesBeforeOwnerExit:size,observations,partialProbe,status,sourceUnchanged:true,workerExitObserved:true,scope:'Actual production preparation with injected FFmpeg -re input pacing on a five-second owned fixture. Exact owner killed after active worker/output observation beyond 64 KiB. Worker exit is observed, not proof of parent-death containment; bounded input or pipe closure may explain it. No arbitrary long-media orphan containment or automatic cleanup.'};
  await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({root,...evidence}));
 }finally{clearTimeout(timer);if(owner.exitCode===null&&owner.signalCode===null)owner.kill('SIGKILL');await closed;}
}
