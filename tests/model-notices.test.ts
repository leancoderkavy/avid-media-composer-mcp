import {it,expect} from "vitest";
import {mkdtemp,readFile,writeFile,symlink,readdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {installModelNotice} from "../src/library/model-notices.js";
it("creates and reuses notices but preserves changed files",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-notice-")),model="Xenova/clip-vit-base-patch32",revision="a".repeat(40);
 const first=await installModelNotice(root,model,revision);expect(first.created).toBe(true);
 const bytes=await readFile(first.file);expect((await installModelNotice(root,model,revision)).created).toBe(false);
 await writeFile(first.file,"user changed");await expect(installModelNotice(root,model,revision)).rejects.toThrow(/refusing to overwrite/);expect(await readFile(first.file,"utf8")).toBe("user changed");
 await writeFile(first.file,bytes);await installModelNotice(root,model,revision);
 await expect(installModelNotice(root,"../outside",revision)).rejects.toThrow();
 await expect(installModelNotice(root,model,"../outside")).rejects.toThrow();
});
it("refuses a redirected notice directory without writing through it",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-notice-link-")),outside=await mkdtemp(path.join(os.tmpdir(),"avid-notice-outside-"));
 await symlink(outside,path.join(root,"notices"),process.platform==="win32"?"junction":"dir");
 await expect(installModelNotice(root,"onnx-community/whisper-tiny","b".repeat(40))).rejects.toThrow(/cannot be a link/);expect(await readdir(outside)).toEqual([]);
});
it.each(["onnx-community/whisper-base","onnx-community/whisper-tiny","onnx-community/whisper-tiny.en","onnx-community/Florence-2-base-ft"])("retains the packaged notice for %s",async model=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-notice-family-"));expect((await installModelNotice(root,model,"c".repeat(40))).created).toBe(true);
});
