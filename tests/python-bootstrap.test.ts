import {mkdtemp,readdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {it,expect,vi,afterEach} from "vitest";
import {preparePipWheel} from "../src/library/python-bootstrap.js";
afterEach(()=>vi.unstubAllGlobals());
it("rejects failed, oversized and checksum-invalid bootstrap downloads before writing executable code",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"avid-pip-"));
  for(const [response,message] of [[new Response(null,{status:404}),"download failed"],[new Response(Buffer.alloc(1816633)),"expected size"],[new Response(Buffer.alloc(1816632)),"checksum/size mismatch"]] as const){vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));await expect(preparePipWheel(directory)).rejects.toThrow(message);expect(await readdir(directory)).toEqual([]);}
});
