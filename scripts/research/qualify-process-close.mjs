import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {runProcess} from '../../dist/process.js';
const root=path.resolve('.avid-mcp-analysis',`process-close-${randomUUID()}`);await mkdir(root);const conditions=[];
for(const mode of ['timeout','overflow']){
 const pidFile=path.join(root,`${mode}.pid`),ticks=path.join(root,`${mode}.ticks`),script=`const fs=require('fs');fs.writeFileSync(process.argv[1],String(process.pid));fs.writeFileSync(process.argv[2],'started');setInterval(()=>{fs.appendFileSync(process.argv[2],'x');${mode==='overflow'?"process.stdout.write('x'.repeat(1024));":''}},10);`;
 let error;try{await runProcess(process.execPath,['-e',script,pidFile,ticks],{timeoutMs:2000,maxOutputBytes:64});}catch(value){error=value;}
 assert.equal(error?.code,mode==='timeout'?'PROCESS_TIMEOUT':'PROCESS_OUTPUT_LIMIT');const pid=Number(await readFile(pidFile,'utf8'));let absent=false;try{process.kill(pid,0);}catch(value){assert.equal(value.code,'ESRCH');absent=true;}assert.ok(absent,'Child still exists when runner returns');
 const before=(await stat(ticks)).size;await new Promise(resolve=>setTimeout(resolve,100));assert.equal((await stat(ticks)).size,before);conditions.push({mode,pid,code:error.code,absentAtReturn:true,noFurtherWrites:true});
}
const evidence=path.join(root,'evidence.json');await writeFile(evidence,JSON.stringify({conditions,scope:'Real direct Node child processes on this host. Does not prove descendant-tree termination or arbitrary filesystem-writer exclusion.'},null,2));console.log(JSON.stringify({passed:true,evidence}));
