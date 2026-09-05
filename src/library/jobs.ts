import {spawn, type ChildProcess} from "node:child_process";
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

const id=z.string().regex(/^[a-f0-9]{64}$/);
export const jobSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("visual_resume"),runId:z.string().uuid()}).strict(),
  z.object({kind:z.literal("visual_shots"),id,options:shotOptions}).strict(),
  z.object({kind:z.literal("shots"),id,options:shotOptions}).strict(),
  z.object({kind:z.literal("summary"),id,transcriptRevision:z.string().uuid()}).strict(),
  z.object({kind:z.literal("qc"),id,options:qcOptions}).strict(),
  z.object({kind:z.literal("index"),files:z.array(z.string()).min(1).max(100)}).strict(),
  z.object({kind:z.literal("visual"),ids:z.array(id).min(1).max(100),samples:z.number().int().min(1).max(120),range:visualRange.optional()}).strict(),
  z.object({kind:z.literal("speech"),id,start:z.number().nonnegative(),end:z.number().positive(),options:speechOptions.default({model:"tiny.en",language:"auto"})}).strict(),
  z.object({kind:z.literal("people"),ids:z.array(id).min(1).max(20),samples:z.number().int().min(1).max(24),threshold:z.number().min(0).max(1).default(0.45)}).strict(),
  z.object({kind:z.literal("artifact"),id,format:z.enum(["thumbnail","clip","copy"]),start:z.number().nonnegative(),end:z.number().positive().optional()}).strict(),
]);
type JobSpec=z.infer<typeof jobSchema>;
interface Job {id:string;spec:JobSpec;status:"queued"|"running"|"cancelling"|"completed"|"failed"|"cancelled";createdAt:string;result?:unknown;error?:string;child?:ChildProcess;journalError?:string}

export class AnalysisJobs {
  private jobs=new Map<string,Job>();
  private active=0;
  private closing=false;
  readonly journal:JobJournal;
  constructor(private readonly config:ServerConfig){this.journal=new JobJournal(config);}
  async start(input:JobSpec){
    if(this.closing)throw new Error("Analysis service is closing");
    requireCapability(this.config.capabilities,"inspect");
    const spec=jobSchema.parse(input);
    if(spec.kind!=="index"&&spec.kind!=="summary")requireCapability(this.config.capabilities,"export");
    if(spec.kind==="speech"||spec.kind==="people"||spec.kind==="summary")requireCapability(this.config.capabilities,"project-write");
    if([...this.jobs.values()].filter(job=>["queued","running","cancelling"].includes(job.status)).length>=20)throw new Error("Analysis queue is full");
    if(this.jobs.size>=100){const finished=[...this.jobs.values()].find(job=>!["queued","running","cancelling"].includes(job.status));if(finished)this.jobs.delete(finished.id);}
    const job:Job={id:randomUUID(),spec,status:"queued",createdAt:new Date().toISOString()};
    this.jobs.set(job.id,job);
    try{await this.persist(job);}catch(error){this.jobs.delete(job.id);throw error;}
    this.pump();return this.status(job.id);
  }
  private persist(job:Job){const {child,journalError,...record}=job;return this.journal.save(record);}
  private checkpoint(job:Job){void this.persist(job).catch(error=>{job.journalError=(error as Error).message;});}
  async readStatus(id:string){const current=this.jobs.get(id);return current?this.status(id):this.journal.read(id);}
  status(id:string){const job=this.jobs.get(id);if(!job)throw new Error("Unknown job in this MCP session");const{child,...value}=job;return value;}
  cancel(id:string){
    const job=this.jobs.get(id);if(!job)throw new Error("Unknown job");
    if(!["queued","running"].includes(job.status))return this.status(id);
    job.status=job.child?"cancelling":"cancelled";
    this.checkpoint(job);
    if(job.child?.pid){
      if(process.platform==="win32"){
        // The PID belongs to the worker created below; terminate its ffmpeg descendants too.
        const killer=spawn("taskkill.exe",["/PID",String(job.child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore",shell:false});
        killer.on("error",()=>job.child?.kill());
        killer.on("close",code=>{if(code!==0&&job.child)job.child.kill();});
      }else job.child.kill("SIGTERM");
    }
    this.pump();return this.status(id);
  }
  close(){this.closing=true;for(const job of this.jobs.values())if(["running","queued"].includes(job.status))this.cancel(job.id);}
  private pump(){
    if(this.closing||this.active>=1)return; // Bound model memory; future concurrency must be measured.
    const job=[...this.jobs.values()].find(job=>job.status==="queued");
    if(!job)return;
    this.active++;job.status="running";
    this.checkpoint(job);
    const child=spawn(process.execPath,[fileURLToPath(new URL("./worker.js",import.meta.url))],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false,env:{...process.env,POSTHOG_API_KEY:""}});
    job.child=child;
    let output="",error="",settled=false;
    const timer=setTimeout(()=>this.cancel(job.id),15*60_000);timer.unref();
    const finish=(failure?:string)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(job.status==="cancelling")job.status="cancelled";
      else if(job.status!=="cancelled"){
        try{if(failure)throw new Error(failure);job.result=JSON.parse(output);job.status="completed";}
        catch(e){job.error=(e as Error).message;job.status="failed";}
      }
      delete job.child;this.checkpoint(job);this.active--;this.pump();
    };
    let outputBytes=0;
    child.stdout.on("data",chunk=>{
      if(job.status==="cancelling"||job.status==="cancelled")return;
      outputBytes+=Buffer.byteLength(chunk);
      if(outputBytes>2*1024*1024){job.error="Worker output exceeded 2 MiB; cancellation requested";this.cancel(job.id);return;}
      output+=chunk.toString();
    });
    child.stderr.on("data",chunk=>{error=(error+chunk.toString()).slice(-4096);});
    child.on("error",e=>{
      // A failed kill can emit error while the worker is still alive. Only a spawn
      // failure without a PID is terminal before close.
      if(!child.pid)finish(e.message);
      else {job.error=e.message;this.checkpoint(job);}
    });
    child.on("close",code=>finish(code===0?undefined:error||`Worker exited ${code}`));
    child.stdin.on("error",()=>{});
    child.stdin.end(JSON.stringify({config:{...this.config,capabilities:[...this.config.capabilities]},spec:job.spec}));
  }
}
