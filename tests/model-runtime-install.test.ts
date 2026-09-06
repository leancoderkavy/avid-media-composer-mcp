import {mkdir,mkdtemp,writeFile,readFile,readdir,access,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {installModelRuntime,modelRuntimeStatus,runtimeManifest} from "../src/library/model-runtime-install.js";
const runner=vi.hoisted(()=>vi.fn());
vi.mock("node:fs/promises",async importOriginal=>{
 const actual=await importOriginal<typeof import("node:fs/promises")>();
 return {...actual,access:async(file:Parameters<typeof actual.access>[0],mode?:number)=>String(file).endsWith("npm-cli.js")?undefined:actual.access(file,mode)};
});
vi.mock("../src/process.js",()=>({runProcess:(...args:unknown[])=>runner(...args)}));
async function populate(directory:string){const module=path.join(directory,"node_modules","@huggingface","transformers");await mkdir(path.join(module,"dist"),{recursive:true});await writeFile(path.join(module,"package.json"),JSON.stringify({version:"4.2.0"}));await writeFile(path.join(module,"dist","transformers.node.mjs"),"export class Tensor {}");await writeFile(path.join(directory,"package-lock.json"),"fixture lock");}
async function fixture(){return realpath(await mkdtemp(path.join(os.tmpdir(),"avid-runtime-install-")));}
beforeEach(()=>{runner.mockReset();runner.mockImplementation(async(_command,args,options)=>{if(args[1]==="install")await populate(options.cwd);return {exitCode:0,stdout:"",stderr:""};});});
it("publishes qualified staging and reuses an unchanged runtime without npm mutation",async()=>{
 const root=await fixture(),first=await installModelRuntime(root);expect(first).toMatchObject({managed:true,unchanged:true,reused:false,receipt:{adoptedLegacy:false,checks:{scriptsDisabled:true}}});
 expect(runner.mock.calls[0]![1]).toContain("--ignore-scripts");expect(runner).toHaveBeenCalledTimes(3);const lock=await readFile(path.join(root,"runtime","package-lock.json"),"utf8");
 const second=await installModelRuntime(root);expect(second).toMatchObject({reused:true,unchanged:true});expect(runner).toHaveBeenCalledTimes(3);expect(await readFile(path.join(root,"runtime","package-lock.json"),"utf8")).toBe(lock);
 await writeFile(path.join(root,"runtime","extra.txt"),"preserve");expect(await modelRuntimeStatus(root)).toMatchObject({unchanged:false});await expect(installModelRuntime(root)).rejects.toThrow("tree changed");expect(await readFile(path.join(root,"runtime","extra.txt"),"utf8")).toBe("preserve");
});
it("audits and adopts a legacy runtime without rerunning install",async()=>{
 const root=await fixture(),runtime=path.join(root,"runtime");await mkdir(runtime);await writeFile(path.join(runtime,"package.json"),JSON.stringify(runtimeManifest));await populate(runtime);
 expect(await modelRuntimeStatus(root)).toMatchObject({managed:false,unchanged:null,inferencePreflight:{state:"adoption_required",passed:false,modelLoadVerified:false}});
 const result=await installModelRuntime(root);expect(result).toMatchObject({reused:true,receipt:{adoptedLegacy:true,checks:{scriptsDisabled:false}},inferencePreflight:{state:"verified",passed:true,modelLoadVerified:false}});expect(runner).toHaveBeenCalledTimes(2);expect(runner.mock.calls[0]![1][1]).toBe("audit");
 await writeFile(path.join(runtime,"unexpected.txt"),"preserve");expect(await modelRuntimeStatus(root)).toMatchObject({inferencePreflight:{state:"tree_changed",passed:false,modelLoadVerified:false}});expect(runner).toHaveBeenCalledTimes(2);
});
it("retains failed staging without publishing a runtime or deleting the failure evidence",async()=>{
 const root=await fixture();runner.mockImplementation(async(_command,args,options)=>{if(args[1]==="install")await populate(options.cwd);return {exitCode:args[1]==="audit"?1:0,stdout:"",stderr:"failure"};});
 await expect(installModelRuntime(root)).rejects.toThrow("audit failed");await expect(access(path.join(root,"runtime"))).rejects.toThrow();expect((await readdir(root)).filter(name=>name.startsWith(".runtime-install-"))).toHaveLength(1);await expect(access(path.join(root,".runtime-install.lock"))).rejects.toThrow();
});
it("preserves an existing setup lock and rejects unexpected runtime manifests",async()=>{
 const root=await fixture();await writeFile(path.join(root,".runtime-install.lock"),"existing owner");await expect(installModelRuntime(root)).rejects.toThrow("lock exists");expect(await readFile(path.join(root,".runtime-install.lock"),"utf8")).toBe("existing owner");expect(runner).not.toHaveBeenCalled();
 const other=await fixture(),runtime=path.join(other,"runtime");await mkdir(runtime);await writeFile(path.join(runtime,"package.json"),"{}");await expect(installModelRuntime(other)).rejects.toThrow("differs");expect(await readFile(path.join(runtime,"package.json"),"utf8")).toBe("{}");
});

it("retains a replacement setup lock if an outside writer changes it",async()=>{
 const root=await fixture();runner.mockImplementation(async()=>{await writeFile(path.join(root,".runtime-install.lock"),"replacement owner");return {exitCode:1,stdout:"",stderr:"stop"};});
 await expect(installModelRuntime(root)).rejects.toThrow("lock changed");expect(await readFile(path.join(root,".runtime-install.lock"),"utf8")).toBe("replacement owner");
});
