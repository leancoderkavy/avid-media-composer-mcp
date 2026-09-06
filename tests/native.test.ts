import { describe, expect, it,vi,beforeEach,afterEach } from "vitest";
import { decodeFrames, NativeClient, validateWireObject } from "../src/native/client.js";
import protobuf from "protobufjs";
import { nativeActionSchema, NativeAdapter } from "../src/native/adapter.js";
import { loadConfig } from "../src/config.js";
import { withNativeLock } from "../src/native/lock.js";
import {verifyNativeRender} from "../src/native/render-verifier.js";
import {verifyNativeAafMaster} from "../src/native/aaf-verifier.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/native/render-verifier.js",async(importOriginal)=>({...await importOriginal<typeof import("../src/native/render-verifier.js")>(),verifyNativeRender:vi.fn()}));
vi.mock("../src/native/aaf-verifier.js",()=>({verifyNativeAafMaster:vi.fn()}));
beforeEach(async()=>{vi.spyOn(os,"homedir").mockReturnValue(await mkdtemp(path.join(os.tmpdir(),"avid-native-lock-test-")));vi.mocked(verifyNativeRender).mockReset();});
afterEach(()=>vi.restoreAllMocks());

async function hostFixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-native-"));
  await writeFile(path.join(root,"fixture.avb"),"saved bin");
  const source=path.join(root,"source.mov");await writeFile(source,"media");
  const calls:{method:string;body:Record<string,unknown>}[]=[];
  const marker={guid:"marker",name:"original",user:"editor",track_label:{type:"TRACKTYPE_PICTURE",number:1},comment:"before",color:"Green"};
  let failPost=false;
  const client={ownerIdentity:"pid:epoch",async call(method:string,body:Record<string,unknown>={}){
    calls.push({method,body});
    if(method==="GetOpenProjectInfo")return [{path:root,frame_rate:{num:30,den:1}}];
    if(method==="GetAppInfo")return [{app_busy_status:"Idle"}];
    if(method==="GetListOfExportSettings")return [{setting_names:["Fixture"]}];
    if(method==="GetListOfBinItems")return [{mob_id:"clip"}];
    if(method==="GetMobTrackInfo")return [{track_info_list:{track_info:[{label:{type:"TRACKTYPE_PICTURE",number:1},num_segments:2}]}}];
    if(method==="GetViewerMobs"&&failPost)throw new Error("post-read unavailable");
    if(method==="GetViewerMobs")return [{mobs:[{mob_id:"clip",view_type:"Record",current_frame:0,current_timecode:"01:00:00:00"},{mob_id:"other",view_type:"Source",current_frame:3,current_timecode:"PRIVATE"}]}];
    if(method==="GetMobInfo")return [{column_name:"FPS",column_value:"30.00"},{column_name:"Duration",column_value:"3:10:26"},{column_name:"Frame Count Duration",column_value:"5726"},{column_name:"Source File",column_value:"source.mov"},{column_name:"Source Path",column_value:root}];
    if(method==="GetMarkers"){if(failPost)throw new Error("post-read unavailable");return [{info:[marker]}];}
    if(method==="ChangeMarker")Object.assign(marker,body.info);
    if(method==="LoadMobsIntoViewer")failPost=true;
    return [];
  }};
  const adapter=new NativeAdapter(loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,edit,project-write,export"}),client as unknown as NativeClient);
  return {adapter,client,calls,marker,source};
}

describe("native boundaries", () => {
  it("does not verify rejected or unapplied renames and never replays their tokens",async()=>{
    for(const failure of ["reported","unchanged"]){
      const f=await hostFixture(),original=f.client.call.bind(f.client);let current="Original",writes=0;
      vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
        if(method==="GetMobInfo")return [{column_name:"Name",column_value:current}];
        if(method==="SetMobInfo"){writes++;if(failure==="reported"){current="Reviewed";return [{mob_failure:[{mob_id:"clip",failed_columns:[{column_name:"Name",column_value:"Reviewed"}]}]}];}return [];}
        return original(method,body);
      });
      const plan=await f.adapter.preview({action:"rename_clip",bin:"fixture.avb",mobId:"clip",expectedName:"Original",name:"Reviewed"}),result=await f.adapter.apply(plan.token);
      expect(result).toMatchObject({applicationCompleted:true,renameVerified:false,persistenceVerified:false,postStateRead:false,verificationError:"Native rename was not verified; inspect clip before another attempt"});
      expect(result.postState).toEqual([{column_name:"Name",column_value:current}]);await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");expect(writes).toBe(1);
    }
  });
  it("renames only the expected clip name and verifies name readback",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let current="Original",writes=0;
    vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{if(method==="GetMobInfo")return [{column_name:"Name",column_value:current}];if(method==="SetMobInfo"){writes++;expect(body).toEqual({mob_id:"clip",column:{column_name:"Name",column_value:"Reviewed"}});current="Reviewed";return [];}return original(method,body);});
    const action={action:"rename_clip" as const,bin:"fixture.avb",mobId:"clip",expectedName:"Original",name:"Reviewed"};
    await expect(f.adapter.preview({...action,expectedName:"Wrong"})).rejects.toThrow("expectedName");
    const stale=await f.adapter.preview(action);current="External";await expect(f.adapter.apply(stale.token)).rejects.toThrow("expectedName");expect(writes).toBe(0);
    current="Original";const plan=await f.adapter.preview(action);expect(await f.adapter.apply(plan.token)).toMatchObject({renameVerified:true,persistenceVerified:false});expect(writes).toBe(1);await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");
  });
  it("refuses viewer results when bin membership changes during the read",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let lists=0;
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetListOfBinItems"&&++lists>1?Promise.resolve([{mob_id:"replacement"}]):original(method,body));
    await expect(f.adapter.read("viewers","fixture.avb")).rejects.toThrow("membership changed");
  });
  it("verifies show_clip only when the requested MOB appears in the Source viewer",async()=>{
    for(const viewer of ["Record","Source"]){
      const f=await hostFixture(),original=f.client.call.bind(f.client);
      vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="LoadMobsIntoViewer"?Promise.resolve([]):method==="GetViewerMobs"?Promise.resolve([{mobs:[{mob_id:"clip",view_type:viewer,current_frame:0,current_timecode:"00:00:00:00"}]}]):original(method,body));
      const preview=await f.adapter.preview({action:"show_clip",bin:"fixture.avb",mobId:"clip"}),result=await f.adapter.apply(preview.token);
      expect(result).toMatchObject({applicationCompleted:true,viewerVerified:viewer==="Source",postStateRead:viewer==="Source",persistenceVerified:false});
      await expect(f.adapter.apply(preview.token)).rejects.toThrow("consumed");
    }
  });
  it("returns only viewer entries belonging to the requested bin",async()=>{
    const f=await hostFixture(),result=await f.adapter.read("viewers","fixture.avb");expect(result).toMatchObject({viewers:[{mob_id:"clip",current_frame:0}],outOfBinOmitted:1});expect(JSON.stringify(result)).not.toContain("PRIVATE");
    f.calls.length=0;await expect(f.adapter.read("viewers","missing.avb")).rejects.toThrow();expect(f.calls.some(call=>call.method==="GetViewerMobs")).toBe(false);
  });
  it("requires bin membership before native track inspection",async()=>{
    const f=await hostFixture();await expect(f.adapter.read("tracks","fixture.avb","outside")).rejects.toThrow("specified bin");expect(f.calls.some(call=>call.method==="GetMobTrackInfo")).toBe(false);
    await f.adapter.read("tracks","fixture.avb","clip");expect(f.calls.at(-1)).toEqual({method:"GetMobTrackInfo",body:{mob_id:"clip"}});
  });
  it("refuses missing and contradictory native track inventories",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let payload:any[]=[];
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetMobTrackInfo"?Promise.resolve(payload):original(method,body));
    await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow();
    payload=[{track_info_list:null}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow();
    const track={label:{type:"TRACKTYPE_PICTURE",number:1},num_segments:2};payload=[{track_info_list:{track_info:[track,track]}}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow("duplicate");
    payload=[{track_info_list:{track_info:[{...track,num_segments:-1}]}}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow();
    payload=[{track_info_list:{track_info:[]}}];expect(await f.adapter.read("tracks","fixture.avb","clip")).toEqual(payload);
  });
  it("exports AAF references once and retains the lock if structural verification fails",async()=>{
    const {adapter,calls,source}=await hostFixture();const action={action:"export_aaf_master" as const,bin:"fixture.avb",mobId:"clip",preset:"Fixture",sourceFile:source,expectedSourceSha256:await sha256File(source)};
    vi.mocked(verifyNativeAafMaster).mockImplementation(async()=>{await expect(withNativeLock(async()=>1)).rejects.toThrow();return {masterContractVerified:true} as any;});
    const plan=await adapter.preview(action);expect(await adapter.apply(plan.token)).toMatchObject({outputVerified:true,sourceFidelityVerified:false});await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");
    expect(calls.filter(call=>call.method==="ExportFile")).toHaveLength(1);
    const second=await adapter.preview(action);vi.mocked(verifyNativeAafMaster).mockRejectedValue(new Error("AAF source contract mismatch"));
    await expect(adapter.apply(second.token)).rejects.toMatchObject({code:"NATIVE_EXPORT_UNCERTAIN"});await expect(withNativeLock(async()=>1)).rejects.toThrow();
  });
  it("refuses an AAF source checksum mismatch before exporting",async()=>{
    const {adapter,calls,source}=await hostFixture();await expect(adapter.preview({action:"export_aaf_master",bin:"fixture.avb",mobId:"clip",preset:"Fixture",sourceFile:source,expectedSourceSha256:"0".repeat(64)})).rejects.toThrow("checksum changed");expect(calls.some(call=>call.method==="ExportFile")).toBe(false);
  });
  const exportAction={action:"export_mp4" as const,bin:"fixture.avb",mobId:"clip",preset:"Fixture",expected:{videoCodec:"h264",width:1920,height:1080,frames:5726,rate:{num:30,den:1},audio:[]}};
  it("exports only once and keeps the lock through output verification",async()=>{
    const {adapter,calls}=await hostFixture();
    vi.mocked(verifyNativeRender).mockImplementation(async()=>{await expect(withNativeLock(async()=>1)).rejects.toThrow();return {decodePassed:true} as any;});
    const plan=await adapter.preview(exportAction);expect(await adapter.apply(plan.token)).toMatchObject({outputVerified:true,sourceFidelityVerified:false});
    await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(calls.filter(call=>call.method==="ExportFile")).toHaveLength(1);
    await expect(withNativeLock(async()=>2)).resolves.toBe(2);
  });
  it("retains the write lock and consumed token after uncertain export output",async()=>{
    const {adapter,calls}=await hostFixture();vi.mocked(verifyNativeRender).mockRejectedValue(new Error("Output missing"));
    const plan=await adapter.preview(exportAction);await expect(adapter.apply(plan.token)).rejects.toThrow("lock retained");
    await expect(withNativeLock(async()=>1)).rejects.toThrow();await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(calls.filter(call=>call.method==="ExportFile")).toHaveLength(1);
  });
  it("rejects missing export presets and incorrect whole-source contracts before writing",async()=>{
    const {adapter,calls}=await hostFixture();await expect(adapter.preview({...exportAction,preset:"Absent"})).rejects.toThrow("preset is missing");
    await expect(adapter.preview({...exportAction,expected:{...exportAction.expected,frames:120}})).rejects.toThrow("complete source duration");expect(calls.some(call=>call.method==="ExportFile")).toBe(false);
  });
  it("rejects invalid or out-of-source subclip ranges before calling the writer",async()=>{
    const {adapter,calls}=await hostFixture();
    expect(nativeActionSchema.safeParse({action:"create_subclip",bin:"fixture.avb",mobId:"clip",startFrame:20,endFrame:10}).success).toBe(false);
    await expect(adapter.preview({action:"create_subclip",bin:"fixture.avb",mobId:"clip",startFrame:0,endFrame:9999})).rejects.toThrow("exceeds");
    expect((await adapter.preview({action:"create_subclip",bin:"fixture.avb",mobId:"clip",startFrame:2850,endFrame:2880})).token).toBeDefined();
    expect(calls.some(call=>call.method==="CreateSubClip")).toBe(false);
  });
  it("rejects silently dropped fields and enum coercion",()=>{
    const schema=protobuf.parse('syntax="proto3"; enum Color { RED=0; BLUE=1; } message Body { Color color=1; string name=2; }').root.lookupType("Body");
    expect(()=>validateWireObject(schema,{color:"RED",name:"marker"})).not.toThrow();
    for(const value of [{color:"typo"},{color:9},{name:42},{unknown:"field"}])expect(()=>validateWireObject(schema,value)).toThrow();
  });
  it("preserves marker fields and consumes applied tokens",async()=>{
    const {adapter,calls,marker}=await hostFixture();
    const preview=await adapter.preview({action:"change_marker",bin:"fixture.avb",mobId:"clip",guid:"marker",comment:"after",color:"Blue"});
    expect((await adapter.apply(preview.token)).postStateRead).toBe(true);
    expect(marker).toMatchObject({name:"original",user:"editor",comment:"after",color:"Blue",track_label:{number:1}});
    await expect(adapter.apply(preview.token)).rejects.toThrow("consumed");
    expect(calls.filter(call=>call.method==="ChangeMarker")).toHaveLength(1);
  });
  it("invalidates previews when the editor process identity changes",async()=>{
    const {adapter,client,calls}=await hostFixture();
    const preview=await adapter.preview({action:"show_clip",bin:"fixture.avb",mobId:"clip"});
    client.ownerIdentity="another:epoch";
    await expect(adapter.apply(preview.token)).rejects.toThrow("state changed");
    expect(calls.some(call=>call.method==="LoadMobsIntoViewer")).toBe(false);
  });
  it("retains accepted-write status when post-read verification fails",async()=>{
    const {adapter}=await hostFixture();
    const preview=await adapter.preview({action:"show_clip",bin:"fixture.avb",mobId:"clip"});
    expect(await adapter.apply(preview.token)).toMatchObject({applicationCompleted:true,persistenceVerified:false,postStateRead:false,verificationError:"post-read unavailable"});
  });
  it("rejects compressed, partial and oversized frames", () => {
    for (const value of [Buffer.from([0]), Buffer.from([1,0,0,0,0]), Buffer.from([0,0,32,0,0])]) {
      expect(() => decodeFrames(value)).toThrow();
    }
    expect(decodeFrames(Buffer.from([0,0,0,0,1,42]))).toEqual([Buffer.from([42])]);
  });
  it("rejects arbitrary calls, all-marker deletion and path-like bin names", () => {
    for (const action of [{action:"raw",method:"ExportFile"}, {action:"delete_marker",bin:"a.avb",mobId:"id"}, {action:"create_bin",name:"../existing"}]) {
      expect(nativeActionSchema.safeParse(action).success).toBe(false);
    }
  });
  it("does not contact the editor without opt-in", async () => {
    await expect(new NativeAdapter(loadConfig({})).read("app")).rejects.toThrow("AVID_MCP_NATIVE_BINARY");
  });
  it("rejects concurrent process locks and releases after failure", async () => {
    await withNativeLock(async () => {
      await expect(withNativeLock(async () => 1)).rejects.toThrow();
    });
    await expect(withNativeLock(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(withNativeLock(async () => 2)).resolves.toBe(2);
  });
});
