import { describe, expect, it,vi,beforeEach,afterEach } from "vitest";
import { decodeFrames, NativeClient, validateWireObject } from "../src/native/client.js";
import protobuf from "protobufjs";
import { nativeActionSchema, NativeAdapter } from "../src/native/adapter.js";
import { loadConfig } from "../src/config.js";
import { withNativeLock } from "../src/native/lock.js";
import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

beforeEach(async()=>{vi.spyOn(os,"homedir").mockReturnValue(await mkdtemp(path.join(os.tmpdir(),"avid-native-lock-test-")));});
afterEach(()=>vi.restoreAllMocks());

async function hostFixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-native-"));
  await writeFile(path.join(root,"fixture.avb"),"saved bin");
  const calls:{method:string;body:Record<string,unknown>}[]=[];
  const marker={guid:"marker",name:"original",user:"editor",track_label:{type:"TRACKTYPE_PICTURE",number:1},comment:"before",color:"Green"};
  let failPost=false;
  const client={ownerIdentity:"pid:epoch",async call(method:string,body:Record<string,unknown>={}){
    calls.push({method,body});
    if(method==="GetOpenProjectInfo")return [{path:root,frame_rate:{num:30,den:1}}];
    if(method==="GetAppInfo")return [{app_busy_status:"Idle"}];
    if(method==="GetListOfBinItems")return [{mob_id:"clip"}];
    if(method==="GetMobInfo")return [{column_name:"FPS",column_value:"30.00"},{column_name:"Duration",column_value:"3:10:26"}];
    if(method==="GetMarkers"){if(failPost)throw new Error("post-read unavailable");return [{info:[marker]}];}
    if(method==="ChangeMarker")Object.assign(marker,body.info);
    if(method==="LoadMobsIntoViewer")failPost=true;
    return [];
  }};
  const adapter=new NativeAdapter(loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_CAPABILITIES:"inspect,edit,project-write"}),client as unknown as NativeClient);
  return {adapter,client,calls,marker};
}

describe("native boundaries", () => {
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
