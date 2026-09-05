import {mkdtemp,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
import {JobJournal} from "../src/library/job-journal.js";
import {loadConfig} from "../src/config.js";
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-jobs-"));const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"});return {root,config,journal:new JobJournal(config)};}
const job=()=>({id:randomUUID(),status:"queued" as const,createdAt:new Date().toISOString(),spec:{kind:"index",files:["fixture.mp4"]}});
it("retains ordered terminal results across sessions and marks unfinished records unresolved",async()=>{
  const {config,journal}=await fixture(),first=job(),second=job();
  await journal.save(first);await journal.save({...first,status:"running"});await journal.save({...first,status:"completed",result:{entries:[]}});await journal.save(second);
  const restarted=new JobJournal(config);
  expect(await restarted.read(first.id)).toMatchObject({status:"completed",result:{entries:[]},unresolved:false});
  expect(await restarted.read(second.id)).toMatchObject({status:"unresolved",recordedStatus:"queued",automaticReplay:false});
  const page=await restarted.list(undefined,1);expect(page.records).toHaveLength(1);expect(page.nextAfter).toBeTruthy();
  const last=await restarted.list(page.nextAfter!,1);expect(last.records).toHaveLength(1);expect(last.records[0]!.id).not.toBe(page.records[0]!.id);expect(last.nextAfter).toBeNull();
});
it("isolates histories when path or capability scope changes",async()=>{
  const {config,journal}=await fixture(),value=job();await journal.save(value);
  const restricted=new JobJournal({...config,capabilities:new Set(["inspect"])});
  await expect(restricted.read(value.id)).rejects.toThrow("access scope");expect((await restricted.list()).records).toEqual([]);
});
it("snapshots queued writes and never stores runtime configuration",async()=>{
  const {root,journal}=await fixture(),value=job();const saved=journal.save(value);value.spec.files[0]="changed.mp4";await saved;
  const text=await readFile(path.join(root,"avid-mcp-library","jobs",`${value.id}.json`),"utf8");
  expect(text).toContain("fixture.mp4");expect(text).not.toContain("changed.mp4");expect(text).not.toContain("capabilities");
  await expect(journal.read("../outside")).rejects.toThrow();
});
