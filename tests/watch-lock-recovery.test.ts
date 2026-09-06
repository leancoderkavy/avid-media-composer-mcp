import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {it,expect,vi,afterEach} from "vitest";
import {WatchFolders} from "../src/library/watch-folders.js";
import {loadConfig} from "../src/config.js";

afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"watch-recovery-"))),folder=path.join(root,"media");await mkdir(folder);
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:folder,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write"}),service=new WatchFolders(config),record=await service.configure({folder});
 const directory=path.join(root,"avid-mcp-library","watches"),lock=path.join(directory,record.id+".lock"),manifest=path.join(directory,record.id+".json");
 const owner={version:1,id:record.id,nonce:randomUUID(),pid:process.pid,host:os.hostname(),scope:record.scope,at:new Date().toISOString()};
 const setOwner=async(value:unknown)=>{const bytes=JSON.stringify(value);await writeFile(lock,bytes);return createHash("sha256").update(bytes).digest("hex");};
 return {config,service,record,directory,lock,manifest,owner,setOwner};
}
it("releases only the inspected stopped owner, retaining checkpoint bytes and an archive",async()=>{
 const f=await fixture(),sha=await f.setOwner(f.owner),before=await readFile(f.manifest);
 vi.spyOn(process,"kill").mockImplementation(()=>{throw Object.assign(new Error("gone"),{code:"ESRCH"});});
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({recoverable:true,sha256:sha});
 await expect(f.service.recoverLock(f.record.id,"0".repeat(64))).rejects.toThrow(/changed/);
 const result=await f.service.recoverLock(f.record.id,sha);expect(result).toMatchObject({released:true,checkpointModified:false,mediaModified:false,scanRetried:false});
 expect(await readFile(f.manifest)).toEqual(before);expect(JSON.parse(await readFile(result.archive,"utf8"))).toMatchObject({state:"prepared-for-release",lock:{sha256:sha}});
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({locked:false});
 expect((await readdir(f.directory)).filter(name=>name.endsWith(".lock"))).toEqual([]);
 expect(await new WatchFolders(f.config).scan(f.record.id)).toMatchObject({files:0});
});
it.each(["alive","uncertain","legacy","foreign","scope","identity"])("preserves %s owners",async mode=>{
 const f=await fixture(),owner=mode==="legacy"?{pid:123,at:f.owner.at}:{...f.owner,...(mode==="foreign"?{host:"different-host"}:mode==="scope"?{scope:"other"}:mode==="identity"?{id:randomUUID()}: {})};
 const sha=await f.setOwner(owner),before=await readFile(f.lock);
 const kill=vi.spyOn(process,"kill").mockImplementation(()=>{if(mode==="uncertain")throw Object.assign(new Error("denied"),{code:"EPERM"});return true;});
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({locked:true,recoverable:false});
 await expect(f.service.recoverLock(f.record.id,sha)).rejects.toThrow(/not eligible/);expect(await readFile(f.lock)).toEqual(before);
 if(["legacy","foreign","scope","identity"].includes(mode))expect(kill).not.toHaveBeenCalled();
});
it("refuses a PID that becomes live during recovery",async()=>{
 const f=await fixture(),sha=await f.setOwner(f.owner);
 vi.spyOn(process,"kill").mockImplementationOnce(()=>{throw Object.assign(new Error("gone"),{code:"ESRCH"});}).mockReturnValue(true);
 await expect(f.service.recoverLock(f.record.id,sha)).rejects.toThrow(/changed before/);expect(await readFile(f.lock,"utf8")).toBe(JSON.stringify(f.owner));
});
it("a retained recovery guard prevents scans and further recovery without changing state",async()=>{
 const f=await fixture(),sha=await f.setOwner(f.owner),guard=path.join(f.directory,f.record.id+".recovery.lock");await writeFile(guard,"retained");
 await expect(f.service.scan(f.record.id)).rejects.toThrow(/recovery/);await expect(f.service.recoverLock(f.record.id,sha)).rejects.toThrow(/EEXIST/);expect(await readFile(guard,"utf8")).toBe("retained");
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({recoverable:false,blockedByRecoveryGuard:true,recoveryGuard:{bytes:8}});
 expect(await f.service.list()).toEqual([expect.objectContaining({id:f.record.id,unavailable:true,configurationMissing:false,lock:expect.objectContaining({blockedByRecoveryGuard:true})})]);
});
it.each([true,false])("reports a recovery-only guard with configuration present=%s",async present=>{
 const f=await fixture(),guard=path.join(f.directory,f.record.id+".recovery.lock");await writeFile(guard,'retained');if(!present)await unlink(f.manifest);
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({locked:false,recoverable:false,configurationPresent:present,blockedByRecoveryGuard:true,recoveryGuard:{sha256:createHash('sha256').update('retained').digest('hex')}});
 expect(await f.service.list()).toEqual([expect.objectContaining({id:f.record.id,unavailable:true,configurationMissing:!present})]);
 await expect(f.service.scan(f.record.id)).rejects.toThrow(/recovery/);expect(await readFile(guard,'utf8')).toBe('retained');
});
it("recovers an orphaned creation lock without creating a missing manifest",async()=>{
 const f=await fixture(),sha=await f.setOwner(f.owner);await unlink(f.manifest);
 vi.spyOn(process,"kill").mockImplementation(()=>{throw Object.assign(new Error("gone"),{code:"ESRCH"});});
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({configurationPresent:false,recoverable:true});
 expect(await f.service.list()).toEqual([expect.objectContaining({id:f.record.id,unavailable:true,configurationMissing:true,lock:expect.objectContaining({recoverable:true})})]);
 expect(await f.service.recoverLock(f.record.id,sha)).toMatchObject({released:true,checkpointModified:false});
 await expect(readFile(f.manifest)).rejects.toMatchObject({code:"ENOENT"});
 expect(await f.service.lockStatus(f.record.id)).toMatchObject({configurationPresent:false,locked:false});
 expect(await f.service.list()).toEqual([]);
});
it("does not mistake a malformed manifest for an interrupted creation",async()=>{
 const f=await fixture(),sha=await f.setOwner(f.owner);await writeFile(f.manifest,'{broken');
 const kill=vi.spyOn(process,"kill");await expect(f.service.lockStatus(f.record.id)).rejects.toThrow();
 await expect(f.service.recoverLock(f.record.id,sha)).rejects.toThrow();expect(kill).not.toHaveBeenCalled();
 expect(await readFile(f.manifest,"utf8")).toBe('{broken');expect(await readFile(f.lock,"utf8")).toBe(JSON.stringify(f.owner));
});
it("refuses orphaned locks from a different path scope",async()=>{
 const f=await fixture(),sha=await f.setOwner({...f.owner,scope:'foreign'});await unlink(f.manifest);
 const kill=vi.spyOn(process,"kill");expect(await f.service.lockStatus(f.record.id)).toMatchObject({configurationPresent:false,recoverable:false});
 await expect(f.service.recoverLock(f.record.id,sha)).rejects.toThrow(/not eligible/);expect(kill).not.toHaveBeenCalled();
});
