import {mkdtemp,mkdir,writeFile,readFile,access} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,afterEach} from "vitest";
import {NativeLockRecovery} from "../src/native/lock-recovery.js";
import {loadConfig} from "../src/config.js";
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
