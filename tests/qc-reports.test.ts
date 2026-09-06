import {it,expect} from "vitest";
import {mkdtemp,realpath,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {QcReports} from "../src/library/qc-reports.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const first="00000000-0000-4000-8000-000000000001",second="00000000-0000-4000-8000-000000000002";
async function fixture(){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-qc-reports-"))),file=path.join(root,"source.mp4");await writeFile(file,"source bytes");
 const id=await sha256File(file),directory=path.join(root,"avid-mcp-library");await mkdir(directory);
 await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file,bytes:12,metadata:{},transcript:[]}));
 const report={schema:1,id,range:{start:0,end:4},options:{end:4},streams:{video:0,audio:1},findings:{black:[],freeze:[],silence:[],frameTiming:null,loudness:null},reviewRequired:true,limitations:[],sourceModified:false};
 const reportPath=path.join(directory,`qc-${first}.json`);await writeFile(reportPath,JSON.stringify(report));
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect"});
 return {root,file,id,directory,report,reportPath,config,service:new QcReports(config)};
}
it("discovers and reads reports in a fresh service using inspect-only authority",async()=>{
 const f=await fixture(),page=await f.service.list(f.id);
 expect(page.reports).toHaveLength(1);expect(page.next).toBeNull();
 const read=await new QcReports(f.config).read(f.id,first,page.reports[0]!.sha256);
 expect(read.sourceCurrent).toBe(true);expect(read.report.id).toBe(f.id);
  await expect(f.service.read(f.id,first,"0".repeat(64))).rejects.toThrow("checksum mismatch");
  await writeFile(f.reportPath,JSON.stringify({...f.report,range:{start:0,end:5}}));
  await expect(f.service.read(f.id,first)).rejects.toThrow("range and options disagree");
 await expect(f.service.read(f.id,"../outside")).rejects.toThrow();
});
it("keeps media identities isolated and paginates unreadable reports without hiding later pages",async()=>{
 const f=await fixture();await writeFile(f.reportPath,JSON.stringify({...f.report,id:"0".repeat(64)}));
 await writeFile(path.join(f.directory,`qc-${"-".repeat(36)}.json`),JSON.stringify(f.report));
 await expect(f.service.read(f.id,first)).rejects.toThrow("another media");
 await writeFile(path.join(f.directory,`qc-${second}.json`),JSON.stringify(f.report));
 const page=await f.service.list(f.id,undefined,1);expect(page.reports).toEqual([]);expect(page.next).toBe(first);
 expect((await f.service.list(f.id,page.next!,1)).reports[0]!.revision).toBe(second);
 await writeFile(f.reportPath,"broken JSON");expect((await f.service.list(f.id,undefined,1)).unreadable).toBe(1);
 await expect(f.service.list(f.id,undefined,51)).rejects.toThrow("page size");
});
it("rejects oversized reports and changed or unauthorized sources",async()=>{
 const f=await fixture();await writeFile(f.reportPath," ".repeat(4*1024*1024+1));
 await expect(f.service.read(f.id,first)).rejects.toThrow(/limit/);
 await writeFile(f.file,"changed");await expect(f.service.list(f.id)).rejects.toThrow("source changed");
 const elsewhere=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-qc-scope-")));
 const denied=new QcReports({...f.config,allowedRoots:[elsewhere]});await expect(denied.read(f.id,first)).rejects.toThrow();
});
