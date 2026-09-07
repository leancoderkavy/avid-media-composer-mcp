import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [basePython,mode]=process.argv.slice(2);assert.ok(process.argv.length===3||process.argv.length===4&&mode==='--receipt');assert.ok(path.isAbsolute(basePython));const receiptMode=mode==='--receipt';
const root=path.resolve('.avid-mcp-analysis',`python-install-interruption-${randomUUID()}`);await mkdir(root);
const directory=path.join(root,'interrupted'),ready=path.join(root,'ready.json'),loader=path.join(root,'barrier.mjs'),cli=path.resolve('dist/cli.js');
await writeFile(loader,`import fs from 'node:fs/promises';import path from 'node:path';import {syncBuiltinESMExports} from 'node:module';
const original=fs.writeFile,originalLink=fs.link;async function pause(temporary){await original(process.env.AVID_RESEARCH_READY,JSON.stringify({pid:process.pid,temporary}));await new Promise(()=>setInterval(()=>{},1000));}
fs.writeFile=async function(file,...args){const result=await original(file,...args);if(process.env.AVID_RESEARCH_RECEIPT!=='1'&&path.resolve(String(file))===path.join(process.env.AVID_RESEARCH_DIRECTORY,'attempt.json'))await pause();return result;};
fs.link=async function(source,destination){if(process.env.AVID_RESEARCH_RECEIPT==='1'&&path.resolve(String(destination))===path.join(process.env.AVID_RESEARCH_DIRECTORY,'installation.json'))await pause(String(source));return originalLink(source,destination);};syncBuiltinESMExports();`);
const child=spawn(process.execPath,['--import',pathToFileURL(loader).href,cli,'--install-python-runtime',directory,'--python',basePython],{stdio:['ignore','ignore','pipe'],windowsHide:true,env:{...process.env,AVID_RESEARCH_DIRECTORY:directory,AVID_RESEARCH_READY:ready,AVID_RESEARCH_RECEIPT:receiptMode?'1':'0'}});
let error='';child.stderr.on('data',chunk=>{error=(error+chunk).slice(-4096);});
const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));child.on('error',()=>{});
async function status(){const result=await runProcess(process.execPath,[cli,'--python-runtime-status',directory],{timeoutMs:15000,maxOutputBytes:65536,cwd:root});assert.equal(result.exitCode,0,JSON.stringify(result));return JSON.parse(result.stdout);}
try{
 const deadline=Date.now()+120000;let observed;
 while(Date.now()<deadline){try{observed=JSON.parse(await readFile(ready,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}
  assert.equal(child.exitCode,null,error);await new Promise(resolve=>setTimeout(resolve,50));}
 assert.equal(observed?.pid,child.pid,'Expected owned installer at the attempt barrier');
 const before=await status();assert.equal(before.state,'incomplete');assert.equal(before.workerState,'unknown');assert.equal(child.exitCode,null);
 let stagedHash;
 if(receiptMode){
  assert.equal(path.dirname(observed.temporary),directory);assert.match(path.basename(observed.temporary),/^\.installation-[a-f0-9-]+\.tmp$/);
  const staged=JSON.parse(await readFile(observed.temporary,'utf8'));assert.equal(staged.kind,'avid-core-python');assert.equal(staged.versions.pyavb,'1.4.0');stagedHash=await sha256File(observed.temporary);
 }else await assert.rejects(stat(path.join(directory,'runtime')),{code:'ENOENT'});
 const attemptHash=await sha256File(path.join(directory,'attempt.json'));
 child.kill();const termination=await closed;
 const after=await status();assert.deepEqual(after,before);assert.equal(await sha256File(path.join(directory,'attempt.json')),attemptHash);
 const retry=await runProcess(process.execPath,[cli,'--install-python-runtime',directory,'--python',basePython],{timeoutMs:15000,maxOutputBytes:65536});assert.notEqual(retry.exitCode,0);assert.match(retry.stderr,/EEXIST/);
 assert.equal(await sha256File(path.join(directory,'attempt.json')),attemptHash);
 if(receiptMode)assert.equal(await sha256File(observed.temporary),stagedHash);
 await assert.rejects(stat(path.join(directory,'installation.json')),{code:'ENOENT'});
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,receiptMode,stagedHash,before,after,termination,attemptHash,retry,scope:'Production CLI paused after attempt publication or after completing the staged success receipt but before linking it. Status reported incomplete while live and after confirmed owned-child closure; retry refused and records retained. Not mid-pip termination, power loss or descendant containment.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await closed;}}
