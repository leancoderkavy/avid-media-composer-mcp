import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.argv[2]==='owner'){
 const {runProcess}=await import('../../dist/process.js');
 const worker="const fs=require('fs');fs.writeFileSync(process.argv[1],String(process.pid));fs.writeFileSync(process.argv[2],'ready');const end=Date.now()+30000;setInterval(()=>{if(fs.existsSync(process.argv[3])||Date.now()>end)process.exit(0);fs.appendFileSync(process.argv[2],'x');},20);";
 const files=process.argv.slice(3,6);
 const wrapper="const {spawn}=require('child_process');spawn(process.execPath,['-e',process.argv[1],...process.argv.slice(2)],{detached:true,windowsHide:true,stdio:'ignore'}).unref();setTimeout(()=>process.exit(0),30000);";
 await runProcess(process.execPath,process.argv[6]==='detached'?['-e',wrapper,worker,...files]:['-e',worker,...files],{timeoutMs:60000});
}else{
 const root=path.resolve('.avid-mcp-analysis',`process-owner-crash-${randomUUID()}`);await mkdir(root);
 const pidFile=path.join(root,'worker.pid'),ticks=path.join(root,'worker.ticks'),stop=path.join(root,'stop');
 const mode=process.argv.includes('--detached')?'detached':'direct';
 const owner=spawn(process.execPath,[fileURLToPath(import.meta.url),'owner',pidFile,ticks,stop,mode],{windowsHide:true,stdio:'ignore'});
 const closed=new Promise(resolve=>owner.once('close',(code,signal)=>resolve({code,signal})));
 let pid,termination,continuedWriting=false,cleanupVerified=false;
 try{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   try{pid=Number(await readFile(pidFile,'utf8'));if(Number.isSafeInteger(pid)&&pid>0)break;}catch(error){if(error.code!=='ENOENT')throw error;}
   if(owner.exitCode!==null||owner.signalCode!==null)throw new Error('Owner exited before worker was observed');
   await delay(25);
  }
  assert.ok(Number.isSafeInteger(pid)&&pid>0,'Worker was not observed');
  process.kill(pid,0);assert.equal(owner.kill('SIGKILL'),true);termination=await closed;
  const before=(await stat(ticks)).size;await delay(250);continuedWriting=(await stat(ticks)).size>before;
 }finally{
  await writeFile(stop,'stop',{flag:'wx'});
  if(owner.exitCode===null&&owner.signalCode===null)owner.kill('SIGKILL');await closed;
  if(!pid){try{pid=Number(await readFile(pidFile,'utf8'));}catch{}}
  if(pid){const deadline=Date.now()+10000;while(Date.now()<deadline){try{process.kill(pid,0);}catch(error){assert.equal(error.code,'ESRCH');cleanupVerified=true;break;}await delay(50);}assert.ok(cleanupVerified,'Worker cleanup not verified');}
 }
 const evidence={platform:process.platform,mode,termination,continuedWriting,cleanupVerified,scope:'Production runProcess owner killed abruptly; owned direct or detached Node worker with cooperative stop and 30-second self-expiry. No actual npm download or arbitrary worker containment proved.'};
 await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({root,...evidence}));
}
