import {expect,it,vi} from "vitest";
import {doctor,doctorConfiguration} from "../src/setup.js";
import {loadConfig} from "../src/config.js";
import {probeFfmpeg,probeFfprobe} from "../src/analysis/media.js";
import {probePythonInspector} from "../src/analysis/python-sidecar.js";
import {mkdtemp,writeFile,unlink,rmdir,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

vi.mock("../src/analysis/media.js",()=>({probeFfmpeg:vi.fn(),probeFfprobe:vi.fn()}));
vi.mock("../src/analysis/python-sidecar.js",()=>({probePythonInspector:vi.fn()}));

it('applies explicit doctor paths while preserving unspecified environment settings',()=>{
  const root=path.resolve('doctor-root'),output=path.resolve('doctor-output'),native=path.resolve('editor.exe'),model=path.resolve('models');
  const env={AVID_MCP_ALLOWED_ROOTS:path.resolve('environment-root'),AVID_MCP_NATIVE_BINARY:path.resolve('environment-editor.exe'),AVID_MCP_FFPROBE:'custom-probe'};
  const result=doctorConfiguration({roots:[root],outputRoot:output,nativeBinary:native,modelDirectory:model},env);
  expect(result).toMatchObject({allowedRoots:[root],outputRoot:output,nativeBinary:native,modelDirectory:model,ffprobeExecutable:'custom-probe'});
  expect(env.AVID_MCP_NATIVE_BINARY).toBe(path.resolve('environment-editor.exe'));
  expect(doctorConfiguration({},env).allowedRoots).toEqual([env.AVID_MCP_ALLOWED_ROOTS]);
  expect(()=>doctorConfiguration({roots:['relative']},env)).toThrow('absolute');
  expect(()=>doctorConfiguration({nativeBinary:'relative'},env)).toThrow('absolute');
});

it.each([false,true])("reports dependency readiness, not just successful probe execution (%s)",async available=>{
  vi.mocked(probeFfmpeg).mockResolvedValue({available,executable:"ffmpeg",...(!available?{error:"Executable missing"}:{})});
  vi.mocked(probeFfprobe).mockResolvedValue({available,executable:"ffprobe",...(!available?{error:"Executable missing"}:{})});
  vi.mocked(probePythonInspector).mockResolvedValue({available,executable:"python",packages:{pyavb:available?"1.4.0":null},...(!available?{error:"Python packages missing"}:{})});
  const result=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:process.cwd()}));
  expect(result.ffmpeg).toMatchObject({ok:available,data:{available}});
  expect(result.ffprobe).toMatchObject({ok:available,data:{available}});
  expect(result.python).toMatchObject({ok:available,data:{available}});
  if(!available){expect(result.ffprobe).toHaveProperty("error","Executable missing");expect(result.python).toHaveProperty("error","Python packages missing");}
  expect(result.native.ok).toBe(false);
});

it("distinguishes empty scope and invalid output paths without creating directories",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-doctor-"));
  const file=path.join(root,"allowed.avb"),missing=path.join(root,"missing");
  await writeFile(file,"fixture");
  try{
    const empty=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:path.delimiter,AVID_MCP_OUTPUT_ROOT:missing}));
    expect(empty.roots).toMatchObject({ok:false,error:"No allowed roots are configured"});
    expect(empty.outputDirectory.ok).toBe(false);
    await expect(realpath(missing)).rejects.toMatchObject({code:"ENOENT"});
    const invalid=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:file,AVID_MCP_OUTPUT_ROOT:file}));
    expect(invalid.roots).toMatchObject({ok:true,data:[await realpath(file)]});
    expect(invalid.outputDirectory).toMatchObject({ok:false,error:"Configured output root is not a directory"});
    const valid=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root}));
    expect(valid.outputDirectory).toMatchObject({ok:true,data:{path:await realpath(root)}});
    const unconfigured=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:root}));
    expect(unconfigured.outputDirectory).toMatchObject({ok:false,error:"Output directory is not explicitly configured"});
  }finally{await unlink(file);await rmdir(root);}
});
