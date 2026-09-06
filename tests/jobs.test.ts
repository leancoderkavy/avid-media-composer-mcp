import {mkdtemp} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {it,expect,vi,beforeEach} from "vitest";
import {AnalysisJobs} from "../src/library/jobs.js";
import {loadConfig} from "../src/config.js";
const state=vi.hoisted(()=>({workers:[] as any[]}));
vi.mock("node:child_process",()=>({spawn:vi.fn((command:string)=>{
  const child=Object.assign(new EventEmitter(),{pid:12345,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),kill:vi.fn()});
  if(command===process.execPath)state.workers.push(child);return child;
})}));
beforeEach(()=>{state.workers=[];});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-worker-"));return new AnalysisJobs(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}));}
it("keeps cancellation pending and does not dispatch the next worker until close",async()=>{
  const jobs=await fixture();const first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
  expect(jobs.cancel(first.id).status).toBe("cancelling");expect(jobs.status(second.id).status).toBe("queued");expect(state.workers).toHaveLength(1);
  state.workers[0].emit("error",new Error("termination failed"));
  expect(jobs.status(first.id).status).toBe("cancelling");expect(state.workers).toHaveLength(1);
  state.workers[0].emit("close",1);expect(jobs.status(first.id).status).toBe("cancelled");expect(state.workers).toHaveLength(2);
  jobs.close();state.workers[1].emit("close",1);
  expect((await jobs.journal.read(first.id)).status).toBe("cancelled");
});
it("closing cancels queued work without starting it and rejects new work",async()=>{
  const jobs=await fixture();const first=await jobs.start({kind:"index",files:["first.mp4"]}),second=await jobs.start({kind:"index",files:["second.mp4"]});
  jobs.close();expect(jobs.status(first.id).status).toBe("cancelling");expect(jobs.status(second.id).status).toBe("cancelled");
  state.workers[0].emit("close",1);expect(state.workers).toHaveLength(1);
  await expect(jobs.start({kind:"index",files:["third.mp4"]})).rejects.toThrow("closing");
});
it("oversized worker output requests termination and cannot become a successful result",async()=>{
  const jobs=await fixture(),first=await jobs.start({kind:"index",files:["first.mp4"]});
  state.workers[0].stdout.emit("data",Buffer.alloc(2*1024*1024+1));
  expect(jobs.status(first.id)).toMatchObject({status:"cancelling",error:"Worker output exceeded 2 MiB; cancellation requested"});
  state.workers[0].stdout.emit("data",Buffer.from('{}'));state.workers[0].emit("close",0);
  expect(jobs.status(first.id).status).toBe("cancelled");expect(jobs.status(first.id).result).toBeUndefined();jobs.close();
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
