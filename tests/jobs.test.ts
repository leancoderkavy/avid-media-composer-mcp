import {mkdtemp} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {it,expect,vi,beforeEach} from "vitest";
import {AnalysisJobs} from "../src/library/jobs.js";
import {loadConfig} from "../src/config.js";
const state=vi.hoisted(()=>({workers:[] as any[],terminate:vi.fn()}));
vi.mock("../src/process-tree.js",()=>({terminateWindowsTree:state.terminate}));
vi.mock("node:child_process",()=>({spawn:vi.fn((command:string)=>{
  const child=Object.assign(new EventEmitter(),{pid:12345,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),kill:vi.fn()});
  if(command===process.execPath)state.workers.push(child);return child;
})}));
beforeEach(()=>{state.workers=[];state.terminate.mockReset().mockResolvedValue({method:"windows-taskkill",succeeded:true});});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-worker-"));return new AnalysisJobs(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}));}
it('preserves Unicode result text split across every UTF-8 byte',async()=>{
 const jobs=await fixture(),job=await jobs.start({kind:'index',files:['fixture.mp4']}),result={name:'Café 東京 🎬',text:'naïve résumé'};
 for(const byte of Buffer.from(JSON.stringify(result)))state.workers[0].stdout.emit('data',Buffer.from([byte]));state.workers[0].emit('close',0,null);
 expect(await jobs.readStatus(job.id)).toMatchObject({status:'completed',result});expect(await jobs.journal.read(job.id)).toMatchObject({result});jobs.close();
});
it('rejects malformed UTF-8 instead of publishing replacement characters',async()=>{
 const jobs=await fixture(),job=await jobs.start({kind:'index',files:['fixture.mp4']});
 state.workers[0].stdout.emit('data',Buffer.concat([Buffer.from('{"name":"'),Buffer.from([0xc3]),Buffer.from('"}')]));state.workers[0].emit('close',0,null);
 const record=await jobs.readStatus(job.id);expect(record.status).toBe('failed');expect(record.result).toBeUndefined();jobs.close();
});
it.each([[9,null],[null,'SIGKILL']] as const)('persists unexpected worker exit %s/%s and advances the queue',async(code,signal)=>{
 const jobs=await fixture(),first=await jobs.start({kind:'index',files:['first.mp4']}),next=await jobs.start({kind:'index',files:['next.mp4']});
 state.workers[0].stdout.emit('data',Buffer.from('{"partial":true}'));state.workers[0].emit('close',code,signal);
 const failed=await jobs.readStatus(first.id);expect(failed).toMatchObject({status:'failed',workerExit:{code,signal}});expect(failed.result).toBeUndefined();
 expect(await jobs.journal.read(first.id)).toMatchObject({status:'failed',workerExit:{code,signal},automaticReplay:false});
 expect(state.workers).toHaveLength(2);expect(jobs.status(next.id).status).toBe('running');
 state.workers[1].stdout.emit('data',Buffer.from('{"entries":[]}'));state.workers[1].emit('close',0,null);
 expect(await jobs.readStatus(next.id)).toMatchObject({status:'completed',workerExit:{code:0,signal:null}});jobs.close();
});
it('retains user cancellation despite a successful late worker exit',async()=>{
 const jobs=await fixture(),job=await jobs.start({kind:'index',files:['first.mp4']});
 state.workers[0].stdout.emit('data',Buffer.from('{"entries":[]}'));jobs.cancel(job.id);jobs.close();state.workers[0].emit('close',0,null);
 const record=await jobs.readStatus(job.id);expect(record).toMatchObject({status:'cancelled',cancellationReason:'user',workerExit:{code:0,signal:null}});expect(record.result).toBeUndefined();
 expect(await jobs.journal.read(job.id)).toMatchObject({status:'cancelled',cancellationReason:'user'});
});
it('records timeout as distinct from user cancellation',async()=>{
 const timers=vi.spyOn(globalThis,'setTimeout');const jobs=await fixture();
 try{const job=await jobs.start({kind:'index',files:['first.mp4']});const timeout=timers.mock.calls.find(call=>call[1]===15*60_000)?.[0];expect(typeof timeout).toBe('function');(timeout as ()=>void)();state.workers[0].emit('close',1,null);expect(await jobs.readStatus(job.id)).toMatchObject({status:'cancelled',cancellationReason:'timeout'});}
 finally{timers.mockRestore();jobs.close();}
});
it.skipIf(process.platform!=="win32")("retains failed tree termination and waits for worker closure",async()=>{
 const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
 state.terminate.mockResolvedValueOnce({method:"windows-taskkill",succeeded:false,reason:"Tree termination timed out"});
 jobs.cancel(first.id);await new Promise(resolve=>setImmediate(resolve));
 expect(jobs.status(first.id)).toMatchObject({status:"cancelling",treeTermination:{succeeded:false}});
 expect(state.workers[0].kill).toHaveBeenCalledOnce();
 state.workers[0].emit("close",1);await jobs.readStatus(first.id);
 expect(await jobs.journal.read(first.id)).toMatchObject({status:"cancelled",treeTermination:{succeeded:false,reason:"Tree termination timed out"}});jobs.close();
});
it.skipIf(process.platform!=="win32").each([true,false])("waits for a late tree result (success=%s) before advancing the queue",async succeeded=>{
 let resolve!: (value:any)=>void;state.terminate.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
 const second=await jobs.start({kind:"index",files:["second.mp4"]});jobs.cancel(first.id);state.workers[0].emit("close",1);
 expect(await jobs.readStatus(first.id)).toMatchObject({status:"cancelling",workerExit:{code:1}});
 expect(state.workers).toHaveLength(1);expect(jobs.status(second.id).status).toBe("queued");
 resolve({method:"windows-taskkill",succeeded,...(!succeeded?{reason:"Tree termination did not report success"}:{})});await new Promise(done=>setImmediate(done));
 expect(state.workers[0].kill).not.toHaveBeenCalled();expect(state.workers[1].kill).not.toHaveBeenCalled();
 await jobs.readStatus(first.id);expect(await jobs.journal.read(first.id)).toMatchObject({status:"cancelled",treeTermination:{succeeded}});
 jobs.close();state.workers[1].emit("close",1);await jobs.readStatus(second.id);
});
it.skipIf(process.platform!=="win32")("shutdown during a pending tree result cancels the queue without dispatching it",async()=>{
 let release!:(value:any)=>void;state.terminate.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
 const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
 jobs.cancel(first.id);state.workers[0].emit("close",1);jobs.close();
 expect(await jobs.readStatus(first.id)).toMatchObject({status:"cancelling",cancellationReason:"user"});
 expect(await jobs.readStatus(second.id)).toMatchObject({status:"cancelled",cancellationReason:"shutdown"});
 release({method:"windows-taskkill",succeeded:true});await new Promise(resolve=>setImmediate(resolve));
 expect(await jobs.readStatus(first.id)).toMatchObject({status:"cancelled",treeTermination:{succeeded:true}});expect(state.workers).toHaveLength(1);
});
it("keeps cancellation pending and does not dispatch the next worker until close",async()=>{
  const jobs=await fixture();const first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
  expect(jobs.cancel(first.id).status).toBe("cancelling");expect(jobs.status(second.id).status).toBe("queued");expect(state.workers).toHaveLength(1);
  state.workers[0].emit("error",new Error("termination failed"));
  expect(jobs.status(first.id).status).toBe("cancelling");expect(state.workers).toHaveLength(1);
  state.workers[0].emit("close",1);await jobs.readStatus(first.id);expect(jobs.status(first.id).status).toBe("cancelled");expect(state.workers).toHaveLength(2);
  jobs.close();state.workers[1].emit("close",1);
  expect((await jobs.journal.read(first.id)).status).toBe("cancelled");
});
it("closing cancels queued work without starting it and rejects new work",async()=>{
  const jobs=await fixture();const first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
  jobs.close();expect(jobs.status(first.id)).toMatchObject({status:"cancelling",cancellationReason:"shutdown"});expect(jobs.status(second.id)).toMatchObject({status:"cancelled",cancellationReason:"shutdown"});
  state.workers[0].emit("close",1);expect(state.workers).toHaveLength(1);
  await expect(jobs.start({kind:"index",files:["third.mp4"]})).rejects.toThrow("closing");
});
it("oversized worker output requests termination and cannot become a successful result",async()=>{
  const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
  state.workers[0].stdout.emit("data",Buffer.alloc(2*1024*1024+1));
  expect(jobs.status(first.id)).toMatchObject({status:"cancelling",cancellationReason:"output_limit",error:"Worker output exceeded 2 MiB; cancellation requested"});
  state.workers[0].stdout.emit("data",Buffer.from('{}'));state.workers[0].emit("close",0);
  expect((await jobs.readStatus(first.id)).status).toBe("cancelled");expect(jobs.status(first.id).result).toBeUndefined();jobs.close();
});

it("does not expose a completed status before its terminal journal write settles",async()=>{
  const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
  await jobs.readStatus(first.id);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const original=jobs.journal.save.bind(jobs.journal);
  const save=vi.spyOn(jobs.journal,"save").mockImplementation(async record=>{
    // Delay actual disk publication rather than merely the caller's promise.
    if(record.status==="completed")await gate;
    return original(record);
  });
  state.workers[0].stdout.emit("data",Buffer.from('{"entries":[]}'));
  state.workers[0].emit("close",0);
  let settled=false;
  const reading=jobs.readStatus(first.id).then(value=>{settled=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));
  try{expect(settled).toBe(false);}finally{release();}
  expect(await reading).toMatchObject({status:"completed",result:{entries:[]}});
  expect(await jobs.journal.read(first.id)).toMatchObject({status:"completed",result:{entries:[]}});
  save.mockRestore();jobs.close();
});

it("keeps terminal persistence failures visible in status",async()=>{
  const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
  await jobs.readStatus(first.id);
  const save=vi.spyOn(jobs.journal,"save").mockRejectedValueOnce(new Error("journal volume unavailable"));
  state.workers[0].stdout.emit("data",Buffer.from('{"entries":[]}'));state.workers[0].emit("close",0);
  expect(await jobs.readStatus(first.id)).toMatchObject({status:"completed",journalError:"journal volume unavailable"});
  expect((await jobs.journal.read(first.id)).status).toBe("running");
  save.mockRestore();jobs.close();
});

it("waits for a queued cancellation record before acknowledging cancellation",async()=>{
  const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
  await jobs.readStatus(first.id);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const original=jobs.journal.save.bind(jobs.journal);
  const save=vi.spyOn(jobs.journal,"save").mockImplementation(async record=>{if(record.id===second.id&&record.status==="cancelled")await gate;return original(record);});
  let settled=false;const cancelling=jobs.cancelAndReadStatus(second.id).then(value=>{settled=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));
  try{expect(settled).toBe(false);expect(state.workers).toHaveLength(1);}finally{release();}
  expect(await cancelling).toMatchObject({status:"cancelled"});
  expect(await jobs.journal.read(second.id)).toMatchObject({status:"cancelled"});
  save.mockRestore();jobs.close();state.workers[0].emit("close",1);await jobs.readStatus(first.id);
});
