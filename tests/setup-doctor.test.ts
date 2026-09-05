import {expect,it,vi} from "vitest";
import {doctor} from "../src/setup.js";
import {loadConfig} from "../src/config.js";
import {probeFfprobe} from "../src/analysis/media.js";
import {probePythonInspector} from "../src/analysis/python-sidecar.js";

vi.mock("../src/analysis/media.js",()=>({probeFfprobe:vi.fn()}));
vi.mock("../src/analysis/python-sidecar.js",()=>({probePythonInspector:vi.fn()}));

it.each([false,true])("reports dependency readiness, not just successful probe execution (%s)",async available=>{
  vi.mocked(probeFfprobe).mockResolvedValue({available,executable:"ffprobe",...(!available?{error:"Executable missing"}:{})});
  vi.mocked(probePythonInspector).mockResolvedValue({available,executable:"python",packages:{pyavb:available?"1.4.0":null},...(!available?{error:"Python packages missing"}:{})});
  const result=await doctor(loadConfig({AVID_MCP_ALLOWED_ROOTS:process.cwd()}));
  expect(result.ffprobe).toMatchObject({ok:available,data:{available}});
  expect(result.python).toMatchObject({ok:available,data:{available}});
  if(!available){expect(result.ffprobe).toHaveProperty("error","Executable missing");expect(result.python).toHaveProperty("error","Python packages missing");}
  expect(result.native.ok).toBe(false);
});
