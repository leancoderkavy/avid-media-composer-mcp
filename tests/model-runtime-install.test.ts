import {mkdir,mkdtemp,writeFile,readFile,readdir,access,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {installModelRuntime,modelRuntimeStatus,runtimeManifest,publishRuntimeReceipt} from "../src/library/model-runtime-install.js";
import {runtimeNoticePackages} from "../src/library/runtime-notices.js";
import {AvidMcpError} from "../src/errors.js";
const runner=vi.hoisted(()=>vi.fn());
const receiptFault=vi.hoisted(()=>({fail:false,collision:false,collisionPath:''}));
vi.mock("node:fs/promises",async importOriginal=>{
 const actual=await importOriginal<typeof import("node:fs/promises")>();
 return {...actual,open:async(...args:Parameters<typeof actual.open>)=>{
  const receipt=String(args[0]).includes('.runtime-receipt-');
  if(receipt&&receiptFault.collision){receiptFault.collisionPath=String(args[0]);await actual.writeFile(args[0],'existing temporary owner',{flag:'wx'});}
  const handle=await actual.open(...args);
  if(receipt&&receiptFault.fail){const write=handle.writeFile.bind(handle);handle.writeFile=async()=>{await write('{partial');throw new Error('Injected interrupted receipt write');};}
  return handle;
 },access:async(file:Parameters<typeof actual.access>[0],mode?:number)=>String(file).endsWith("npm-cli.js")?undefined:actual.access(file,mode)};
});
vi.mock("../src/process.js",()=>({runProcess:(...args:unknown[])=>runner(...args)}));
async function populate(directory:string){const module=path.join(directory,"node_modules","@huggingface","transformers");await mkdir(path.join(module,"dist"),{recursive:true});await writeFile(path.join(module,"package.json"),JSON.stringify({version:"4.2.0"}));await writeFile(path.join(module,"dist","transformers.node.mjs"),"export class Tensor {}");await writeFile(path.join(directory,"package-lock.json"),"fixture lock");for(const item of runtimeNoticePackages){const target=path.join(directory,"node_modules",item.name);await mkdir(target,{recursive:true});await writeFile(path.join(target,"package.json"),JSON.stringify({name:item.name,version:item.version}));}}
async function fixture(){return realpath(await mkdtemp(path.join(os.tmpdir(),"avid-runtime-install-")));}
it("reports absent and interrupted setup without parsing locks or executing retained code",async()=>{
 const root=await fixture();expect(await modelRuntimeStatus(root)).toMatchObject({entry:null,inferencePreflight:{state:'not_installed',passed:false}});
 const staged=path.join(root,'.runtime-install-00000000-0000-4000-8000-000000000001');await mkdir(staged);await writeFile(path.join(staged,'package.json'),'untrusted incomplete content');
 expect(await modelRuntimeStatus(root)).toMatchObject({setup:{staging:[staged],workerTerminationVerified:false},inferencePreflight:{state:'retained_setup_state'}});
 const lock=path.join(root,'.runtime-install.lock');await writeFile(lock,'PRIVATE_UNKNOWN_OWNER');
 const status=await modelRuntimeStatus(root);expect(status).toMatchObject({setup:{lockPresent:true},inferencePreflight:{state:'setup_lock_present',passed:false}});
 expect(JSON.stringify(status)).not.toContain('PRIVATE_UNKNOWN_OWNER');expect(await readFile(lock,'utf8')).toBe('PRIVATE_UNKNOWN_OWNER');expect(runner).not.toHaveBeenCalled();
});
it("bounds interrupted setup directory enumeration",async()=>{
 const root=await fixture();await Promise.all(Array.from({length:514},(_,i)=>writeFile(path.join(root,`unrelated-${i}`),'')));
 expect(await modelRuntimeStatus(root)).toMatchObject({setup:{entriesExamined:512,truncated:true},inferencePreflight:{state:'retained_setup_state'}});
 expect(runner).not.toHaveBeenCalled();
});
beforeEach(()=>{receiptFault.fail=false;receiptFault.collision=false;receiptFault.collisionPath='';runner.mockReset();runner.mockImplementation(async(_command,args,options)=>{if(args[1]==="install")await populate(options.cwd);return {exitCode:0,stdout:"",stderr:""};});});
it("preserves a temporary file when exclusive creation fails",async()=>{
 const root=await fixture();receiptFault.collision=true;
 await expect(installModelRuntime(root)).rejects.toThrow();
 expect(await readFile(receiptFault.collisionPath,'utf8')).toBe('existing temporary owner');
});
it("never publishes a partial receipt when writing fails",async()=>{
 const root=await fixture();receiptFault.fail=true;
 await expect(installModelRuntime(root)).rejects.toThrow('interrupted receipt');
 const entries=await readdir(root),staging=entries.find(n=>n.startsWith('.runtime-install-'))!;
 expect(staging).toBeTruthy();await expect(access(path.join(root,staging,'installation.json'))).rejects.toThrow();
 expect(entries.some(n=>n.startsWith('.runtime-receipt-'))).toBe(false);
});
it("publishes only one complete receipt concurrently without replacing the winner",async()=>{
 const root=await fixture(),directory=path.join(root,'runtime');await mkdir(directory);
 const receipt={schema:1,kind:'avid-model-runtime',transformers:'4.2.0',treeSha256:'a'.repeat(64),checkedAt:'fixture',nodeVersion:process.versions.node,checks:{scriptsDisabled:true,auditHighPassed:true,importPassed:true},adoptedLegacy:false};
 const candidates=[receipt,{...receipt,treeSha256:'b'.repeat(64)}];
 const outcomes=await Promise.allSettled(candidates.map(r=>publishRuntimeReceipt(directory,r)));
 expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
 expect(JSON.parse(await readFile(path.join(directory,'installation.json'),'utf8'))).toEqual(candidates[outcomes.findIndex(o=>o.status==='fulfilled')]);
 expect(await readdir(root)).toEqual(['runtime']);
});
it("publishes qualified staging and reuses an unchanged runtime without npm mutation",async()=>{
 const root=await fixture(),first=await installModelRuntime(root);expect(first).toMatchObject({managed:true,unchanged:true,reused:false,receipt:{adoptedLegacy:false,checks:{scriptsDisabled:true}}});
 expect(first.notices.packages).toHaveLength(2);expect(first.notices.packages.every(p=>p.files.every(file=>file.created))).toBe(true);
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

it.each(['install','audit','import'])("retains the lock after uncertain %s worker termination",async phase=>{
 const root=await fixture();
 runner.mockImplementation(async(_command,args,options)=>{
  if(args[1]==='install')await populate(options.cwd);
  if((phase==='import'&&args[0]==='--input-type=module')||args[1]===phase)throw new AvidMcpError('PROCESS_TIMEOUT','fixture timeout',{treeTermination:{succeeded:false}});
  return {exitCode:0,stdout:'',stderr:''};
 });
 await expect(installModelRuntime(root)).rejects.toThrow('setup lock retained');
 const file=path.join(root,'.runtime-install.lock'),bytes=await readFile(file,'utf8');expect(JSON.parse(bytes).pid).toBe(process.pid);
 const calls=runner.mock.calls.length;await expect(installModelRuntime(root)).rejects.toThrow('lock exists');expect(runner).toHaveBeenCalledTimes(calls);expect(await readFile(file,'utf8')).toBe(bytes);
 await expect(access(path.join(root,'runtime'))).rejects.toThrow();
});
it.each([undefined,{succeeded:false}])('retains locks when tree closure evidence is missing or unsuccessful (%j)',async treeTermination=>{
 const root=await fixture();runner.mockRejectedValue(new AvidMcpError('PROCESS_OUTPUT_LIMIT','fixture overflow',{treeTermination}));
 await expect(installModelRuntime(root)).rejects.toThrow('setup lock retained');await access(path.join(root,'.runtime-install.lock'));
});
it.each(['EXECUTABLE_NOT_FOUND','PROCESS_START_FAILED','terminated'])('releases locks when the process never started or tree termination succeeded (%s)',async kind=>{
 const root=await fixture();runner.mockRejectedValue(new AvidMcpError(kind==='terminated'?'PROCESS_TIMEOUT':kind,'fixture failure',kind==='terminated'?{treeTermination:{succeeded:true}}:undefined));
 await expect(installModelRuntime(root)).rejects.toThrow('fixture failure');await expect(access(path.join(root,'.runtime-install.lock'))).rejects.toThrow();
});
