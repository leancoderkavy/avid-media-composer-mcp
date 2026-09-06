import {diarizationOptions} from "./diarization.js";
import {audioSyncOptions} from "./audio-sync-analysis.js";
import {sourceClockOptions} from "./source-clock.js";
import {visualSummaryReferences} from "./visual-summaries.js";
import {captionTimes} from "./caption-batches.js";
import {spawn, type ChildProcess} from "node:child_process";
import {terminateWindowsTree,type TreeTermination} from "../process-tree.js";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import {qcOptions} from "./qc.js";
import {shotOptions} from "./shots.js";
import {visualRange} from "./visual.js";
import type {ServerConfig} from "../config.js";
import {requireCapability} from "../security/capabilities.js";
import {JobJournal} from "./job-journal.js";
import {speechOptions} from "./speech-options.js";
import {peopleRange} from "./people.js";

const id=z.string().regex(/^[a-f0-9]{64}$/);
export const jobSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("source_clock"),options:sourceClockOptions}).strict(),
  z.object({kind:z.literal("audio_sync"),options:audioSyncOptions}).strict(),
  z.object({kind:z.literal("diarization_resume"),analysisId:z.string().uuid(),expectedSha256:id}).strict(),
  z.object({kind:z.literal("diarization"),id,start:z.number().nonnegative(),end:z.number().positive(),options:diarizationOptions.default({speakers:-1,threshold:0.5})}).strict(),
  z.object({kind:z.literal("visual_summary"),id,references:visualSummaryReferences}).strict(),
  z.object({kind:z.literal("caption_batch"),id,times:captionTimes}).strict(),
  z.object({kind:z.literal("caption_resume"),runId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("caption"),id,time:z.number().nonnegative()}).strict(),
  z.object({kind:z.literal("people_resume"),indexId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("speech_resume"),runId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("summary_resume"),runId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("visual_resume"),runId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("visual_shots"),id,options:shotOptions}).strict(),
  z.object({kind:z.literal("shots"),id,options:shotOptions}).strict(),
  z.object({kind:z.literal("summary"),id,transcriptRevision:z.string().uuid()}).strict(),
  z.object({kind:z.literal("qc"),id,options:qcOptions}).strict(),
  z.object({kind:z.literal("index"),files:z.array(z.string()).min(1).max(100)}).strict(),
  z.object({kind:z.literal("visual"),ids:z.array(id).min(1).max(100),samples:z.number().int().min(1).max(120),range:visualRange.optional()}).strict(),
  z.object({kind:z.literal("speech"),id,start:z.number().nonnegative(),end:z.number().positive(),options:speechOptions.default({model:"tiny.en",language:"auto"})}).strict(),
  z.object({kind:z.literal("people"),ids:z.array(id).min(1).max(20),samples:z.number().int().min(1).max(120),threshold:z.number().min(0).max(1).default(0.45),range:peopleRange.optional()}).strict(),
  z.object({kind:z.literal("artifact"),id,format:z.enum(["thumbnail","clip","copy"]),start:z.number().nonnegative(),end:z.number().positive().optional()}).strict(),
]);
type JobSpec=z.infer<typeof jobSchema>;
type CancellationReason="user"|"timeout"|"output_limit"|"shutdown";
interface Job {id:string;spec:JobSpec;status:"queued"|"running"|"cancelling"|"completed"|"failed"|"cancelled";createdAt:string;result?:unknown;error?:string;child?:ChildProcess;journalError?:string;treeTermination?:TreeTermination;workerExit?:{code:number|null;signal:string|null};cancellationReason?:CancellationReason}

export class AnalysisJobs {
  private jobs=new Map<string,Job>();
  private checkpoints=new Map<string,Promise<void>>();
  private terminations=new Map<string,Promise<void>>();
  private active=0;
  private closing=false;
  readonly journal:JobJournal;
  constructor(private readonly config:ServerConfig){this.journal=new JobJournal(config);}
  async start(input:JobSpec){
    if(this.closing)throw new Error("Analysis service is closing");
    requireCapability(this.config.capabilities,"inspect");
    const spec=jobSchema.parse(input);
    if(!["index","summary","summary_resume","visual_summary"].includes(spec.kind))requireCapability(this.config.capabilities,"export");
    if(["diarization_resume","diarization","visual_summary","caption_batch","caption_resume","caption","speech","speech_resume","people","people_resume","summary","summary_resume"].includes(spec.kind))requireCapability(this.config.capabilities,"project-write");
    if([...this.jobs.values()].filter(job=>["queued","running","cancelling"].includes(job.status)).length>=20)throw new Error("Analysis queue is full");
    if(this.jobs.size>=100){const finished=[...this.jobs.values()].find(job=>!["queued","running","cancelling"].includes(job.status));if(finished){this.jobs.delete(finished.id);this.checkpoints.delete(finished.id);}}
    const job:Job={id:randomUUID(),spec,status:"queued",createdAt:new Date().toISOString()};
    this.jobs.set(job.id,job);
    try{await this.persist(job);}catch(error){this.jobs.delete(job.id);throw error;}
    this.pump();return this.status(job.id);
  }
  private persist(job:Job){const {child,journalError,...record}=job;return this.journal.save(record);}
  private checkpoint(job:Job){
    this.checkpoints.set(job.id,this.persist(job).then(()=>{delete job.journalError;},error=>{job.journalError=(error as Error).message;}));
  }
  async readStatus(id:string){
    // Include a terminal checkpoint queued while an earlier write is settling.
    let pending:Promise<void>|undefined;
    do{pending=this.checkpoints.get(id);await pending;}while(pending!==this.checkpoints.get(id));
    const current=this.jobs.get(id);return current?this.status(id):this.journal.read(id);
  }
  status(id:string){const job=this.jobs.get(id);if(!job)throw new Error("Unknown job in this MCP session");const{child,...value}=job;return value;}
  async cancelAndReadStatus(id:string){this.cancel(id);return this.readStatus(id);}
  cancel(id:string,reason:CancellationReason="user"){
    const job=this.jobs.get(id);if(!job)throw new Error("Unknown job");
    if(!["queued","running"].includes(job.status))return this.status(id);
    job.cancellationReason=reason;
    job.status=job.child?"cancelling":"cancelled";
    this.checkpoint(job);
    if(job.child?.pid){
      if(process.platform==="win32"){
        // The PID belongs to the worker created below; terminate its ffmpeg descendants too.
        const child=job.child;
        const termination=terminateWindowsTree(child)!.then(result=>{
          job.treeTermination=result;
          this.checkpoint(job);
          // A failed tree kill is not proof that descendants stopped.
          if(!result.succeeded&&job.child===child)child.kill();
        });
        this.terminations.set(job.id,termination);
      }else job.child.kill("SIGTERM");
    }
    this.pump();return this.status(id);
  }
  close(){this.closing=true;for(const job of this.jobs.values())if(["running","queued"].includes(job.status))this.cancel(job.id,"shutdown");}
  async closeAndWait(){
    const closed=[...this.jobs.values()].flatMap(job=>{
      const child=job.child;if(!child?.pid)return [];
      return [new Promise<void>(resolve=>{if(child.exitCode!=null||child.signalCode!=null)resolve();else child.once("close",()=>resolve());})];
    });
    this.close();await Promise.all([...closed,...this.terminations.values()]);
    await Promise.all([...this.checkpoints.values()]);
  }
  private pump(){
    if(this.closing||this.active>=1)return; // Bound model memory; future concurrency must be measured.
    const job=[...this.jobs.values()].find(job=>job.status==="queued");
    if(!job)return;
    this.active++;job.status="running";
    this.checkpoint(job);
    const child=spawn(process.execPath,[fileURLToPath(new URL("./worker.js",import.meta.url))],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false,env:{...process.env,POSTHOG_API_KEY:""}});
    job.child=child;
    const output:Buffer[]=[];
    let error="",settled=false;
    const timer=setTimeout(()=>this.cancel(job.id,"timeout"),15*60_000);timer.unref();
    const finish=(failure?:string)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(job.status==="cancelling")job.status="cancelled";
      else if(job.status!=="cancelled"){
        try{if(failure)throw new Error(failure);job.result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(output)));job.status="completed";}
        catch(e){job.error=(e as Error).message;job.status="failed";}
      }
      delete job.child;this.terminations.delete(job.id);this.checkpoint(job);this.active--;this.pump();
    };
    let outputBytes=0;
    child.stdout.on("data",chunk=>{
      if(job.status==="cancelling"||job.status==="cancelled")return;
      outputBytes+=Buffer.byteLength(chunk);
      if(outputBytes>2*1024*1024){job.error="Worker output exceeded 2 MiB; cancellation requested";this.cancel(job.id,"output_limit");return;}
      output.push(Buffer.from(chunk));
    });
    child.stderr.on("data",chunk=>{error=(error+chunk.toString()).slice(-4096);});
    child.on("error",e=>{
      // A failed kill can emit error while the worker is still alive. Only a spawn
      // failure without a PID is terminal before close.
      if(!child.pid)finish(e.message);
      else {job.error=e.message;this.checkpoint(job);}
    });
    child.on("close",(code,signal)=>{
      job.workerExit={code,signal:signal??null};
      // Closure alone does not establish that the tree-termination attempt settled.
      // Release this handle immediately so a late failure cannot kill a closed PID.
      delete job.child;
      const failure=code===0?undefined:error||(signal?`Worker terminated by ${signal}`:`Worker exited ${code}`);
      const termination=this.terminations.get(job.id);
      if(termination){this.checkpoint(job);void termination.then(()=>finish(failure));}
      else finish(failure);
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(JSON.stringify({config:{...this.config,capabilities:[...this.config.capabilities]},spec:job.spec}));
  }
}
