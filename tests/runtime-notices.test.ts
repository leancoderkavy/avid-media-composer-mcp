import {it,expect} from "vitest";
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {installRuntimeNotices,runtimeNoticePackages} from "../src/library/runtime-notices.js";
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-runtime-notice-")),runtime=path.join(root,"runtime");
 for(const item of runtimeNoticePackages){const directory=path.join(runtime,"node_modules",item.name);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,"package.json"),JSON.stringify({name:item.name,version:item.version}));}
 return {root,runtime};
}
it("publishes complete bundled notices concurrently and refuses to overwrite changed copies",async()=>{
 const {root,runtime}=await fixture();const results=await Promise.all([installRuntimeNotices(root,runtime),installRuntimeNotices(root,runtime)]);
 const files=results.flatMap(r=>r.packages.flatMap(p=>p.files));expect(files.filter(f=>f.created)).toHaveLength(4);
 const first=files[0]!,before=await readFile(first.file);expect(before.toString()).toContain("Microsoft Corporation");
 await writeFile(first.file,"retain changed notice");await expect(installRuntimeNotices(root,runtime)).rejects.toThrow("refusing to overwrite");expect(await readFile(first.file,"utf8")).toBe("retain changed notice");
 await writeFile(first.file,before);const reused=await installRuntimeNotices(root,runtime);expect(reused.packages.every(p=>p.files.every(f=>!f.created))).toBe(true);
 expect((await readdir(path.dirname(first.file))).some(name=>name.endsWith('.creating'))).toBe(false);
});
it("refuses unresearched installed versions before publishing any notice",async()=>{
 const {root,runtime}=await fixture();await writeFile(path.join(runtime,"node_modules","onnxruntime-web","package.json"),JSON.stringify({name:"onnxruntime-web",version:"99.0.0"}));
 await expect(installRuntimeNotices(root,runtime)).rejects.toThrow("No verified runtime notice mapping");expect(await readdir(root)).toEqual(["runtime"]);
});
it("refuses redirected notice directories and notice files",async()=>{
 const {root,runtime}=await fixture(),outside=await mkdtemp(path.join(os.tmpdir(),"avid-notice-external-"));
 await symlink(outside,path.join(root,"notices"),process.platform==="win32"?"junction":"dir");await expect(installRuntimeNotices(root,runtime)).rejects.toThrow("cannot be a link");expect(await readdir(outside)).toEqual([]);
 await unlink(path.join(root,"notices"));const result=await installRuntimeNotices(root,runtime),first=result.packages[0]!.files[0]!.file;
 const external=path.join(outside,"license");await writeFile(external,await readFile(first));await unlink(first);await symlink(process.platform==="win32"?outside:external,first,process.platform==="win32"?"junction":"file");
 await expect(installRuntimeNotices(root,runtime)).rejects.toThrow("cannot be a link");expect(await readFile(external,"utf8")).toContain("Microsoft Corporation");
});
