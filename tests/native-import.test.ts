import {it,expect,vi,beforeEach,afterEach} from "vitest";
import {mkdtemp,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {NativeAdapter} from "../src/native/adapter.js";
import type {NativeClient} from "../src/native/client.js";
import {withNativeLock} from "../src/native/lock.js";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
beforeEach(async()=>vi.spyOn(os,"homedir").mockReturnValue(await mkdtemp(path.join(os.tmpdir(),"avid-import-lock-"))));
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-import-")),file=path.join(root,"selects.aaf"),media=path.join(root,"media.mov");
 await writeFile(file,"AAF");await writeFile(media,"PCM");await writeFile(path.join(root,"empty.avb"),"bin");
 const state={occupied:false,imported:false,preset:true,rate:30,failure:"",calls:[] as string[]};
 const inspection=vi.spyOn(AafBuilder.prototype,"inspectSelects").mockImplementation(async()=>({file,sha256:await sha256File(file),masters:[],locators:[],composition:{mobId:"urn:smpte:umid:aa",name:"Selects",rate:"30",frames:120,tracks:[]},media:[{file:media,sha256:await sha256File(media)}],hostImportVerified:false,scope:"fixture"}));
 const client={ownerIdentity:"pid:epoch",async call(method:string){
  state.calls.push(method);
  if(method==="GetAppInfo")return [{app_busy_status:"Idle"}];
  if(method==="GetOpenProjectInfo")return [{path:root,frame_rate:{num:state.rate,den:1}}];
  if(method==="GetListOfImportSettings")return [{setting_names:state.preset?["Untitled"]:[]}];
  if(method==="GetListOfBinItems")return state.imported?[{mob_id:"native-id",mob_name:"Selects"}]:state.occupied?[{mob_id:"old",mob_name:"old"}]:[];
  if(method==="GetMobInfo")return [{column_name:"Name",column_value:"Selects"},{column_name:"FPS",column_value:"30.00"},{column_name:"Frame Count Duration",column_value:state.failure==="metadata"?"119":"120"}];
  if(method==="ImportFile"){
   await expect(withNativeLock(async()=>1)).rejects.toThrow();state.imported=true;
   if(state.failure==="rpc")throw new Error("RPC timeout");
   if(state.failure==="source")await writeFile(media,"changed");
  }
  return [];
 }};
 const config=loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,edit,export"});
 const adapter=new NativeAdapter(config,client as unknown as NativeClient);
 const action={action:"import_aaf_selects" as const,bin:"empty.avb",file,expectedSha256:await sha256File(file),preset:"Untitled"};
 return {root,file,media,state,inspection,client,config,adapter,action};
}
it("imports once into an empty bin and records native metadata without claiming saved conformance",async()=>{
 const {adapter,action,state}=await fixture();const plan=await adapter.preview(action),result=await adapter.apply(plan.token);
 expect(result).toMatchObject({hostMetadataVerified:true,sourceFilesUnchanged:true,persistenceVerified:false,sourceFidelityVerified:false,sequence:{mob_id:"native-id"}});
 await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(state.calls.filter(x=>x==="ImportFile")).toHaveLength(1);
 await expect(withNativeLock(async()=>2)).resolves.toBe(2);
});
it.each(["occupied","preset","rate","checksum"])("refuses %s before import",async condition=>{
 const {adapter,action,state}=await fixture();
 if(condition==="occupied")state.occupied=true;if(condition==="preset")state.preset=false;if(condition==="rate")state.rate=24;if(condition==="checksum")action.expectedSha256="0".repeat(64);
 await expect(adapter.preview(action)).rejects.toThrow();expect(state.calls).not.toContain("ImportFile");
});
it.each(["bin","source","owner"])("invalidates the preview when %s changes",async condition=>{
 const {adapter,action,state,media,client}=await fixture();const plan=await adapter.preview(action);
 if(condition==="bin")state.occupied=true;if(condition==="source")await writeFile(media,"changed");if(condition==="owner")client.ownerIdentity="other:epoch";
 await expect(adapter.apply(plan.token)).rejects.toThrow();expect(state.calls).not.toContain("ImportFile");await expect(withNativeLock(async()=>2)).resolves.toBe(2);
});
it.each(["rpc","metadata","source"])("retains import lock and prevents replay after %s uncertainty",async failure=>{
 const {adapter,action,state}=await fixture();const plan=await adapter.preview(action);state.failure=failure;
 await expect(adapter.apply(plan.token)).rejects.toMatchObject({code:"NATIVE_IMPORT_UNCERTAIN"});
 const lock=await readFile(path.join(os.homedir(),".avid-mcp/native-write.lock"),"utf8");expect(lock).toContain('"state":"import-unresolved"');expect(lock).toContain("attempt.json");
 await expect(withNativeLock(async()=>2)).rejects.toThrow();await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(state.calls.filter(x=>x==="ImportFile")).toHaveLength(1);
});
it("requires edit and evidence-export capabilities before preflight",async()=>{
 const {config,client,action,inspection}=await fixture();
 for(const capabilities of [new Set(["inspect","export"]),new Set(["inspect","edit"])]){
  const adapter=new NativeAdapter({...config,capabilities} as typeof config,client as unknown as NativeClient);
  await expect(adapter.preview(action)).rejects.toThrow();
 }
 expect(inspection).not.toHaveBeenCalled();
});
