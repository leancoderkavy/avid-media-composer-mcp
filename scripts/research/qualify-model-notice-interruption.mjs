// Inject a partial staging write, then terminate only the owned child and retry setup.
import {fork} from 'node:child_process';import {once} from 'node:events';import {mkdir,writeFile,readFile,access,readdir} from 'node:fs/promises';import {randomUUID,createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
import {installModelNotice} from '../../dist/library/model-notices.js';
const root=path.resolve('.avid-mcp-analysis',`notice-interruption-${randomUUID()}`);await mkdir(root);const cache=path.join(root,'cache'),worker=path.join(root,'worker.mjs');
await writeFile(worker,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const write=fs.promises.writeFile;
fs.promises.writeFile=async(file,bytes,options)=>{
 if(String(file).endsWith('.creating')){await write(file,bytes.subarray(0,12),options);process.send({staged:file});await new Promise(()=>{});}
 return write(file,bytes,options);
};syncBuiltinESMExports();
const keepAlive=setInterval(()=>{},1000);
const {installModelNotice}=await import(process.argv[2]);
await installModelNotice(process.argv[3],'Xenova/clip-vit-base-patch32','d15189d7028b43f1d3e65039190477f6af591c2a');clearInterval(keepAlive);
`,{flag:'wx'});
const child=fork(worker,[pathToFileURL(path.resolve('dist/library/model-notices.js')).href,cache],{stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8192);});
const exited=once(child,'exit');let timer;
try{
 const message=await Promise.race([once(child,'message').then(([value])=>value),exited.then(()=>{throw new Error('Child exited before staging: '+stderr);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Child staging timeout')),30000);})]);clearTimeout(timer);
 const staged=path.resolve(message.staged),relative=path.relative(cache,staged);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.match(path.basename(staged),/^\.notice-[a-f0-9-]+\.creating$/);
 const partial=await readFile(staged);assert.equal(partial.length,12);const final=path.join(path.dirname(staged),'UPSTREAM.LICENSE');await assert.rejects(access(final));
 child.kill();const exit=await exited;
 const result=await installModelNotice(cache,'Xenova/clip-vit-base-patch32','d15189d7028b43f1d3e65039190477f6af591c2a');assert.equal(result.created,true);assert.deepEqual(await readFile(staged),partial);
 const digest=createHash('sha256').update(await readFile(result.file)).digest('hex');assert.equal(digest,result.sha256);
 assert.equal((await installModelNotice(cache,'Xenova/clip-vit-base-patch32','d15189d7028b43f1d3e65039190477f6af591c2a')).created,false);
 assert.deepEqual((await readdir(path.dirname(staged))).sort(),[path.basename(staged),'UPSTREAM.LICENSE'].sort());
 const evidence={childPid:child.pid,exit,staged,partialBytes:12,partialPreserved:true,retry:result,scope:'Injected partial filesystem write and confirmed child exit, followed by actual helper retry; no power-loss or automatic stale-file cleanup claim'};
 await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({root,partialPreserved:true,retryPassed:true}));
}finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}}
