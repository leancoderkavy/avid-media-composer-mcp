import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {it,expect} from "vitest";
import {readBoundedFile,readBoundedJson} from "../src/security/bounded-read.js";
it("reads at the exact limit and rejects oversized files and directories",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-bounded-")),file=path.join(root,"file.json");
  await writeFile(file,'{"ok":true}');expect(await readBoundedJson(file,11)).toEqual({ok:true});
  await expect(readBoundedFile(file,10)).rejects.toThrow("limit");
  await expect(readBoundedFile(root,100)).rejects.toThrow();
});
