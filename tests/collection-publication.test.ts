import {it,expect,vi} from "vitest";
import {mkdtemp,writeFile,readFile,readdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
const gate=vi.hoisted(()=>({pause:undefined as undefined|(()=>Promise<void>),collision:false}));
vi.mock("node:fs/promises",async original=>{
 const actual=await original<typeof import("node:fs/promises")>();
 return {...actual,writeFile:async(...args:Parameters<typeof actual.writeFile>)=>{
  if(gate.pause&&String(args[0]).endsWith(".tmp")){const pause=gate.pause;gate.pause=undefined;await actual.writeFile(args[0],"partial",args[2]);await pause();return actual.writeFile(args[0],args[1]);}
  return actual.writeFile(...args);
 },link:async(...args:Parameters<typeof actual.link>)=>{
  if(gate.collision){gate.collision=false;await actual.writeFile(args[1],"existing output",{flag:"wx"});}
  return actual.link(...args);
 }};
});
import {Collections} from "../src/library/collections.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-collection-publication-")),file=path.join(root,"source.wav");await writeFile(file,"fixture");
 const id=createHash("sha256").update("fixture").digest("hex"),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write,export"});
 const directory=await new MediaLibrary(config).directory();await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file,bytes:7,metadata:{format:{duration:"10"}},transcript:[]}));
 return {directory,collections:new Collections(config),input:{name:"Complete selects",selects:[{id,start:2,end:5,label:"",tags:[],note:""}]}};
}
it.each(["save","export"] as const)("publishes %s only after all bytes are written",async operation=>{
 const {directory,collections,input}=await fixture();const saved=operation==="export"?await collections.save(input):undefined;
 let paused!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{paused=resolve;}),resume=new Promise<void>(resolve=>{release=resolve;});
 gate.pause=async()=>{paused();await resume;};
 const pending=operation==="save"?collections.save(input):collections.exportOtio(saved!.revision,30);await started;
 try{
  const names=await readdir(directory);expect(names.filter(name=>name.endsWith(".tmp"))).toHaveLength(1);
  if(operation==="save")expect((await collections.list()).results).toEqual([]);else expect(names.some(name=>name.endsWith(".otio"))).toBe(false);
  release();const result=await pending;expect((await readdir(directory)).some(name=>name.endsWith(".tmp"))).toBe(false);
  if("output" in result)expect(JSON.parse(await readFile(result.output,"utf8")).tracks.children[0].children).toHaveLength(1);
  else expect((await collections.read(result.revision)).name).toBe(input.name);
 }finally{release();await pending;gate.pause=undefined;}
});
it.each(["save","export"] as const)("leaves no published %s after a failed staged write",async operation=>{
 const {directory,collections,input}=await fixture();const saved=operation==="export"?await collections.save(input):undefined,before=(await readdir(directory)).sort();
 gate.pause=async()=>{throw new Error("interrupted fixture write");};
 await expect(operation==="save"?collections.save(input):collections.exportOtio(saved!.revision,30)).rejects.toThrow("interrupted fixture write");
 expect((await readdir(directory)).sort()).toEqual(before);
});
it("preserves a competing final output and removes its own stage",async()=>{
 const {directory,collections,input}=await fixture();gate.collision=true;
 await expect(collections.save(input)).rejects.toMatchObject({code:"EEXIST"});
 const names=await readdir(directory);expect(names.some(name=>name.endsWith(".tmp"))).toBe(false);
 const final=names.find(name=>name.startsWith("collection-"))!;expect(await readFile(path.join(directory,final),"utf8")).toBe("existing output");
});
