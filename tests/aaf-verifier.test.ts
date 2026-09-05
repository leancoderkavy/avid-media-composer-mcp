import {it,expect,vi,afterEach} from "vitest";
import {mkdtemp,writeFile,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {verifyNativeAafMaster} from "../src/native/aaf-verifier.js";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 // The real inspector returns canonical paths; CI temp roots can be aliases.
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-aaf-verify-"))),file=path.join(root,"reference.aaf"),sourceFile=path.join(root,"source.mov");
 await writeFile(sourceFile,"source");const bytes=Buffer.alloc(512);Buffer.from("d0cf11e0a1b11ae1","hex").copy(bytes);await writeFile(file,bytes);
 const expected={sourceFile,sourceSha256:await sha256File(sourceFile),frames:120};
 const inspection={template:file,sha256:await sha256File(file),masters:[{mobId:"urn:smpte:umid:aa",name:"Source",slots:[{slotId:1,kind:"picture",rate:"30",length:120},{slotId:2,kind:"sound",rate:"30",length:120}]}],locators:[],media:[{file:sourceFile,sha256:expected.sourceSha256}],scope:"fixture"};
 const inspect=vi.spyOn(AafBuilder.prototype,"inspect").mockResolvedValue(inspection);
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"});
 return {root,file,expected,inspection,inspect,config};
}
it("verifies a stable master reference and rechecks its source and owner",async()=>{
 const {file,expected,config}=await fixture(),assertOwner=vi.fn(async()=>{});
 expect(await verifyNativeAafMaster(file,config,expected,{timeoutMs:1000,pollMs:2,assertOwner})).toMatchObject({masterContractVerified:true,sourceFilesUnchanged:true,sourceFidelityVerified:false,exportRetried:false});expect(assertOwner.mock.calls.length).toBeGreaterThanOrEqual(4);
});
it.each(["master","media","rate","length","kind","slots"])("refuses mismatched %s in an otherwise stable AAF",async mismatch=>{
 const {file,expected,config,inspection}=await fixture();
 if(mismatch==="master")inspection.masters.push(inspection.masters[0]!);
 if(mismatch==="media")inspection.media[0]!.sha256="0".repeat(64);
 if(mismatch==="rate")inspection.masters[0]!.slots[0]!.rate="24";
 if(mismatch==="length")inspection.masters[0]!.slots[0]!.length=119;
 if(mismatch==="kind")inspection.masters[0]!.slots[0]!.kind="timecode";
 if(mismatch==="slots")inspection.masters[0]!.slots[1]!.slotId=1;
 await expect(verifyNativeAafMaster(file,config,expected,{timeoutMs:1000,pollMs:2})).rejects.toThrow("contract mismatch");
});
it("refuses a source changed during inspection",async()=>{
 const {file,expected,config,inspection,inspect}=await fixture();inspect.mockImplementation(async()=>{await writeFile(expected.sourceFile,"changed");return inspection;});
 await expect(verifyNativeAafMaster(file,config,expected,{timeoutMs:1000,pollMs:2})).rejects.toThrow("changed during");
});
it("rejects non-AAF output before calling the parser and leaves missing files unproven",async()=>{
 const {file,expected,config,inspect,root}=await fixture();await writeFile(file,Buffer.alloc(512));
 await expect(verifyNativeAafMaster(file,config,expected,{timeoutMs:1000,pollMs:2})).rejects.toThrow("compound file");expect(inspect).not.toHaveBeenCalled();
 await expect(verifyNativeAafMaster(path.join(root,"missing.aaf"),config,expected,{timeoutMs:15,pollMs:2})).rejects.toThrow("No export was retried");
});
