import {mkdtemp,mkdir,writeFile,readFile,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
const mock=vi.hoisted(()=>({run:vi.fn(),wheel:vi.fn()}));
vi.mock("../src/process.js",()=>({runProcess:mock.run}));
vi.mock("../src/library/python-bootstrap.js",()=>({PIP_VERSION:"26.2.1",preparePipWheel:mock.wheel}));
import {installPythonRuntime,pythonRuntimeStatus,publishPythonRuntimeReceipt} from "../src/python-runtime.js";
beforeEach(()=>{mock.run.mockReset();mock.wheel.mockReset();});
it("publishes exactly one complete receipt when writers race and preserves it on retry",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-runtime-receipt-"));
 const results=await Promise.allSettled([publishPythonRuntimeReceipt(root,{writer:1}),publishPythonRuntimeReceipt(root,{writer:2})]);
 expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
 const file=path.join(root,"installation.json"),before=await readFile(file,"utf8");expect([1,2]).toContain(JSON.parse(before).writer);
 await expect(publishPythonRuntimeReceipt(root,{writer:3})).rejects.toMatchObject({code:"EEXIST"});expect(await readFile(file,"utf8")).toBe(before);
});
async function fixture(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-core-runtime-"))),directory=path.join(root,"new-runtime");
 mock.wheel.mockImplementation(async dir=>{const file=path.join(dir,"pip.whl");await writeFile(file,"verified-fixture-wheel");return file;});
 mock.run.mockImplementation(async(_exe,args)=>{
  if(args.includes("venv")){const runtime=args.at(-1),file=path.join(runtime,process.platform==="win32"?"Scripts/python.exe":"bin/python");await mkdir(path.dirname(file),{recursive:true});await writeFile(file,"fixture interpreter");}
  return {exitCode:0,stderr:"",stdout:args.at(-1).includes("importlib.metadata")?JSON.stringify({pip:"26.2.1",pyavb:"1.4.0",pyaaf2:"1.7.1"}):""};
 });
 return {root,directory};
}
it("installs once, uses isolated binary-only pins and verifies without executing on status",async()=>{
 const {directory}=await fixture();const installed=await installPythonRuntime(directory,process.execPath);
 expect(installed).toMatchObject({unchanged:true,bootstrapCurrent:true});
 expect(mock.run.mock.calls.some(([,args])=>args.includes("--only-binary=:all:")&&args.includes("--isolated")&&args.includes("pyavb==1.4.0")&&args.includes("pyaaf2==1.7.1"))).toBe(true);
 const count=mock.run.mock.calls.length;expect(await pythonRuntimeStatus(directory)).toMatchObject({unchanged:true});expect(mock.run).toHaveBeenCalledTimes(count);
 await expect(installPythonRuntime(directory,process.execPath)).rejects.toMatchObject({code:"EEXIST"});expect(mock.run).toHaveBeenCalledTimes(count);
 await writeFile(installed.executable,"changed");expect(await pythonRuntimeStatus(directory)).toMatchObject({unchanged:false});expect(mock.run).toHaveBeenCalledTimes(count);
});
it("retains partial setup on failure without publishing a successful receipt",async()=>{
 const {directory}=await fixture();mock.run.mockResolvedValueOnce({exitCode:1,stderr:"fixture failure",stdout:""});
 await expect(installPythonRuntime(directory,process.execPath)).rejects.toThrow("incomplete runtime retained");
 await expect(readFile(path.join(directory,"installation.json"))).rejects.toMatchObject({code:"ENOENT"});
 expect(await pythonRuntimeStatus(directory)).toMatchObject({state:"incomplete",executable:null,unchanged:null,workerState:"unknown"});
 await expect(installPythonRuntime(directory,process.execPath)).rejects.toMatchObject({code:"EEXIST"});expect(mock.run).toHaveBeenCalledTimes(1);
});
it("rejects corrupt or relocated attempt records without executing or guessing completion",async()=>{
 const {directory}=await fixture();mock.run.mockResolvedValueOnce({exitCode:1,stderr:"failed",stdout:""});
 await expect(installPythonRuntime(directory,process.execPath)).rejects.toThrow();
 const file=path.join(directory,"attempt.json"),attempt=JSON.parse(await readFile(file,"utf8"));
 await writeFile(file,JSON.stringify({...attempt,directory:path.join(directory,"elsewhere")}));
 await expect(pythonRuntimeStatus(directory)).rejects.toThrow("attempt location mismatch");
 await writeFile(file,'{"incomplete":');await expect(pythonRuntimeStatus(directory)).rejects.toThrow();expect(mock.run).toHaveBeenCalledTimes(1);
});
it("rejects relative paths before running setup",async()=>{
 await expect(installPythonRuntime("relative",process.execPath)).rejects.toThrow("absolute");
 await expect(pythonRuntimeStatus("relative")).rejects.toThrow("absolute");expect(mock.run).not.toHaveBeenCalled();
});
it("rejects receipt relocation without running the interpreter",async()=>{
 const {directory}=await fixture();await installPythonRuntime(directory,process.execPath);
 const file=path.join(directory,"installation.json"),receipt=JSON.parse(await readFile(file,"utf8"));receipt.directory=path.join(directory,"different");await writeFile(file,JSON.stringify(receipt));
 const count=mock.run.mock.calls.length;await expect(pythonRuntimeStatus(directory)).rejects.toThrow("location mismatch");expect(mock.run).toHaveBeenCalledTimes(count);
});
