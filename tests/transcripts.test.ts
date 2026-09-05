import {mkdtemp,writeFile,readFile,open,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {it,expect,vi,afterEach} from "vitest";
import {loadConfig} from "../src/config.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {TranscriptRevisions} from "../src/library/transcripts.js";
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-transcripts-")),source=path.join(root,"source.mp4");await writeFile(source,"fixture");
  const id=createHash("sha256").update("fixture").digest("hex"),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write,export"});
  const library=new MediaLibrary(config),directory=await library.directory();await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:20}},transcript:[]}));
  const initial=await library.importTranscript(id,[{start:0,end:2,text:"wrong"},{start:3,end:5,text:"remove"}]);
  const revisions=new TranscriptRevisions(config),first=(await revisions.list(id)).revisions[0]!;
  return {id,config,library,directory,revisions,first,initial,source};
}
it("corrects original indices into a new sorted revision and preserves ancestry and original",async()=>{
  const {id,revisions,first,library,initial}=await fixture();
  const corrected=await revisions.correct(id,first.revision,first.sha256,[{action:"replace",index:0,segment:{start:1,end:2,text:"correct",speaker:"Speaker A"}},{action:"remove",index:1},{action:"add",segment:{start:0,end:1,text:"intro"}}]);
  expect(JSON.parse(await readFile(initial.path,"utf8")).segments[0].text).toBe("wrong");
  const range=await library.transcriptRange(id,0,20,-1,100,corrected.revision);expect(range.segments.map(s=>s.text)).toEqual(["intro","correct"]);
  expect(range.segments[1]?.speaker).toBe("Speaker A");
  const page=await revisions.list(id,"",1);expect(page.nextAfter).toBeTruthy();expect((await revisions.list(id,page.nextAfter!,1)).revisions).toHaveLength(1);
  expect((await revisions.list(id)).revisions.find(r=>r.revision===corrected.revision)?.parentRevision).toBe(first.revision);
});
it("rejects checksum drift, duplicate edits and out-of-duration corrections",async()=>{
  const {id,revisions,first}=await fixture();
  await expect(revisions.correct(id,first.revision,"0".repeat(64),[{action:"remove",index:0}])).rejects.toThrow("changed");
  await expect(revisions.correct(id,first.revision,first.sha256,[{action:"remove",index:0},{action:"remove",index:0}])).rejects.toThrow("duplicate");
  await expect(revisions.correct(id,first.revision,first.sha256,[{action:"add",segment:{start:19,end:21,text:"invalid"}}])).rejects.toThrow("duration");
  expect((await revisions.list(id)).revisions).toHaveLength(1);
});
it("deletes only the selected revision while retaining source, correction and export",async()=>{
  const {id,revisions,first,source,library}=await fixture();
  const next=await revisions.correct(id,first.revision,first.sha256,[{action:"remove",index:0}]);
  const exported=await library.exportTranscript(id,first.revision,"txt");
  expect((await revisions.remove(id,first.revision,first.sha256)).deleted).toBe(true);
  expect((await revisions.list(id)).revisions.map(r=>r.revision)).toEqual([next.revision]);
  expect(await readFile(source,"utf8")).toBe("fixture");expect(await readFile(exported.output,"utf8")).toContain("wrong");
  await expect(library.transcriptRange(id,0,20,-1,100,first.revision)).rejects.toThrow();
});
it("enforces root permissions and does not steal an active correction/deletion lock",async()=>{
  const {id,revisions,first,directory,config}=await fixture();
  const lock=path.join(directory,`${id}.transcripts.lock`),handle=await open(lock,"wx");
  try{await expect(revisions.remove(id,first.revision,first.sha256)).rejects.toThrow();}finally{await handle.close();await unlink(lock);}
  await expect(new TranscriptRevisions({...config,allowedRoots:[]}).list(id)).rejects.toThrow();
  expect((await revisions.list(id)).revisions).toHaveLength(1);
});
it.each(["correct","remove"] as const)("refuses %s if the lock owner changes before mutation",async(action)=>{
  const {id,revisions,first,directory,initial}=await fixture(),lock=path.join(directory,`${id}.transcripts.lock`);
  const original=MediaLibrary.prototype.metadata;let calls=0;
  vi.spyOn(MediaLibrary.prototype,"metadata").mockImplementation(async function(this:MediaLibrary,...args){
    const result=await original.apply(this,args);
    if(++calls===2)await writeFile(lock,"replacement owner");
    return result;
  });
  const operation=action==="correct"?revisions.correct(id,first.revision,first.sha256,[{action:"remove",index:0}]):revisions.remove(id,first.revision,first.sha256);
  await expect(operation).rejects.toThrow("Transcript lock changed");
  expect(await readFile(lock,"utf8")).toBe("replacement owner");
  expect(JSON.parse(await readFile(initial.path,"utf8")).segments).toHaveLength(2);
  expect((await revisions.list(id)).revisions).toHaveLength(1);
});
it("retains a replaced lock and the published revision when ownership changes after publication",async()=>{
  const {id,revisions,first,directory}=await fixture(),lock=path.join(directory,`${id}.transcripts.lock`);
  const original=MediaLibrary.prototype.importTranscript;
  vi.spyOn(MediaLibrary.prototype,"importTranscript").mockImplementation(async function(this:MediaLibrary,...args){
    const result=await original.apply(this,args);await unlink(lock);await writeFile(lock,"new owner",{flag:"wx"});return result;
  });
  await expect(revisions.correct(id,first.revision,first.sha256,[{action:"remove",index:0}])).rejects.toThrow("may already have completed");
  expect(await readFile(lock,"utf8")).toBe("new owner");
  expect((await revisions.list(id)).revisions).toHaveLength(2);
});
it("excludes a second revision writer while the first publishes and releases its own lock",async()=>{
  const {id,revisions,first,directory,config}=await fixture(),lock=path.join(directory,`${id}.transcripts.lock`);
  let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const original=MediaLibrary.prototype.importTranscript;
  vi.spyOn(MediaLibrary.prototype,"importTranscript").mockImplementation(async function(this:MediaLibrary,...args){entered();await gate;return original.apply(this,args);});
  const pending=revisions.correct(id,first.revision,first.sha256,[{action:"remove",index:0}]);
  try{
    await ready;const owner=JSON.parse(await readFile(lock,"utf8"));expect(owner.pid).toBe(process.pid);expect(owner.operation).toMatch(/^[a-f0-9-]{36}$/);
    await expect(new TranscriptRevisions(config).remove(id,first.revision,first.sha256)).rejects.toThrow();
    expect(JSON.parse(await readFile(lock,"utf8"))).toEqual(owner);
  }finally{release();await pending;}
  await expect(readFile(lock)).rejects.toMatchObject({code:"ENOENT"});expect((await revisions.list(id)).revisions).toHaveLength(2);
});
