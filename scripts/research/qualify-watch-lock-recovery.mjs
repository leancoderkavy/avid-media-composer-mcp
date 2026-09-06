import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';

const root=path.resolve('.avid-mcp-analysis',`watch-lock-recovery-${randomUUID()}`),folder=path.join(root,'incoming');await mkdir(folder,{recursive:true});
assert.ok(process.argv.slice(2).every(value=>['--installed','--guard-crash'].includes(value)));
let entry=path.resolve('dist/index.js'),installation;
if(process.argv.includes('--installed')){
 const run=async args=>{const result=await runProcess(process.execPath,args,{timeoutMs:120000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout);};
 const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),packed=await run([npm,'pack','--json','--ignore-scripts','--pack-destination',root]);
 assert.equal(path.basename(packed[0].filename),packed[0].filename);
 const archive=path.join(root,packed[0].filename),archiveSha256=await sha256File(archive);
 installation=await run(['dist/cli.js','--package-install',archive,'--package-root',path.join(root,'packages'),'--package-sha256',archiveSha256]);entry=installation.entry;
}
const entrySha256=await sha256File(entry);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',copy=path.join(folder,'clip.mp4');
assert.equal(await sha256File(source),id);await copyFile(source,copy,1);
const env={...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'};
const connect=async()=>{const client=new Client({name:'watch-lock-recovery',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],stderr:'pipe',env}));return client;};
let client=await connect(),child;const events=[];
const call=async(name,args,expectError=false)=>{const response=await client.callTool({name,arguments:args});events.push({name,args,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.equal(Boolean(response.isError),expectError);return response.structuredContent?.data;};
try{
 const watch=await call('avid_configure_watch_folder',{options:{folder}});assert.equal((await call('avid_scan_watch_folder',{watchId:watch.id})).pending,1);
 const manifest=path.join(root,'avid-mcp-library','watches',watch.id+'.json'),before=await sha256File(manifest);
 const module=name=>JSON.stringify(pathToFileURL(path.resolve(path.dirname(entry),name)).href);
 const script=`import {WatchFolders} from ${module('library/watch-folders.js')};
import {MediaLibrary} from ${module('library/media-library.js')};
import {loadConfig} from ${module('config.js')};
const original=MediaLibrary.prototype.index;
MediaLibrary.prototype.index=async function(...args){const result=await original.apply(this,args);console.log('INDEX_COMPLETE_PAUSED');setInterval(()=>{},1000);await new Promise(()=>{});return result;};
await new WatchFolders(loadConfig(process.env)).scan(${JSON.stringify(watch.id)});`;
 const scriptFile=path.join(root,'owned-watch-worker.mjs');await writeFile(scriptFile,script,{flag:'wx'});
 child=spawn(process.execPath,[scriptFile],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 const exited=once(child,'exit');let stderr='';child.stderr.on('data',data=>{stderr+=data.toString();});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Timed out waiting for owned index pause: '+stderr)),90000);child.stdout.on('data',data=>{output+=data.toString();if(output.includes('INDEX_COMPLETE_PAUSED')){clearTimeout(timer);resolve();}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Owned child exited early: '+code+' '+stderr));});});
 const live=await call('avid_watch_lock_status',{watchId:watch.id});assert.equal(live.owner.pid,child.pid);assert.equal(live.recoverable,false);
 await call('avid_recover_watch_lock',{watchId:watch.id,expectedSha256:live.sha256},true);
 assert.equal(await sha256File(manifest),before);child.kill('SIGKILL');const exit=await exited;assert.ok(child.exitCode!==null||child.signalCode!==null);
 await client.close();client=await connect();
 const stopped=await call('avid_watch_lock_status',{watchId:watch.id});assert.equal(stopped.recoverable,true);assert.equal(stopped.sha256,live.sha256);
 await call('avid_recover_watch_lock',{watchId:watch.id,expectedSha256:'0'.repeat(64)},true);
 const recovered=await call('avid_recover_watch_lock',{watchId:watch.id,expectedSha256:stopped.sha256});assert.equal(recovered.released,true);assert.equal(await sha256File(manifest),before);
 const archive=JSON.parse(await readFile(recovered.archive,'utf8'));assert.equal(archive.lock.sha256,stopped.sha256);
 const resumed=await call('avid_scan_watch_folder',{watchId:watch.id});assert.equal(resumed.indexed[0].id,id);
 const stable=await call('avid_scan_watch_folder',{watchId:watch.id});assert.deepEqual(stable.indexed,[]);
 const scanOwnerPid=child.pid;
 // Also terminate initial creation after ownership is recorded, before any manifest exists.
 const createScript=`import {WatchFolders} from ${module('library/watch-folders.js')};
import {loadConfig} from ${module('config.js')};
WatchFolders.prototype.save=async function(record){console.log('CREATE_PAUSED:'+record.id);setInterval(()=>{},1000);await new Promise(()=>{});};
await new WatchFolders(loadConfig(process.env)).configure({folder:${JSON.stringify(folder)}});`;
 const createFile=path.join(root,'owned-create-worker.mjs');await writeFile(createFile,createScript,{flag:'wx'});
 child=spawn(process.execPath,[createFile],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});const creationExited=once(child,'exit');child.stderr.resume();
 const orphanId=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Creation pause timeout')),30000);child.stdout.on('data',data=>{output+=data.toString();const match=output.match(/CREATE_PAUSED:([a-f0-9-]{36})/);if(match){clearTimeout(timer);resolve(match[1]);}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Creation exited early: '+code));});});
 const orphanManifest=path.join(root,'avid-mcp-library','watches',orphanId+'.json');await assert.rejects(readFile(orphanManifest),{code:'ENOENT'});
 const liveOrphan=await call('avid_watch_lock_status',{watchId:orphanId});assert.equal(liveOrphan.configurationPresent,false);assert.equal(liveOrphan.recoverable,false);
 await call('avid_recover_watch_lock',{watchId:orphanId,expectedSha256:liveOrphan.sha256},true);
 child.kill('SIGKILL');const creationExit=await creationExited;await client.close();client=await connect();
 const orphanDiscovery=(await call('avid_list_watch_folders',{})).find(item=>item.id===orphanId);assert.equal(orphanDiscovery.configurationMissing,true);assert.equal(orphanDiscovery.lock.recoverable,true);
 const creation={ownerPid:child.pid,exit:creationExit,liveOrphan,orphanDiscovery,manifestNeverPublished:true};
 if(process.argv.includes('--guard-crash')){
  const guardFile=path.join(root,'avid-mcp-library','watches',orphanId+'.recovery.lock');
  const recoveryScript=`import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
const original=fs.open;fs.open=async function(file,...args){const handle=await original(file,...args);if(file===${JSON.stringify(guardFile)}){const close=handle.close.bind(handle);handle.close=async()=>{await close();console.log('GUARD_PAUSED');setInterval(()=>{},1000);await new Promise(()=>{});};}return handle;};syncBuiltinESMExports();
const {WatchFolders}=await import(${module('library/watch-folders.js')});const {loadConfig}=await import(${module('config.js')});
await new WatchFolders(loadConfig(process.env)).recoverLock(${JSON.stringify(orphanId)},${JSON.stringify(orphanDiscovery.lock.sha256)});`;
  const recoveryFile=path.join(root,'owned-recovery-worker.mjs');await writeFile(recoveryFile,recoveryScript,{flag:'wx'});
  child=spawn(process.execPath,[recoveryFile],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});const recoveryExited=once(child,'exit');let errors='';child.stderr.on('data',data=>{errors+=data.toString();});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Guard pause timeout: '+errors)),30000);child.stdout.on('data',data=>{output+=data.toString();if(output.includes('GUARD_PAUSED')){clearTimeout(timer);resolve();}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Recovery exited early: '+code+' '+errors));});});
  const during=await call('avid_watch_lock_status',{watchId:orphanId});assert.equal(during.locked,false);assert.equal(during.blockedByRecoveryGuard,true);assert.equal(during.recoverable,false);
  child.kill('SIGKILL');const recoveryExit=await recoveryExited;await client.close();client=await connect();
  const retained=await call('avid_watch_lock_status',{watchId:orphanId});assert.deepEqual(retained,during);
  const discovery=(await call('avid_list_watch_folders',{})).find(item=>item.id===orphanId);assert.equal(discovery.lock.blockedByRecoveryGuard,true);
  await call('avid_scan_watch_folder',{watchId:orphanId},true);await call('avid_recover_watch_lock',{watchId:orphanId,expectedSha256:orphanDiscovery.lock.sha256},true);
  assert.equal(await sha256File(guardFile),retained.recoveryGuard.sha256);await assert.rejects(readFile(orphanManifest),{code:'ENOENT'});
  creation.interruptedRecovery={ownerPid:child.pid,exit:recoveryExit,during,retained,discovery,guardPreserved:true};
 }else{
  const orphanRecovery=await call('avid_recover_watch_lock',{watchId:orphanId,expectedSha256:orphanDiscovery.lock.sha256});assert.equal(orphanRecovery.released,true);await assert.rejects(readFile(orphanManifest),{code:'ENOENT'});
  assert.equal((await call('avid_list_watch_folders',{})).some(item=>item.id===orphanId),false);
  const replacement=await call('avid_configure_watch_folder',{options:{folder}});assert.notEqual(replacement.id,orphanId);Object.assign(creation,{orphanRecovery,replacement});
 }
 assert.equal(await sha256File(source),id);assert.equal(await sha256File(copy),id);
 assert.equal(await sha256File(entry),entrySha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({entry,entrySha256,installation,watchId:watch.id,ownerPid:scanOwnerPid,exit,live,stopped,recovered,resumed,stable,creation,checkpointPreservedAtRecovery:true,sourceAndCopyUnchanged:true,scope:'Real owned Node processes terminated after Sonoma indexing and during initial watch creation before manifest publication. Actual MCP live-owner refusal, reconnect, discovery, checksum refusal, stopped-owner recovery and resumed scanning/configuration. Not power-loss, shared-host or descendant-containment qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await client.close();}
