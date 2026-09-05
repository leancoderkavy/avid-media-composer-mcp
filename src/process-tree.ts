import {spawn,type ChildProcess} from "node:child_process";
export interface TreeTermination {method:"windows-taskkill";succeeded:boolean;reason?:string}
/** Only targets the live child handle created by our caller. Non-Windows is unqualified. */
export function terminateWindowsTree(child:ChildProcess):Promise<TreeTermination>|undefined{
  if(process.platform!=="win32")return undefined;
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return Promise.resolve({method:"windows-taskkill",succeeded:false,reason:"Parent is no longer live; descendants unverified"});
  return new Promise(resolve=>{
    const killer=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,shell:false,stdio:"ignore"});
    let finished=false,timedOut=false;
    const finish=(succeeded:boolean,reason?:string)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({method:"windows-taskkill",succeeded,...(reason?{reason}:{})});};
    const timer=setTimeout(()=>{timedOut=true;killer.kill("SIGKILL");},5000);timer.unref();
    killer.on("error",()=>{if(!killer.pid)finish(false,"Tree termination could not start");});
    killer.on("close",code=>finish(!timedOut&&code===0,timedOut?"Tree termination timed out":code===0?undefined:"Tree termination did not report success"));
  });
}
