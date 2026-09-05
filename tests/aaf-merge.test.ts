import {it,expect,vi} from "vitest";
import {mkdtemp,realpath,writeFile,readFile,readdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const mock=vi.hoisted(()=>({run:vi.fn()}));
vi.mock("../src/process.js",()=>({runProcess:(...args:unknown[])=>mock.run(...args)}));
async function fixture(change=false){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-merge-"))),media=path.join(root,"media.mov");await writeFile(media,"media");
 const sources=[];for(const name of ["a.aaf","b.aaf"]){const file=path.join(root,name);await writeFile(file,name);sources.push({file,expectedSha256:await sha256File(file)});}
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"});
 mock.run.mockReset();mock.run.mockImplementation(async(_exe:string,args:string[])=>{
  const request=JSON.parse(await readFile(args[1]!,"utf8"));
  let data:unknown={masters:[{mobId:"urn:smpte:umid:aa",name:"source",slots:[]}],locators:[pathToFileURL(media).href]};
  if(request.action==="merge"){
   await writeFile(request.output,"merged");if(change)await writeFile(media,"changed");
   data={output:request.output,sha256:await sha256File(request.output),graphVerified:true,sourceHashesUnchanged:true,hostImportVerified:false,sources:request.sources.map((s:{file:string;expectedSha256:string})=>({file:s.file,sha256:s.expectedSha256,remappedMobIds:{}})),limitations:[]};
  }
  return {exitCode:0,stderr:"",stdout:JSON.stringify(data)};
 });
 return {root,config,sources,builder:new AafBuilder(config)};
}
it("verifies a new merge receipt and exposes its template for selects",async()=>{
 const f=await fixture(),result=await f.builder.merge({sources:f.sources});
 expect(result.graphVerified).toBe(true);expect(result.hostImportVerified).toBe(false);
 expect(JSON.parse(await readFile(path.join(path.dirname(result.template),"receipt.json"),"utf8"))).toEqual(result);
});
it("refuses changed referenced media without publishing a success receipt",async()=>{
 const f=await fixture(true);await expect(f.builder.merge({sources:f.sources})).rejects.toThrow("media changed");
 const base=path.join(f.root,"avid-mcp-library"),dir=(await readdir(base)).find(n=>n.startsWith("aaf-merge-"))!;
 const files=await readdir(path.join(base,dir));expect(files).toContain("failure.json");expect(files).not.toContain("receipt.json");
});
it("rejects missing capability, duplicate references and changed checksums",async()=>{
 const f=await fixture();await expect(new AafBuilder({...f.config,capabilities:new Set(["inspect"])}).merge({sources:f.sources})).rejects.toThrow();expect(mock.run).not.toHaveBeenCalled();
 await expect(f.builder.merge({sources:[f.sources[0]!,f.sources[0]!]})).rejects.toThrow("Duplicate");
 await expect(f.builder.merge({sources:[{...f.sources[0]!,expectedSha256:"0".repeat(64)},f.sources[1]!]})).rejects.toThrow("checksum changed");
});
