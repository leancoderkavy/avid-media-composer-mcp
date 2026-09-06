import {mkdtemp,readFile,writeFile,mkdir} from "node:fs/promises";
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
it("continues past an inaccessible page without disclosing another scope's record",async()=>{
 const {config,journal}=await fixture();
 const first={...job(),id:"00000000-0000-4000-8000-000000000001"};await journal.save(first);
 const restricted=new JobJournal({...config,capabilities:new Set(["inspect"])});
 const second={...job(),id:"00000000-0000-4000-8000-000000000002"};await restricted.save(second);
 const page=await restricted.list(undefined,1);
 expect(page).toMatchObject({records:[],unreadable:0,nextAfter:first.id});
 expect(JSON.stringify(page)).not.toContain("fixture.mp4");
 const next=await restricted.list(page.nextAfter!,1);
 expect(next.records[0]!.id).toBe(second.id);expect(next.nextAfter).toBeNull();
});
it("paginates past damaged records without returning their contents or losing healthy records",async()=>{
 const {root,journal}=await fixture(),first={...job(),id:"00000000-0000-4000-8000-000000000001"},second={...job(),id:"00000000-0000-4000-8000-000000000002"};
 await journal.save(first);await journal.save(second);
 const directory=path.join(root,"avid-mcp-library","jobs");
 await writeFile(path.join(directory,`${first.id}.json`),'{"private":"damaged');
 await writeFile(path.join(directory,`${"-".repeat(36)}.json`),'invalid filename');
 await mkdir(path.join(directory,"00000000-0000-4000-8000-000000000003.json"));
 await expect(journal.read(first.id)).rejects.toThrow();
 const page=await journal.list(undefined,1);
 expect(page).toMatchObject({records:[],scanned:1,unreadable:1,nextAfter:first.id});
 expect(JSON.stringify(page)).not.toContain("private");
 const last=await journal.list(page.nextAfter!,1);
 expect(last.records[0]!.id).toBe(second.id);expect(last.nextAfter).toBeNull();
});
