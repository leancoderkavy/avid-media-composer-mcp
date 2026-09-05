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
