import { describe, expect, it,vi,beforeEach,afterEach } from "vitest";
import { decodeFrames, NativeClient, validateWireObject } from "../src/native/client.js";
import protobuf from "protobufjs";
import { nativeActionSchema, NativeAdapter } from "../src/native/adapter.js";
import { loadConfig } from "../src/config.js";
import { withNativeLock } from "../src/native/lock.js";
import {verifyNativeRender} from "../src/native/render-verifier.js";
import {verifyNativeAafMaster} from "../src/native/aaf-verifier.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {mkdtemp,writeFile,mkdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/native/render-verifier.js",async(importOriginal)=>({...await importOriginal<typeof import("../src/native/render-verifier.js")>(),verifyNativeRender:vi.fn()}));
vi.mock("../src/native/aaf-verifier.js",()=>({verifyNativeAafMaster:vi.fn()}));
beforeEach(async()=>{vi.spyOn(os,"homedir").mockReturnValue(await mkdtemp(path.join(os.tmpdir(),"avid-native-lock-test-")));vi.mocked(verifyNativeRender).mockReset();});
afterEach(()=>vi.restoreAllMocks());

async function hostFixture(capabilities="inspect,edit,project-write,export"){
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
  const adapter=new NativeAdapter(loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:capabilities}),client as unknown as NativeClient);
  return {adapter,client,calls,marker,source};
}

describe("native boundaries", () => {
  it('sets and clears Comments with expected-value checks and single-use plans',async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let current='',writes=0;
    vi.spyOn(f.client,'call').mockImplementation(async(method,body)=>{
      if(method==='GetBinColumnInfo')return [{column:[{column_name:'Comments',column_value_type:'String',column_hidden:false,column_is_custom:true,column_is_readonly:false}]}];
      if(method==='GetMobInfo')return [{column_name:'Comments',column_value:current}];
      if(method==='SetMobInfo'){writes++;expect(body?.column.column_name).toBe('Comments');current=body?.column.column_value;return [];}
      return original(method,body);
    });
    const operation={action:'set_clip_comment' as const,bin:'fixture.avb',mobId:'clip',expectedComment:'',comment:'Reviewed'};
    const stale=await f.adapter.preview(operation);current='External';await expect(f.adapter.apply(stale.token)).rejects.toThrow('expectedComment');expect(writes).toBe(0);current='';
    for(const action of [operation,{...operation,expectedComment:'Reviewed',comment:''}]){
      const plan=await f.adapter.preview(action);expect(await f.adapter.apply(plan.token)).toMatchObject({commentVerified:true,persistenceVerified:false});
      await expect(f.adapter.apply(plan.token)).rejects.toThrow('consumed');
    }
    expect(writes).toBe(2);expect(current).toBe('');
  });
  it.each(['column-refusal','transport-after-write'])('does not replay a Comments RPC failure: %s',async variant=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let current='',writes=0;
    vi.spyOn(f.client,'call').mockImplementation(async(method,body)=>{
      if(method==='GetBinColumnInfo')return [{column:[{column_name:'Comments',column_value_type:'String',column_hidden:false,column_is_custom:true,column_is_readonly:false}]}];
      if(method==='GetMobInfo')return [{column_name:'Comments',column_value:current}];
      if(method==='SetMobInfo'){
        writes++;
        if(variant==='transport-after-write')current=body?.column.column_value;
        throw new Error(variant==='column-refusal'?'Column is not modifiable.':'Connection lost after dispatch');
      }
      return original(method,body);
    });
    const plan=await f.adapter.preview({action:'set_clip_comment',bin:'fixture.avb',mobId:'clip',expectedComment:'',comment:'Review'});
    await expect(f.adapter.apply(plan.token)).rejects.toThrow(variant==='column-refusal'?'Column is not modifiable.':'Connection lost after dispatch');
    await expect(f.adapter.apply(plan.token)).rejects.toThrow('consumed');
    expect(writes).toBe(1);
    expect(await f.adapter.read('clip_columns','fixture.avb','clip')).toMatchObject({columns:[{column_name:'Comments',column_value:variant==='column-refusal'?'':'Review'}]});
    expect(writes).toBe(1);
  });
  it.each(['readonly','missing','mismatch','reported','authority'])('refuses or reports unverified %s Comments edits',async variant=>{
    const f=await hostFixture(variant==='authority'?'inspect':'inspect,edit'),original=f.client.call.bind(f.client);let current='',writes=0;
    vi.spyOn(f.client,'call').mockImplementation(async(method,body)=>{
      if(method==='GetBinColumnInfo')return [{column:[{column_name:'Comments',column_value_type:'String',column_hidden:false,column_is_custom:true,column_is_readonly:variant==='readonly'}]}];
      if(method==='GetMobInfo')return variant==='missing'?[]:[{column_name:'Comments',column_value:current}];
      if(method==='SetMobInfo'){writes++;if(variant==='reported'){current='Review';return [{mob_failure:[{mob_id:'clip'}]}];}return [];}
      return original(method,body);
    });
    const action={action:'set_clip_comment' as const,bin:'fixture.avb',mobId:'clip',expectedComment:'',comment:'Review'};
    if(['readonly','missing'].includes(variant)){await expect(f.adapter.preview(action)).rejects.toThrow();expect(writes).toBe(0);return;}
    const plan=await f.adapter.preview(action);
    if(variant==='authority'){await expect(f.adapter.apply(plan.token)).rejects.toThrow();expect(writes).toBe(0);return;}
    expect(await f.adapter.apply(plan.token)).toMatchObject({commentVerified:false});expect(writes).toBe(1);
  });
  it('reads empty clip columns without inventing missing rows',async()=>{
    const f=await hostFixture('inspect'),original=f.client.call.bind(f.client);
    vi.spyOn(f.client,'call').mockImplementation((method,body)=>{
      if(method==='GetMobInfo'){expect(body).toEqual({mob_id:'clip',includes_empty_columns:true,only_visible_columns:false});return Promise.resolve([{column_name:'Comments',private:'ignored'},{column_name:'Name',column_value:'Clip'}]);}
      return original(method,body);
    });
    const result=await f.adapter.read('clip_columns','fixture.avb','clip');
    expect(result).toMatchObject({includesEmptyColumns:true,columns:[{column_name:'Comments',column_value:''},{column_name:'Name',column_value:'Clip'}]});
    expect(JSON.stringify(result)).not.toContain('"private"');
  });
  it.each(['duplicate','malformed','membership'])('refuses %s clip column reads',async variant=>{
    const f=await hostFixture('inspect'),original=f.client.call.bind(f.client);let queried=false;
    vi.spyOn(f.client,'call').mockImplementation((method,body)=>{
      if(method==='GetMobInfo'){queried=true;return Promise.resolve(variant==='duplicate'?[{column_name:'Name'},{column_name:'Name'}]:[{column_name:'Name',column_value:variant==='malformed'?null:'Clip'}]);}
      if(queried&&variant==='membership'&&method==='GetListOfBinItems')return Promise.resolve([]);
      return original(method,body);
    });
    await expect(f.adapter.read('clip_columns','fixture.avb','clip')).rejects.toThrow();
  });
  it("reads scoped column declarations with whitespace names and no extra fields",async()=>{
    const f=await hostFixture('inspect'),original=f.client.call.bind(f.client);
    const column={column_name:'   ',column_value_type:'Undefined',column_hidden:false,column_is_custom:false,column_is_readonly:true};
    vi.spyOn(f.client,'call').mockImplementation((method,body)=>method==='GetBinColumnInfo'?Promise.resolve([{column:[{...column,unrequested:'private'}]}]):original(method,body));
    const result=await f.adapter.read('bin_columns','fixture.avb');
    expect(result).toHaveProperty('columns',[column]);
    expect(JSON.stringify(result)).not.toContain('"unrequested"');
    expect(f.calls.filter(c=>c.method==='GetOpenProjectInfo')).toHaveLength(2);
  });
  it.each(['duplicate','oversized','malformed','changed-project'])('refuses %s native column results',async variant=>{
    const f=await hostFixture('inspect'),original=f.client.call.bind(f.client);let queried=false;
    const column={column_name:'Name',column_value_type:'String',column_hidden:false,column_is_custom:false,column_is_readonly:false};
    vi.spyOn(f.client,'call').mockImplementation((method,body)=>{
      if(method==='GetBinColumnInfo'){queried=true;return Promise.resolve([{column:variant==='duplicate'?[column,column]:variant==='oversized'?Array.from({length:513},(_,i)=>({...column,column_name:String(i)})):variant==='malformed'?[{...column,column_hidden:'false'}]:[column]}]);}
      if(queried&&variant==='changed-project'&&method==='GetOpenProjectInfo')return Promise.resolve([{path:os.tmpdir(),frame_rate:{num:30,den:1}}]);
      return original(method,body);
    });
    await expect(f.adapter.read('bin_columns','fixture.avb')).rejects.toThrow();
  });
  it("refuses a missing bin before requesting native column data",async()=>{
    const f=await hostFixture('inspect');await expect(f.adapter.read('bin_columns','missing.avb')).rejects.toThrow();
    expect(f.calls.some(c=>c.method==='GetBinColumnInfo')).toBe(false);
  });
  it.each([false,true])("exports EDL once and retains uncertain failures (mismatch=%s)",async(failVerification)=>{
    const f=await hostFixture(),root=path.dirname(f.source),exportDirectory=path.join(os.homedir(),"Avid EDL Exports");await mkdir(exportDirectory);
    const adapter=new NativeAdapter(loadConfig({AVID_MCP_NATIVE_BINARY:"fixture",AVID_MCP_ALLOWED_ROOTS:[root,os.homedir()].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}),f.client as unknown as NativeClient);
    const original=f.client.call.bind(f.client);let writes=0;
    vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
      if(method==="GetMobInfo")return [...await original(method,body),{column_name:"Name",column_value:"Fixture"}];
      if(method==="GetListOfExportEDLSettings")return [{setting_names:["Default EDL"]}];
      if(method==="ExportEDL"){writes++;const output=path.join(exportDirectory,"Fixture.001.edl");await writeFile(output,`FCM: NON-DROP FRAME\n001 ${failVerification?"WRONG":"R"} AA/V C 00:00:00:00 00:03:10:26 01:00:00:00 01:03:10:26`);return [{path:output}];}
      return original(method,body);
    });
    const action={action:"export_edl" as const,bin:"fixture.avb",mobId:"clip",preset:"Default EDL",exportDirectory,expected:{frameRate:30 as const,events:[{reel:"R",track:"AA/V",sourceIn:"00:00:00:00",sourceOut:"00:03:10:26",recordIn:"01:00:00:00",recordOut:"01:03:10:26"}]}};
    const plan=await adapter.preview(action);
    if(failVerification){await expect(adapter.apply(plan.token)).rejects.toMatchObject({code:"NATIVE_EXPORT_UNCERTAIN"});await expect(withNativeLock(async()=>1)).rejects.toThrow();await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(writes).toBe(1);return;}
    expect(await adapter.apply(plan.token)).toMatchObject({outputVerified:true,sourceFidelityVerified:false});expect(writes).toBe(1);
    await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");expect(writes).toBe(1);
    await expect(adapter.preview({...action,expected:{...action.expected,events:[{...action.expected.events[0]!,track:"V"}]}})).rejects.toThrow("AA/V");
  });

  it("bounds EDL preset discovery without exposing native extra fields",async()=>{
    const f=await hostFixture("inspect"),original=f.client.call.bind(f.client);let payload:any[]=[{setting_names:["CMX 3600","CMX 3600"],private:"PRIVATE"}];
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetListOfExportEDLSettings"?Promise.resolve(payload):original(method,body));
    const result=await f.adapter.read("edl_settings");expect(result).toMatchObject({settingNames:["CMX 3600"]});expect(JSON.stringify(result)).not.toContain("PRIVATE");
    for(payload of [[{}],[{setting_names:[123]}],[{setting_names:Array(513).fill("x")}],[{setting_names:Array(300).fill("x")},{setting_names:Array(300).fill("y")}]])await expect(f.adapter.read("edl_settings")).rejects.toThrow();
    payload=[];expect(await f.adapter.read("edl_settings")).toMatchObject({settingNames:[]});
  });
  it("reports empty viewer inventory without claiming a loaded clip",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetViewerMobs"?Promise.resolve([]):original(method,body));
    expect(await f.adapter.read("viewers","fixture.avb")).toMatchObject({viewers:[],outOfBinOmitted:0});
    const plan=await f.adapter.preview({action:"show_clip",bin:"fixture.avb",mobId:"clip"});
    expect(await f.adapter.apply(plan.token)).toMatchObject({postStateRead:true,viewerVerified:false});
  });
  it("scopes open-bin inventories and strips unqualified metadata",async()=>{
    const f=await hostFixture("inspect"),original=f.client.call.bind(f.client),file=path.join(path.dirname(f.source),"fixture.avb");
    vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
      if(method==="GetBins"){expect(body).toEqual({request_flag:["AllTypes","OnlyOpen"]});return [{absolute_path:file,private_metadata:"PRIVATE"}];}
      return original(method,body);
    });
    const canonical=await import("node:fs/promises").then(fs=>fs.realpath(file));
    const result=await f.adapter.read("open_bins");expect(result).toMatchObject({bins:[{absolute_path:canonical}]});
    expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(f.calls.filter(call=>call.method==="GetOpenProjectInfo")).toHaveLength(2);
  });
  it("refuses malformed, duplicate, outside-project and excessive open-bin inventories",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client),file=path.join(path.dirname(f.source),"fixture.avb"),outside=await mkdtemp(path.join(os.tmpdir(),"avid-other-project-"));
    const other=path.join(outside,"other.avb");await writeFile(other,"other bin");let payload:any[]=[];
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetBins"?Promise.resolve(payload):original(method,body));
    for(payload of [[{}],[{absolute_path:"fixture.avb"}],[{absolute_path:other}],[{absolute_path:file},{absolute_path:file}],Array.from({length:4097},()=>({absolute_path:file}))])await expect(f.adapter.read("open_bins")).rejects.toThrow();
    payload=[];expect(await f.adapter.read("open_bins")).toMatchObject({bins:[]});
  });
  it("refuses open-bin data if the project changes before return",async()=>{
    const f=await hostFixture(),original=f.client.call.bind(f.client);let projects=0;
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>{
      if(method==="GetOpenProjectInfo"&&++projects===2)return Promise.resolve([{path:os.tmpdir()}]);
      return original(method,body);
    });
    await expect(f.adapter.read("open_bins")).rejects.toThrow();
  });
  it("checks target bin info after open and close",async()=>{
    for(const action of ["open_bin","close_bin"] as const)for(const present of [true,false]){
      const f=await hostFixture(),original=f.client.call.bind(f.client),target=path.join(path.dirname(f.source),"fixture.avb");
      vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetBinInfo"?Promise.resolve([{is_open:present}]):original(method,body));
      const plan=await f.adapter.preview({action,bin:"fixture.avb"}),result=await f.adapter.apply(plan.token);
      expect(result).toMatchObject({applicationCompleted:true,postStateRead:true,binStateVerified:present===(action==="open_bin"),persistenceVerified:false});
    }
  });
  it("accepts editorial clip names without relaxing filesystem bin-name rules",()=>{
    const action={action:"rename_clip",bin:"fixture.avb",mobId:"clip",expectedName:"Original"};
    for(const name of ["Scene 01 / A.B", "Arrival (take 2)"]){expect(nativeActionSchema.parse({...action,name})).toMatchObject({name});}
    for(const name of ["Café", "葡萄园：到达", "   ","bad\nname","bad\u0000name","bad\u0085name","a".repeat(121)])expect(nativeActionSchema.safeParse({...action,name}).success).toBe(false);
    expect(nativeActionSchema.safeParse({action:"create_bin",name:"../Café"}).success).toBe(false);
  });
  it("refuses rename application without edit authority before further native calls",async()=>{
    const f=await hostFixture("inspect"),original=f.client.call.bind(f.client);
    vi.spyOn(f.client,"call").mockImplementation((method,body)=>method==="GetMobInfo"?Promise.resolve([{column_name:"Name",column_value:"Original"}]):original(method,body));
    const plan=await f.adapter.preview({action:"rename_clip",bin:"fixture.avb",mobId:"clip",expectedName:"Original",name:"Reviewed"});
    f.calls.length=0;await expect(f.adapter.apply(plan.token)).rejects.toThrow();expect(f.calls).toEqual([]);await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");
  });
  it("does not verify rejected or unapplied renames and never replays their tokens",async()=>{
    for(const failure of ["reported","unchanged"]){
      const f=await hostFixture(),original=f.client.call.bind(f.client);let current="Original",writes=0;
      vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
        if(method==="GetMobInfo")return [{column_name:"Name",column_value:current}];
        if(method==="SetMobInfo"){writes++;if(failure==="reported"){current="Reviewed";return [{mob_failure:[{mob_id:"clip",failed_columns:[{column_name:"Name",column_value:"Reviewed"}]}]}];}return [];}
        return original(method,body);
      });
      const plan=await f.adapter.preview({action:"rename_clip",bin:"fixture.avb",mobId:"clip",expectedName:"Original",name:"Reviewed"}),result=await f.adapter.apply(plan.token);
      expect(result).toMatchObject({applicationCompleted:true,renameVerified:false,persistenceVerified:false,postStateRead:true,verificationError:"Native rename was not verified; inspect clip before another attempt"});
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
      vi.spyOn(f.client,"call").mockImplementation((method,body)=>{
        if(method==="LoadMobsIntoViewer"){expect(body).toEqual({mob_ids:["clip"],view_type:"Source"});return Promise.resolve([]);}
        return method==="GetViewerMobs"?Promise.resolve([{mobs:[{mob_id:"clip",view_type:viewer,current_frame:0,current_timecode:"00:00:00:00"}]}]):original(method,body);
      });
      const preview=await f.adapter.preview({action:"show_clip",bin:"fixture.avb",mobId:"clip"}),result=await f.adapter.apply(preview.token);
      expect(result).toMatchObject({applicationCompleted:true,viewerVerified:viewer==="Source",postStateRead:true,persistenceVerified:false});
      await expect(f.adapter.apply(preview.token)).rejects.toThrow("consumed");
    }
  });
  it("refuses unqualified viewer modes and position arguments",()=>{
    for(const extra of [{viewer:"Record"},{viewer:"Popup"},{viewer:"Center"},{frame:60}])expect(nativeActionSchema.safeParse({action:"show_clip",bin:"fixture.avb",mobId:"clip",...extra}).success).toBe(false);
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
    await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toMatchObject({code:"NATIVE_TRACK_DATA_UNAVAILABLE"});
    payload=[{track_info_list:null}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow();
    const track={label:{type:"TRACKTYPE_PICTURE",number:1},num_segments:2};payload=[{track_info_list:{track_info:[track,track]}}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow("duplicate");
    payload=[{track_info_list:{track_info:[{...track,num_segments:-1}]}}];await expect(f.adapter.read("tracks","fixture.avb","clip")).rejects.toThrow();
    payload=[{track_info_list:{track_info:[]}}];expect(await f.adapter.read("tracks","fixture.avb","clip")).toEqual(payload);
  });
  it("exports AAF references once and retains the lock if structural verification fails",async()=>{
    const {adapter,calls,source}=await hostFixture();const action={action:"export_aaf_master" as const,bin:"fixture.avb",mobId:"clip",preset:"Fixture",sourceFile:source,expectedSourceSha256:await sha256File(source)};
    vi.mocked(verifyNativeAafMaster).mockImplementation(async()=>{await expect(withNativeLock(async()=>1)).rejects.toThrow();return {masterContractVerified:true} as any;});
    const plan=await adapter.preview(action);
    expect(await adapter.apply(plan.token)).toMatchObject({outputVerified:true,sourceFidelityVerified:false});await expect(adapter.apply(plan.token)).rejects.toThrow("consumed");
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

it("reads bounded native selections including empty and multiple members",async()=>{
 const f=await hostFixture("inspect"),original=f.client.call.bind(f.client);let selected:any[]=[];
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>method==="GetListOfBinItems"?(body?.only_selected_flag?selected:[{mob_id:"clip"},{mob_id:"second"}]):original(method,body));
 expect(await f.adapter.read("selected_clips","fixture.avb")).toMatchObject({clips:[]});
 selected=[{mob_id:"clip",mob_selected:true,private:"SECRET"},{mob_id:"second",mob_selected:true}];
 const result=await f.adapter.read("selected_clips","fixture.avb");expect(result.clips).toHaveLength(2);expect(JSON.stringify(result)).not.toContain("SECRET");
 for(selected of [[{mob_id:"other",mob_selected:true}],[{mob_id:"clip",mob_selected:false}],[{mob_id:"clip"}],[{mob_id:"clip",mob_selected:true},{mob_id:"clip",mob_selected:true}],Array(4097).fill({mob_id:"clip",mob_selected:true})])await expect(f.adapter.read("selected_clips","fixture.avb")).rejects.toThrow();
});
it("refuses selection when bin membership changes across reads",async()=>{
 const f=await hostFixture("inspect"),original=f.client.call.bind(f.client);let reads=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>method==="GetListOfBinItems"?(body?.only_selected_flag?[{mob_id:"clip",mob_selected:true}]:(++reads===1?[{mob_id:"clip"}]:[])):original(method,body));
 await expect(f.adapter.read("selected_clips","fixture.avb")).rejects.toThrow("changed");
});

it.each([false,true])("guards replacement selection and reports postcondition mismatch (%s)",async(mismatch)=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);let selected=["clip"],writes=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems")return body?.only_selected_flag?selected.map(mob_id=>({mob_id,mob_selected:true})):[{mob_id:"clip"},{mob_id:"second"}];
  if(method==="SelectMobsInBin"){writes++;expect(body?.add_to_selection).toBe(false);if(!mismatch)selected=body!.mob_ids as string[];return [{selected_mob_ids:body!.mob_ids}];}
  return original(method,body);
 });
 const action={action:"select_clips" as const,bin:"fixture.avb",mobIds:["second"],expectedSelectedMobIds:["clip"]};
 const stale=await f.adapter.preview(action);selected=[];await expect(f.adapter.apply(stale.token)).rejects.toThrow("selection");expect(writes).toBe(0);selected=["clip"];
 const plan=await f.adapter.preview(action),result=await f.adapter.apply(plan.token);expect(result).toMatchObject({applicationCompleted:true,selectionVerified:!mismatch});expect(writes).toBe(1);
 await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");
 await expect(f.adapter.preview({...action,mobIds:["outside"]})).rejects.toThrow("not in bin");
 expect(nativeActionSchema.safeParse({...action,mobIds:["clip","clip"]}).success).toBe(false);
 expect(nativeActionSchema.safeParse({...action,mobIds:[]}).success).toBe(true);
});

it.each([false,true])("verifies clear-selection completion against a fresh read (mismatch=%s)",async(mismatch)=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);let selected=["clip"];
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems")return body?.only_selected_flag?selected.map(mob_id=>({mob_id,mob_selected:true})):[{mob_id:"clip"}];
  if(method==="SelectMobsInBin"){expect(body?.mob_ids).toEqual([]);if(!mismatch)selected=[];return [];}
  return original(method,body);
 });
 const plan=await f.adapter.preview({action:"select_clips",bin:"fixture.avb",mobIds:[],expectedSelectedMobIds:["clip"]});
 expect(await f.adapter.apply(plan.token)).toMatchObject({applicationCompleted:true,selectionVerified:!mismatch});
});

it("does not replay uncertain selection writes even when the host applied the change",async()=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);let selected=["clip"],writes=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems")return body?.only_selected_flag?selected.map(mob_id=>({mob_id,mob_selected:true})):[{mob_id:"clip"}];
  if(method==="SelectMobsInBin"){writes++;selected=[];throw new Error("Response lost after dispatch");}
  return original(method,body);
 });
 const operation={action:"select_clips" as const,bin:"fixture.avb",mobIds:[],expectedSelectedMobIds:["clip"]};
 const plan=await f.adapter.preview(operation);
 await expect(f.adapter.apply(plan.token)).rejects.toThrow("Response lost");
 await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");expect(writes).toBe(1);
 expect(await f.adapter.read("selected_clips","fixture.avb")).toMatchObject({clips:[]});
 await expect(f.adapter.preview(operation)).rejects.toThrow("expected selection");expect(writes).toBe(1);
});
it("requires edit authority before preparing a selection mutation",async()=>{
 const f=await hostFixture("inspect");
 await expect(f.adapter.preview({action:"select_clips",bin:"fixture.avb",mobIds:[],expectedSelectedMobIds:[]})).rejects.toThrow();
 expect(f.calls.some(call=>call.method==="SelectMobsInBin")).toBe(false);
});
it("rejects a selection post-read whose project changed",async()=>{
 const f=await hostFixture("inspect"),original=f.client.call.bind(f.client);let projects=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetOpenProjectInfo"&&++projects===2)return [{path:os.tmpdir()}];
  if(method==="GetListOfBinItems")return body?.only_selected_flag?[{mob_id:"clip",mob_selected:true}]:[{mob_id:"clip"}];
  return original(method,body);
 });
 await expect(f.adapter.read("selected_clips","fixture.avb")).rejects.toThrow();
});

it.each([false,true])("copies into an empty bin and verifies new identity (mismatch=%s)",async(mismatch)=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);await writeFile(path.join(path.dirname(f.source),"target.avb"),"empty");let target:any[]=[],writes=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems"&&body?.bin_relative_path==="target.avb")return target;
  if(method==="CopyBinItems"){writes++;target=[{mob_id:mismatch?"unexpected":"new-copy"}];return [{mob_id:["new-copy"]}];}
  return original(method,body);
 });
 const action={action:"copy_clip" as const,bin:"fixture.avb",mobId:"clip",destinationBin:"target.avb"};
 await expect(f.adapter.preview({...action,destinationBin:"fixture.avb"})).rejects.toThrow("differ");
 const stale=await f.adapter.preview(action);target=[{mob_id:"user-addition"}];await expect(f.adapter.apply(stale.token)).rejects.toThrow("empty");expect(writes).toBe(0);target=[];
 const plan=await f.adapter.preview(action);expect(await f.adapter.apply(plan.token)).toMatchObject({applicationCompleted:true,copyIdentityVerified:!mismatch,persistenceVerified:false,sourceFidelityVerified:false});
 await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");expect(writes).toBe(1);
});

it("does not replay a copy when its response is lost after destination population",async()=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);await writeFile(path.join(path.dirname(f.source),"target.avb"),"empty");let target:any[]=[],writes=0;
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems"&&body?.bin_relative_path==="target.avb")return target;
  if(method==="CopyBinItems"){writes++;target=[{mob_id:"created-before-timeout"}];throw new Error("Copy response lost");}
  return original(method,body);
 });
 const action={action:"copy_clip" as const,bin:"fixture.avb",mobId:"clip",destinationBin:"target.avb"},plan=await f.adapter.preview(action);
 await expect(f.adapter.apply(plan.token)).rejects.toThrow("response lost");await expect(f.adapter.apply(plan.token)).rejects.toThrow("consumed");
 expect(await f.adapter.read("clips","target.avb")).toEqual(target);await expect(f.adapter.preview(action)).rejects.toThrow("empty");expect(writes).toBe(1);
});

it("accepts a master copy retaining its source MOB identity in a different empty bin",async()=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);await writeFile(path.join(path.dirname(f.source),"target.avb"),"empty");let target:any[]=[];
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems"&&body?.bin_relative_path==="target.avb")return target;
  if(method==="CopyBinItems"){target=[{mob_id:"clip"}];return [{mob_id:["clip"]}];}
  return original(method,body);
 });
 const plan=await f.adapter.preview({action:"copy_clip",bin:"fixture.avb",mobId:"clip",destinationBin:"target.avb"});
 expect(await f.adapter.apply(plan.token)).toMatchObject({copyIdentityVerified:true,persistenceVerified:false,sourceFidelityVerified:false});
});

it.each(["ok","partial","duplicate","extra"])("verifies batch copy identity sets without order assumptions (%s)",async(mode)=>{
 const f=await hostFixture(),original=f.client.call.bind(f.client);await writeFile(path.join(path.dirname(f.source),"target.avb"),"empty");let target:any[]=[];
 vi.spyOn(f.client,"call").mockImplementation(async(method,body)=>{
  if(method==="GetListOfBinItems")return body?.bin_relative_path==="target.avb"?target:[{mob_id:"clip"},{mob_id:"sequence"}];
  if(method==="CopyBinItems"){
   expect(body?.mob_id).toEqual(["clip","sequence"]);const ids=mode==="partial"?["clip"]:mode==="duplicate"?["clip","clip"]:["clip","new-sequence"];
   target=[...ids].reverse().map(mob_id=>({mob_id}));if(mode==="extra")target.push({mob_id:"concurrent-addition"});return [{mob_id:ids}];
  }
  return original(method,body);
 });
 const action={action:"copy_clips" as const,bin:"fixture.avb",mobIds:["clip","sequence"],destinationBin:"target.avb"};
 await expect(f.adapter.preview({...action,mobIds:["outside"]})).rejects.toThrow("not in source");
 expect(nativeActionSchema.safeParse({...action,mobIds:[]}).success).toBe(false);expect(nativeActionSchema.safeParse({...action,mobIds:["clip","clip"]}).success).toBe(false);
 const plan=await f.adapter.preview(action);expect(await f.adapter.apply(plan.token)).toMatchObject({copyIdentityVerified:mode==="ok",sourceFidelityVerified:false,persistenceVerified:false});
});
