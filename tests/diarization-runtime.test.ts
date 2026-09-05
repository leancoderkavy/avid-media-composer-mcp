import {mkdtemp,mkdir,writeFile,readFile,readdir,access} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {beforeEach,it,expect,vi} from "vitest";
import {DIARIZATION_VERSIONS,installDiarizationRuntime,diarizationRuntimeStatus} from "../src/library/diarization-runtime.js";
const runner=vi.hoisted(()=>vi.fn());
vi.mock("../src/process.js",()=>({runProcess:runner}));
const fixture=()=>mkdtemp(path.join(os.tmpdir(),"avid-diarization-"));
beforeEach(()=>{
  runner.mockReset();runner.mockImplementation(async(_executable:string,args:string[])=>{
    if(args.includes("venv")){const bin=path.join(args.at(-1)!,process.platform==="win32"?"Scripts":"bin");await mkdir(bin,{recursive:true});await writeFile(path.join(bin,process.platform==="win32"?"python.exe":"python"),"fixture executable");}
    return {exitCode:0,stdout:args.includes("--check")?JSON.stringify({schema:1,recipe:1,duration:1,speakerCount:0,spans:[],versions:DIARIZATION_VERSIONS}):"",stderr:""};
  });
});
it("publishes a verified fixed-path runtime and reuses it without installers or inference",async()=>{
  const cache=await fixture(),first=await installDiarizationRuntime(cache,"python");expect(first).toMatchObject({unchanged:true,reused:false,receipt:{checks:{binaryOnly:true,dependencyCheckPassed:true,silenceInferencePassed:true}}});
  const calls=runner.mock.calls.length;expect(calls).toBe(5);expect(runner.mock.calls[1]![1]).toEqual(expect.arrayContaining(["--no-deps","--only-binary=:all:","--no-compile","sherpa-onnx==1.13.7"]));
  expect((await installDiarizationRuntime(cache,"missing-python")).reused).toBe(true);expect(runner).toHaveBeenCalledTimes(calls);
  await writeFile(path.join(first.directory,"changed.txt"),"retain");expect((await diarizationRuntimeStatus(cache)).unchanged).toBe(false);await expect(installDiarizationRuntime(cache,"python")).rejects.toThrow("tree or worker changed");expect(await readFile(path.join(first.directory,"changed.txt"),"utf8")).toBe("retain");
});
it("retains failed installation files without selecting them",async()=>{
  const cache=await fixture();runner.mockResolvedValueOnce({exitCode:1,stdout:"",stderr:"failure"});await expect(installDiarizationRuntime(cache,"python")).rejects.toThrow("unselected installation retained");
  const root=path.join(cache,"diarization");expect((await readdir(root)).filter(name=>/^[a-f0-9-]{36}$/.test(name))).toHaveLength(1);await expect(access(path.join(root,"installation.json"))).rejects.toThrow();await expect(access(path.join(root,".install.lock"))).rejects.toThrow();
});
it("preserves both existing and replaced setup locks",async()=>{
  const cache=await fixture(),root=path.join(cache,"diarization");await mkdir(root);await writeFile(path.join(root,".install.lock"),"existing");await expect(installDiarizationRuntime(cache,"python")).rejects.toThrow("lock exists");expect(runner).not.toHaveBeenCalled();expect(await readFile(path.join(root,".install.lock"),"utf8")).toBe("existing");
  const other=await fixture();runner.mockImplementationOnce(async()=>{await writeFile(path.join(other,"diarization",".install.lock"),"replacement");return {exitCode:1};});await expect(installDiarizationRuntime(other,"python")).rejects.toThrow("lock changed");expect(await readFile(path.join(other,"diarization",".install.lock"),"utf8")).toBe("replacement");
});
it("rejects malformed receipts and does not replace them",async()=>{
  const cache=await fixture(),root=path.join(cache,"diarization");await mkdir(root);await writeFile(path.join(root,"installation.json"),JSON.stringify({installationId:"../../outside"}));await expect(installDiarizationRuntime(cache,"python")).rejects.toThrow();expect(runner).not.toHaveBeenCalled();expect(JSON.parse(await readFile(path.join(root,"installation.json"),"utf8")).installationId).toBe("../../outside");
});
