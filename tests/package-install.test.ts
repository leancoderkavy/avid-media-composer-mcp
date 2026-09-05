import {it,expect} from "vitest";
import path from "node:path";
import {mkdtemp,writeFile,access} from "node:fs/promises";
import os from "node:os";
import {installPackage,validatePackageInstall} from "../src/package-install.js";
it("rejects ambiguous package locations and malformed expected digests",()=>{
 const root=path.resolve("fixture");
 expect(()=>validatePackageInstall("relative.tgz",root,"a".repeat(64))).toThrow(/absolute/);
 expect(()=>validatePackageInstall(path.join(root,"source.zip"),root,"a".repeat(64))).toThrow(/tgz/);
 expect(()=>validatePackageInstall(path.join(root,"source.tgz"),root,"A".repeat(64))).toThrow(/SHA/);
});
it("rejects changed archive bytes before creating an installation root",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-package-invalid-")),file=path.join(root,"source.tgz"),destination=path.join(root,"installs");
 await writeFile(file,"not the approved archive");
 await expect(installPackage(file,destination,"0".repeat(64))).rejects.toThrow(/checksum mismatch/);
 await expect(access(destination)).rejects.toThrow();
});
