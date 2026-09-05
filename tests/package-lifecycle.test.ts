import {it,expect} from "vitest";
import {mkdtemp,mkdir,writeFile,unlink,realpath} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import path from "node:path";
import os from "node:os";
import {packageTreeHash,packageStatus,removePackage} from "../src/package-lifecycle.js";
it("binds managed installation contents and refuses changed files or receipt checksums",async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-managed-tree-"))),id=randomUUID(),directory=path.join(root,id);await mkdir(directory);await writeFile(path.join(directory,"owned.txt"),"original");
 const treeSha256=await packageTreeHash(directory),receipt=JSON.stringify({schema:1,installationId:id,directory,version:"fixture",treeSha256});await writeFile(path.join(directory,"installation.json"),receipt);
 const status=await packageStatus(root,id);expect(status.unchanged).toBe(true);expect(status.receiptSha256).toBe(createHash("sha256").update(receipt).digest("hex"));
 await expect(removePackage(root,id,"0".repeat(64))).rejects.toThrow(/receipt changed/);
 await writeFile(path.join(directory,"user-notes.txt"),"preserve");expect((await packageStatus(root,id)).unchanged).toBe(false);await expect(removePackage(root,id,status.receiptSha256)).rejects.toThrow(/files changed/);
 await unlink(path.join(directory,"user-notes.txt"));expect((await packageStatus(root,id)).unchanged).toBe(true);
 await writeFile(path.join(directory,"owned.txt"),"changed");expect((await packageStatus(root,id)).unchanged).toBe(false);
});
it("rejects traversal and receipts bound to another location",async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-managed-location-"))),id=randomUUID(),directory=path.join(root,id);await mkdir(directory);
 await expect(packageStatus(root,"../elsewhere")).rejects.toThrow();
 await writeFile(path.join(directory,"installation.json"),JSON.stringify({schema:1,installationId:id,directory:root,version:"fixture",treeSha256:"0".repeat(64)}));
 await expect(packageStatus(root,id)).rejects.toThrow(/location mismatch/);
});

it("refuses recovery when quarantined installation content is incomplete",async()=>{
 const {recoverPackageRemoval}=await import("../src/package-lifecycle.js");
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-removal-recovery-"))),id=randomUUID(),name=id+".removing-"+randomUUID(),directory=path.join(root,name);await mkdir(directory);
 const receipt=JSON.stringify({schema:1,installationId:id,directory:path.join(root,id),version:"fixture",treeSha256:"0".repeat(64)});await writeFile(path.join(directory,"installation.json"),receipt);
 await expect(recoverPackageRemoval(root,name,createHash("sha256").update(receipt).digest("hex"))).rejects.toThrow(/partially deleted/);
});
