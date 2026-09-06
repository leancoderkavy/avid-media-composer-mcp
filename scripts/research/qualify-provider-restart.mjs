import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyWindowsLoopbackOwner} from '../../dist/integrations/loopback-owner.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {JumperReadClient} from '../../dist/integrations/jumper.js';

assert.equal(process.platform,'win32');
const root=path.resolve('.avid-mcp-analysis',`provider-restart-${randomUUID()}`);await mkdir(root);
const children=[];
async function start(port){
  const source=`const http=require('node:http');const server=http.createServer((req,res)=>{console.log('request');res.setHeader('content-type','application/json');res.end('{"status":"ok"}');});server.listen(${port},'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));`;
  const child=spawn(process.execPath,['-e',source],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const record={child,requests:0,closed:false};children.push(record);
  record.done=new Promise(resolve=>child.once('close',()=>{record.closed=true;resolve();}));
  return await new Promise((resolve,reject)=>{
    let pending='';const timer=setTimeout(()=>reject(new Error('Fixture startup timeout')),10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Fixture exited during startup'));});
    child.stdout.on('data',chunk=>{
      pending+=chunk.toString();let end;
      while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);
        if(line==='request'){record.requests++;continue;}
        try{const ready=JSON.parse(line);assert.ok(Number.isInteger(ready.port));record.port=ready.port;clearTimeout(timer);resolve(record);}catch(error){clearTimeout(timer);reject(error);}
      }
    });
  });
}
async function stop(record){if(!record.closed){record.child.kill();await record.done;}}
try{
  const sha256=await sha256File(process.execPath),first=await start(0);
  const qualification={binary:process.execPath,sha256,address:'127.0.0.1',port:first.port};
  const old=await verifyWindowsLoopbackOwner(qualification);
  const clientFor=owner=>new JumperReadClient({baseUrl:`http://127.0.0.1:${first.port}/api/v1`,licenseKey:'fixture-unused-health-key',allowedRoots:[root],owner:{binary:owner.binary,sha256:owner.sha256,identity:owner.identity}});
  await clientFor(old).health();await stop(first);
  const second=await start(first.port),fresh=await verifyWindowsLoopbackOwner(qualification);
  assert.notEqual(old.identity,fresh.identity);
  await assert.rejects(()=>clientFor(old).health(),error=>error.code==='PROVIDER_OWNER_UNVERIFIED');
  assert.equal(second.requests,0);
  await clientFor(fresh).health();await stop(second);
  assert.equal(first.requests,1);assert.equal(second.requests,1);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,old,fresh,firstRequests:first.requests,secondRequests:second.requests,stalePairingRefused:true,limitations:'Harness-owned Windows processes reused the same port. Health fixture only; no licensed provider, media search or connection-race proof.'},null,2));
  console.log(JSON.stringify({ok:true,root}));
}finally{for(const child of children)await stop(child);}
