import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {AnalysisJobs} from '../../dist/library/jobs.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`worker-unicode-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sha256='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),sha256);
const file=path.join(root,'Café 東京 🎬.mp4');await copyFile(source,file,1);assert.equal(await sha256File(file),sha256);
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'});
const direct=async(input,fragmented=false)=>{
 const child=spawn(process.execPath,[path.resolve('dist/library/worker.js')],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']}),out=[],err=[];child.stdin.on('error',()=>{});
 child.stdout.on('data',chunk=>out.push(chunk));child.stderr.on('data',chunk=>err.push(chunk));
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')}));});
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
 try{if(fragmented){for(const byte of input){child.stdin.write(Buffer.from([byte]));await new Promise(resolve=>setTimeout(resolve,2));}child.stdin.end();}else child.stdin.end(input);return await ended;}finally{clearTimeout(timer);}
};
const payload=Buffer.from(JSON.stringify({config:{...config,capabilities:[...config.capabilities]},spec:{kind:'index',files:[file]}}));
const fragmented=await direct(payload,true);await writeFile(path.join(root,"fragmented-response.json"),JSON.stringify(fragmented,null,2),{flag:"wx"});assert.equal(fragmented.code,0,fragmented.stderr);const result=JSON.parse(fragmented.stdout);assert.equal(result.entries[0].file,file);assert.equal(result.entries[0].id,sha256);
const invalid=await direct(Buffer.concat([Buffer.from('{"label":"'),Buffer.from([0xc3]),Buffer.from('"}')]));assert.notEqual(invalid.code,0);assert.equal(invalid.stdout,'');assert.match(invalid.stderr,/encoding|encoded data/i);
const oversized=await direct(Buffer.alloc(1024*1024+1,0x20));assert.notEqual(oversized.code,0);assert.match(oversized.stderr,/Worker input exceeds limit/);
const jobs=new AnalysisJobs(config);let completed;
try{const started=await jobs.start({kind:'index',files:[file]});for(let i=0;i<100;i++){completed=await jobs.readStatus(started.id);if(!['queued','running'].includes(completed.status))break;await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(completed.status,'completed');assert.equal(completed.result.entries[0].file,file);
 const reopened=new AnalysisJobs(config);try{const saved=await reopened.readStatus(started.id);assert.equal(saved.status,'completed');assert.deepEqual(saved.result,completed.result);}finally{reopened.close();}
}finally{jobs.close();}
assert.equal(await sha256File(source),sha256);assert.equal(await sha256File(file),sha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({fragmentedInputVerified:true,invalidUtf8Rejected:true,byteLimitVerified:true,completed,sourceAndCopyUnchanged:true,scope:'Real MP4 indexing with Unicode path, direct byte-fragmented worker stdin, malformed/oversized input rejection, actual job result and journal reconnect. Unit tests separately force every output byte boundary; no model quality or arbitrary text encoding claim.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
