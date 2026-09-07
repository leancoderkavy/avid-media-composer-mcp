import {spawn,type ChildProcess} from "node:child_process";
/** Bounded counts classified from taskkill output; no message text is retained. */
export interface TaskkillOutcome {terminated:number;notFound:number;accessDenied:number;unclassified:number;rootNotFound:boolean;truncated:boolean}
export interface TreeTermination {method:"windows-taskkill";succeeded:boolean;reason?:string;exitCode?:number|null;outcome?:TaskkillOutcome}
const MAX_LINES=2000,MAX_OUTPUT_BYTES=256*1024;
/**
 * Classify English taskkill lines into counts. Localized or unexpected lines are
 * counted as unclassified rather than interpreted. Refusal announcements are
 * classified by their following "Reason:" line so each refusal counts once.
 */
export function classifyTaskkillOutput(output:string,rootPid:number):TaskkillOutcome{
  const outcome:TaskkillOutcome={terminated:0,notFound:0,accessDenied:0,unclassified:0,rootNotFound:false,truncated:false};
  let seen=0,pendingRefusal=false;
  // A refusal announcement is resolved by its Reason line; an orphaned announcement is unclassified.
  const settleRefusal=()=>{if(pendingRefusal){outcome.unclassified++;pendingRefusal=false;}};
  for(const raw of output.split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    if(++seen>MAX_LINES){outcome.truncated=true;break;}
    if(/^Reason: Access is denied\.$/.test(line)){outcome.accessDenied++;pendingRefusal=false;continue;}
    if(/^Reason: There is no running instance of the task\.$/.test(line)){outcome.notFound++;pendingRefusal=false;continue;}
    settleRefusal();
    if(/^SUCCESS: The process with PID \d+( \(child process of PID \d+\))? has been terminated\.$/.test(line)){outcome.terminated++;continue;}
    const missing=/^ERROR: The process "(\d+)" not found\.$/.exec(line);
    if(missing){outcome.notFound++;if(Number(missing[1])===rootPid)outcome.rootNotFound=true;continue;}
    if(/^ERROR: The process with PID \d+( \(child process of PID \d+\))? could not be terminated\.$/.test(line)){pendingRefusal=true;continue;}
    outcome.unclassified++;
  }
  settleRefusal();
  return outcome;
}
/** Only targets the live child handle created by our caller. Non-Windows is unqualified. */
export function terminateWindowsTree(child:ChildProcess):Promise<TreeTermination>|undefined{
  if(process.platform!=="win32")return undefined;
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return Promise.resolve({method:"windows-taskkill",succeeded:false,reason:"Parent is no longer live; descendants unverified"});
  const rootPid=child.pid;
  return new Promise(resolve=>{
    const killer=spawn("taskkill.exe",["/PID",String(rootPid),"/T","/F"],{windowsHide:true,shell:false,stdio:["ignore","pipe","pipe"]});
    let finished=false,timedOut=false,captured="",capturedBytes=0;
    const collect=(chunk:Buffer|string)=>{
      const text=chunk.toString();capturedBytes+=Buffer.byteLength(text);
      if(capturedBytes<=MAX_OUTPUT_BYTES)captured+=text;
    };
    killer.stdout?.on("data",collect);killer.stderr?.on("data",collect);
    const finish=(succeeded:boolean,reason?:string,exitCode?:number|null)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      const outcome=exitCode===undefined?undefined:classifyTaskkillOutput(captured,rootPid);
      if(outcome&&capturedBytes>MAX_OUTPUT_BYTES)outcome.truncated=true;
      resolve({method:"windows-taskkill",succeeded,...(reason?{reason}:{}),...(exitCode!==undefined?{exitCode}:{}),...(outcome?{outcome}:{})});
    };
    const timer=setTimeout(()=>{
      timedOut=true;
      try{killer.kill("SIGKILL");}catch{/* Report uncertainty even when the kill request fails. */}
      finish(false,"Tree termination timed out; termination-process closure and descendants unverified");
    },5000);timer.unref();
    killer.on("error",()=>{if(!killer.pid)finish(false,"Tree termination could not start");});
    killer.on("close",code=>finish(!timedOut&&code===0,timedOut?"Tree termination timed out":code===0?undefined:"Tree termination did not report success",code));
  });
}
