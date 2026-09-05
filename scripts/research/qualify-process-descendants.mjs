import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {runProcess} from '../../dist/process.js';
const root=path.resolve('.avid-mcp-analysis',`process-descendants-${randomUUID()}`);await mkdir(root);const conditions=[];
for(const detached of [false,true])for(const mode of ['timeout','overflow']){
 const directory=path.join(root,`${mode}-${detached?'detached':'ordinary'}`);await mkdir(directory);const pidFile=path.join(directory,'child.pid'),ticks=path.join(directory,'child.ticks'),stop=path.join(directory,'stop');
 const descendant="const fs=require('fs');fs.writeFileSync(process.argv[1],String(process.pid));fs.writeFileSync(process.argv[2],'ready');setInterval(()=>{if(fs.existsSync(process.argv[3]))process.exit(0);fs.appendFileSync(process.argv[2],'x');},20);";
 const wrapper="const fs=require('fs');const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',process.argv[1],process.argv[2],process.argv[3],process.argv[4]],{stdio:'ignore',windowsHide:true,detached:process.argv[6]==='true'});child.unref();setInterval(()=>{if(fs.existsSync(process.argv[2])&&process.argv[5]==='overflow')process.stdout.write('x'.repeat(1024));},20);";
 let pid,error,aliveAtReturn=false,continuedWriting=false,cleanupVerified=false;
 try{
   try{await runProcess(process.execPath,['-e',wrapper,descendant,pidFile,ticks,stop,mode,String(detached)],{timeoutMs:2000,maxOutputBytes:64});}catch(value){error=value;}
   assert.equal(error?.code,mode==='timeout'?'PROCESS_TIMEOUT':'PROCESS_OUTPUT_LIMIT');pid=Number(await readFile(pidFile,'utf8'));assert.ok(Number.isSafeInteger(pid)&&pid>0);
   try{process.kill(pid,0);aliveAtReturn=true;}catch(value){assert.equal(value.code,'ESRCH');}
   const before=(await stat(ticks)).size;await new Promise(resolve=>setTimeout(resolve,150));continuedWriting=(await stat(ticks)).size>before;
 }finally{
   // The original fixture cooperatively exits on its unique stop file. No arbitrary PID is killed.
   await writeFile(stop,'stop',{flag:'wx'});
   if(!pid){try{pid=Number(await readFile(pidFile,'utf8'));}catch{}}
   if(pid){const deadline=Date.now()+10000;while(Date.now()<deadline){try{process.kill(pid,0);}catch(value){assert.equal(value.code,'ESRCH');cleanupVerified=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(cleanupVerified,'Owned descendant did not confirm exit');}
 }
 conditions.push({mode,detached,code:error.code,pid,aliveAtReturn,continuedWriting,cleanupVerified});
}
const evidence=path.join(root,'evidence.json');await writeFile(evidence,JSON.stringify({checkedAt:new Date().toISOString(),platform:process.platform,conditions,scope:'Direct runner failure is not process-tree closure. Owned descendant fixtures stop cooperatively and exit is verified. Research exposes a lifecycle gap; it does not qualify cleanup.'},null,2));console.log(JSON.stringify({evidence,conditions}));
