import {it,expect} from "vitest";
import {mkdtemp,copyFile,readFile,writeFile,unlink,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {FACE_MODELS,verifyFaceLicenses} from "../src/library/face-runtime.js";

it("accepts exact pinned notices and rejects changed or missing licenses",async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-face-notices-")));
 for(const model of FACE_MODELS)await copyFile(path.resolve("docs/licenses",`${model.folder}.LICENSE`),path.join(root,`${model.folder}.LICENSE`));
 await verifyFaceLicenses(root);
 const file=path.join(root,"face_detection_yunet.LICENSE"),original=await readFile(file),changed=Buffer.from(original);changed[0]=changed[0]===65?66:65;
 await writeFile(file,changed);await expect(verifyFaceLicenses(root)).rejects.toThrow(/checksum mismatch/);
 await writeFile(file,original);await verifyFaceLicenses(root);
 await unlink(file);await expect(verifyFaceLicenses(root)).rejects.toThrow();
});
