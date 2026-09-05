import {mkdtemp,mkdir,writeFile,readFile,access,symlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,afterEach} from "vitest";
import {NativeLockRecovery} from "../src/native/lock-recovery.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {randomUUID} from "node:crypto";
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-lock-recovery-"));vi.spyOn(os,"homedir").mockReturnValue(root);
  await mkdir(path.join(root,".avid-mcp"));const directory=path.join(root,"attempt");await mkdir(directory);await mkdir(path.join(directory,"export"));
  const output=path.join(directory,"export","render.mp4"),file=path.join(root,".avid-mcp","native-write.lock");await writeFile(output,"retained media");
  await writeFile(path.join(directory,"attempt.json"),JSON.stringify({project:root,output,action:{action:"export_mp4"}}));
  const owner={pid:123,startedAt:"fixture"};await writeFile(file,JSON.stringify(owner)+"\n"+JSON.stringify({state:"export-unresolved",output,cause:"fixture timeout"}));
  const config=loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"});
  return {root,config,file,output,owner};
}
it("releases only the inspected retained lock and preserves rendered output",async()=>{
  const {config,file,output}=await fixture(),stopped=vi.fn(async()=>{}),recovery=new NativeLockRecovery(config,stopped),status=await recovery.inspect();
  if(!status.locked)throw new Error("Missing fixture");const released=await recovery.release(status.sha256);expect(released.released).toBe(true);expect(stopped).toHaveBeenCalledTimes(2);
  expect(await readFile(output,"utf8")).toBe("retained media");await expect(access(file)).rejects.toThrow();expect(JSON.parse(await readFile(released.archive,"utf8")).state).toBe("prepared-for-release");
});
it("keeps the lock when Avid is running or the checksum changed",async()=>{
  const {config,file}=await fixture(),recovery=new NativeLockRecovery(config,async()=>{throw new Error("Avid running");}),status=await recovery.inspect();if(!status.locked)throw new Error("Missing fixture");
  await expect(recovery.release(status.sha256)).rejects.toThrow("Avid running");await access(file);await expect(recovery.release("0".repeat(64))).rejects.toThrow("changed");await access(file);
});
it("refuses active/generic abandoned locks and attempts outside current project scope",async()=>{
  const {config,file,owner}=await fixture();await expect(new NativeLockRecovery({...config,allowedRoots:[]},async()=>{}).inspect()).rejects.toThrow();
  await writeFile(file,JSON.stringify(owner));const recovery=new NativeLockRecovery(config,async()=>{}),status=await recovery.inspect();expect(status).toMatchObject({locked:true,recoverable:false});
  if(!status.locked)throw new Error("Missing fixture");await expect(recovery.release(status.sha256)).rejects.toThrow("eligible");
});
it("detects a changed lock during stopped-host checks before releasing anything",async()=>{
  const {config,file,owner}=await fixture();const recovery=new NativeLockRecovery(config,async()=>{await writeFile(file,JSON.stringify(owner));}),status=await recovery.inspect();
  if(!status.locked)throw new Error("Missing fixture");await expect(recovery.release(status.sha256)).rejects.toThrow("changed");await access(file);
});
async function importFixture(){
 const base=await fixture(),directory=path.join(base.root,`native-import-${randomUUID()}`);await mkdir(directory);
 const attempt=path.join(directory,"attempt.json"),aaf=path.join(base.root,"selects.aaf"),media=path.join(base.root,"media.mov"),bin=path.join(base.root,"import.avb");
 await writeFile(aaf,"AAF");await writeFile(media,"media");await writeFile(bin,"saved bin");
 await writeFile(attempt,JSON.stringify({project:base.root,action:{action:"import_aaf_selects",bin:"import.avb",file:aaf,expectedSha256:await sha256File(aaf)},inspection:{file:aaf,sha256:await sha256File(aaf),media:[{file:media,sha256:await sha256File(media)}]}}));
 const bytes=JSON.stringify(base.owner)+"\n"+JSON.stringify({state:"import-unresolved",attempt,cause:"timeout"});await writeFile(base.file,bytes);
 const config=loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:base.root,AVID_MCP_OUTPUT_ROOT:base.root,AVID_MCP_CAPABILITIES:"inspect,edit,export"});
 return {...base,config,attempt,aaf,media,bin,bytes};
}
it("archives import evidence and releases only the lock after two stopped-host checks",async()=>{
 const {config,file,aaf,media,bin}=await importFixture(),stopped=vi.fn(async()=>{}),recovery=new NativeLockRecovery(config,stopped);
 const status=await recovery.inspect();if(!status.locked||!status.recoverable||status.state!=="import-unresolved")throw new Error("Missing import");
 expect(status.evidence.files.every(item=>!item.changed)).toBe(true);
 await expect(recovery.release(status.sha256)).rejects.toThrow("eligible");
 const hashes=await Promise.all([aaf,media,bin].map(sha256File));const result=await recovery.releaseImport(status.sha256,status.evidenceSha256);
 expect(result).toMatchObject({released:true,importRetried:false,binModified:false,sourceModified:false});expect(stopped).toHaveBeenCalledTimes(2);
 expect(JSON.parse(await readFile(result.archive,"utf8")).lock.evidenceSha256).toBe(status.evidenceSha256);
 await expect(access(file)).rejects.toThrow();expect(await Promise.all([aaf,media,bin].map(sha256File))).toEqual(hashes);
});
it("refuses import recovery while running or when observed bin/source/attempt evidence changes",async()=>{
 const data=await importFixture(),running=new NativeLockRecovery(data.config,async()=>{throw new Error("Avid running");});
 const status=await running.inspect();if(!status.locked||!status.recoverable||status.state!=="import-unresolved")throw new Error("Missing import");
 await expect(running.releaseImport(status.sha256,status.evidenceSha256)).rejects.toThrow("running");
 for(const file of [data.bin,data.media,data.attempt]){
  const previous=await readFile(file);await writeFile(file,file===data.attempt?Buffer.concat([previous,Buffer.from(" ")]):Buffer.from("changed"));
  await expect(new NativeLockRecovery(data.config,async()=>{}).releaseImport(status.sha256,status.evidenceSha256)).rejects.toThrow("changed");await writeFile(file,previous);
 }
 expect(await readFile(data.file,"utf8")).toBe(data.bytes);
});
it("records source changes since dispatch for explicit review without undoing them",async()=>{
 const data=await importFixture();await writeFile(data.media,"user revision");const recovery=new NativeLockRecovery(data.config,async()=>{}),status=await recovery.inspect();
 if(!status.locked||!status.recoverable||status.state!=="import-unresolved")throw new Error("Missing import");
 expect(status.evidence.files.filter(item=>item.changed)).toHaveLength(1);await recovery.releaseImport(status.sha256,status.evidenceSha256);expect(await readFile(data.media,"utf8")).toBe("user revision");
});
it("keeps import lock when evidence changes during the final stopped-host check",async()=>{
 const data=await importFixture();let checks=0;const recovery=new NativeLockRecovery(data.config,async()=>{if(++checks===2)await writeFile(data.bin,"concurrent edit");}),status=await recovery.inspect();
 if(!status.locked||!status.recoverable||status.state!=="import-unresolved")throw new Error("Missing import");
 await expect(recovery.releaseImport(status.sha256,status.evidenceSha256)).rejects.toThrow("changed");expect(await readFile(data.file,"utf8")).toBe(data.bytes);
});
it("rejects out-of-scope import attempts, missing authority and export locks",async()=>{
 const data=await importFixture();await expect(new NativeLockRecovery({...data.config,allowedRoots:[]},async()=>{}).inspect()).rejects.toThrow();
 const recovery=new NativeLockRecovery({...data.config,capabilities:new Set(["inspect","export"])},async()=>{});await expect(recovery.releaseImport("0".repeat(64),"0".repeat(64))).rejects.toThrow();
 const exported=await fixture();await expect(new NativeLockRecovery(exported.config,async()=>{}).releaseImport("0".repeat(64),"0".repeat(64))).rejects.toThrow();
});
it("accepts a canonical parent alias but rejects an unexpected output leaf",async()=>{
  const {root,config,file,owner}=await fixture();
  const alias=path.join(root,"attempt-alias");await symlink(path.join(root,"attempt"),alias,process.platform==="win32"?"junction":"dir");
  const output=path.join(alias,"export","render.mp4");
  await writeFile(path.join(root,"attempt","attempt.json"),JSON.stringify({project:root,output,action:{action:"export_mp4"}}));
  const record=(target:string)=>JSON.stringify(owner)+"\n"+JSON.stringify({state:"export-unresolved",output:target,cause:"fixture"});
  await writeFile(file,record(output));const recovery=new NativeLockRecovery(config,async()=>{});
  const status=await recovery.inspect();expect(status).toMatchObject({locked:true,recoverable:true});
  await writeFile(file,record(path.join(alias,"export","other.mp4")));await expect(recovery.inspect()).rejects.toThrow("expected attempt output");
});
