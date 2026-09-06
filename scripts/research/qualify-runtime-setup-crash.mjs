import fs from 'node:fs';
import {mkdir,readFile,readdir,writeFile,access} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

if(process.argv[2]==='child'){
 process.on('message',()=>{}); // Keep the IPC channel alive while the barrier awaits termination.
 const cache=process.argv[3],phase=process.argv[4],original=fs.promises.writeFile;
 fs.promises.writeFile=async(file,...args)=>{
  await original(file,...args);
  const target=String(file);
  if((phase==='lock'&&target===path.join(cache,'.runtime-install.lock'))||
     (phase==='staging'&&path.basename(target)==='package.json'&&path.basename(path.dirname(target)).startsWith('.runtime-install-'))){
   process.send({phase,file:target});await new Promise(()=>{});
  }
 };
 syncBuiltinESMExports();
 const {installModelRuntime}=await import('../../dist/library/model-runtime-install.js');
 await installModelRuntime(cache);throw new Error('Installer escaped crash barrier');
}else{
 const {installModelRuntime,runtimeManifest}=await import('../../dist/library/model-runtime-install.js');
 const root=path.resolve('.avid-mcp-analysis',`runtime-setup-crash-${randomUUID()}`);await mkdir(root);
 const results=[];
 for(const phase of ['lock','staging']){
  const cache=path.join(root,phase);await mkdir(cache);
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'child',cache,phase],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let stderr='',timer;child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  try{
   const ready=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error(`Barrier timeout: ${stderr}`)),15000);
    child.once('message',resolve);child.once('error',reject);child.once('close',()=>reject(new Error(`Premature exit: ${stderr}`)));
   });clearTimeout(timer);assert.equal(ready.phase,phase);
   const lock=path.join(cache,'.runtime-install.lock'),bytes=await readFile(lock,'utf8');
   assert.equal(JSON.parse(bytes).pid,child.pid);
   // A contender must fail while the observed owner is still alive.
   await assert.rejects(installModelRuntime(cache),/setup lock exists/);
   assert.equal(await readFile(lock,'utf8'),bytes);
   assert.equal(child.kill('SIGKILL'),true);const termination=await closed;
   // Confirmed process termination alone does not authorize automatic lock removal.
   await assert.rejects(installModelRuntime(cache),/setup lock exists/);
   assert.equal(await readFile(lock,'utf8'),bytes);
   await assert.rejects(access(path.join(cache,'runtime')),{code:'ENOENT'});
   const staged=(await readdir(cache)).filter(name=>name.startsWith('.runtime-install-'));
   assert.equal(staged.length,phase==='staging'?1:0);
   if(staged.length){
    const directory=path.join(cache,staged[0]);
    assert.deepEqual(await readdir(directory),['package.json']);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory,'package.json'),'utf8')),runtimeManifest);
   }
   results.push({phase,termination,liveContenderRefused:true,restartRefused:true,lockPreserved:true,publishedRuntime:false,stagingRetained:staged});
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Production installer killed at instrumented completed lock and staging-manifest writes, before npm starts. Establishes refusal and retained state, not recovery or orphaned npm handling.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,results}));
}
