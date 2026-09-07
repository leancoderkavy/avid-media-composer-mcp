// Diagnostic preload for owned research MCP sessions only. No retry or extra kill.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const root=process.env.AVID_MCP_RESEARCH_TRACE;
if(!root||!path.isAbsolute(root))throw new Error('Absolute research trace directory required');
const original=childProcess.spawn;
childProcess.spawn=function(command,args,options){
 if(command!=='taskkill.exe')return original(command,args,options);
 const child=original(command,args,{...options,stdio:['ignore','pipe','pipe']});
 let observedCode;
 if(process.env.AVID_MCP_RESEARCH_TREE_FAILURE==='1'){
  const emit=child.emit;
  child.emit=function(event,...values){
   if(event==='close'){observedCode=values[0];if(values[0]===0)values[0]=1;}
   return emit.call(this,event,...values);
  };
 }
 const chunks=[];let bytes=0;
 for(const [stream,label] of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{
  if(bytes>=65536)return;const kept=chunk.subarray(0,65536-bytes);bytes+=kept.length;chunks.push({stream:label,text:kept.toString()});
 });
 child.on('close',(code,signal)=>writeFileSync(path.join(root,`taskkill-${randomUUID()}.json`),JSON.stringify({args,code,observedCode,signal,chunks},null,2),{flag:'wx'}));
 return child;
};
syncBuiltinESMExports();
