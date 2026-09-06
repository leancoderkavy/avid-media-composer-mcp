import fs from 'node:fs';
import {mkdir,writeFile,readFile,readdir,access} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const receipt={schema:1,kind:'avid-model-runtime',transformers:'4.2.0',treeSha256:'a'.repeat(64),checkedAt:'publication-fixture',nodeVersion:process.versions.node,checks:{scriptsDisabled:true,auditHighPassed:true,importPassed:true},adoptedLegacy:false};
if(process.argv[2]==='child'){
 const directory=process.argv[3],phase=process.argv[4],originalWrite=fs.promises.writeFile,originalLink=fs.promises.link;
 const barrier=async temporary=>{process.send({phase,temporary});await new Promise(()=>{});};
 if(phase==='partial')fs.promises.writeFile=async(file,bytes,options)=>{
  if(path.basename(String(file)).startsWith('.runtime-receipt-')){await originalWrite(file,'{"schema":',options);await barrier(file);}
  else await originalWrite(file,bytes,options);
 };
 else if(phase==='linked')fs.promises.link=async(from,to)=>{await originalLink(from,to);await barrier(from);};
 else throw new Error('Unknown crash phase');
 syncBuiltinESMExports();
 const {publishRuntimeReceipt}=await import('../../dist/library/model-runtime-install.js');
 await publishRuntimeReceipt(directory,receipt);
 throw new Error('Child escaped interruption barrier');
}else{
 const {publishRuntimeReceipt}=await import('../../dist/library/model-runtime-install.js');
 const {packageTreeHash}=await import('../../dist/package-lifecycle.js');
 const root=path.resolve('.avid-mcp-analysis',`runtime-receipt-crash-${randomUUID()}`);await mkdir(root);
 const results=[];
 for(const phase of ['partial','linked']){
  const cache=path.join(root,phase),directory=path.join(cache,'runtime');await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'owned-dependency.txt'),'unchanged dependency fixture',{flag:'wx'});
  const before=await packageTreeHash(directory),final=path.join(directory,'installation.json');
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'child',directory,phase],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8192);});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  let timer;
  try{
   const ready=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error(`Child barrier timeout: ${stderr}`)),15000);
    child.once('error',reject);child.once('message',resolve);child.once('close',()=>reject(new Error(`Child exited before barrier: ${stderr}`)));
   });
   clearTimeout(timer);assert.equal(ready.phase,phase);
   assert.equal(path.dirname(ready.temporary),cache);
   const staged=await readFile(ready.temporary,'utf8');
   if(phase==='partial'){assert.equal(staged,'{"schema":');await assert.rejects(access(final),{code:'ENOENT'});}
   else assert.deepEqual(JSON.parse(await readFile(final,'utf8')),receipt);
   assert.equal(child.kill('SIGKILL'),true);const termination=await closed;
   assert.equal(await readFile(ready.temporary,'utf8'),staged);
   if(phase==='partial')await publishRuntimeReceipt(directory,receipt);
   else await assert.rejects(publishRuntimeReceipt(directory,{...receipt,treeSha256:'b'.repeat(64)}),{code:'EEXIST'});
   assert.deepEqual(JSON.parse(await readFile(final,'utf8')),receipt);
   assert.equal(await packageTreeHash(directory),before);
   assert.deepEqual((await readdir(cache)).filter(n=>n.startsWith('.runtime-receipt-')),[path.basename(ready.temporary)]);
   results.push({phase,termination,finalReceiptComplete:true,abandonedTemporaryPreserved:true,dependencyTreeUnchanged:true});
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Real child-process termination at instrumented partial-write and post-link barriers in the production receipt publisher; synthetic receipt and dependency fixture, not full installer or power-loss recovery'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,results}));
}
