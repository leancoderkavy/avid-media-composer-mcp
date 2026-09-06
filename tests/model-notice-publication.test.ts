import {it,expect,vi} from "vitest";
import {mkdtemp,readFile,readdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const gate=vi.hoisted(()=>({pause:undefined as undefined|(()=>Promise<void>)}));
vi.mock("node:fs/promises",async original=>{
 const actual=await original<typeof import("node:fs/promises")>();
 return {...actual,writeFile:async(...args:Parameters<typeof actual.writeFile>)=>{
  if(gate.pause){const pause=gate.pause;gate.pause=undefined;await actual.writeFile(args[0],Buffer.alloc(0),args[2]);await pause();return actual.writeFile(args[0],args[1]);}
  return actual.writeFile(...args);
 }};
});
import {installModelNotice} from "../src/library/model-notices.js";
it("allows another caller to finish while the first staged write is paused",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-notice-publication-"));
 let paused!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{paused=resolve;}),resume=new Promise<void>(resolve=>{release=resolve;});
 gate.pause=async()=>{paused();await resume;};
 const first=installModelNotice(root,"Xenova/clip-vit-base-patch32","a".repeat(40));await started;
 try{
  const second=await installModelNotice(root,"Xenova/clip-vit-base-patch32","a".repeat(40));expect(second.created).toBe(true);
  expect((await readFile(second.file)).length).toBe(1064);
  release();expect((await first).created).toBe(false);
  expect(await readdir(path.dirname(second.file))).toEqual(["UPSTREAM.LICENSE"]);
 }finally{release();await first;gate.pause=undefined;}
});
