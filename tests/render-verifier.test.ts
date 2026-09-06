import {mkdtemp,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {verifyNativeRender,matchesRenderContract,renderContract} from "../src/native/render-verifier.js";
import {loadConfig} from "../src/config.js";
const mock=vi.hoisted(()=>({calls:0,probe:{} as any,decode:0,frames:120,probeTimeoutAfter:Infinity}));
vi.mock("../src/process.js",()=>({runProcess:async(executable:string,_args:string[],options:{timeoutMs:number})=>{mock.calls++;if(executable==="ffprobe"&&mock.calls>mock.probeTimeoutAfter){await new Promise(resolve=>setTimeout(resolve,options.timeoutMs+2));throw Object.assign(new Error("Probe timed out"),{code:"PROCESS_TIMEOUT"});}return {exitCode:executable==="ffprobe"?0:mock.decode,stdout:executable==="ffprobe"?JSON.stringify(mock.probe):`frame=${mock.frames}\nprogress=end\n`,stderr:""};}}));
const expected={videoCodec:"h264",width:1920,height:1080,frames:120,rate:{num:30,den:1},audio:[{codec:"pcm_s24le",channels:1,sampleRate:48000}]};
beforeEach(()=>{mock.calls=0;mock.decode=0;mock.frames=120;mock.probeTimeoutAfter=Infinity;mock.probe={streams:[{codec_type:"video",codec_name:"h264",width:1920,height:1080,nb_frames:"120",avg_frame_rate:"30/1",duration:"4"},{codec_type:"audio",codec_name:"pcm_s24le",channels:1,sample_rate:"48000",duration:"4"}]};});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-render-")),file=path.join(root,"render.mp4");return {file,config:loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root})};}
it("waits for delayed output then validates contract and decoding",async()=>{const {file,config}=await fixture();const writer=new Promise<void>(resolve=>setTimeout(()=>{void writeFile(file,"render").then(()=>resolve());},10));const result=await verifyNativeRender(file,config,expected,{timeoutMs:1000,pollMs:5});await writer;expect(result).toMatchObject({decodePassed:true,contractMatched:true,exportRetried:false});expect(mock.calls).toBe(2);});
it("does not equate a stable file with correct channel count or duration",()=>{expect(matchesRenderContract(mock.probe,expected)).toBe(true);mock.probe.streams[1].channels=2;expect(matchesRenderContract(mock.probe,expected)).toBe(false);mock.probe.streams[1].channels=1;delete mock.probe.streams[0].duration;expect(matchesRenderContract(mock.probe,expected)).toBe(false);});
it("leaves missing output unproven without invoking an export",async()=>{const {file,config}=await fixture();await expect(verifyNativeRender(file,config,expected,{timeoutMs:20,pollMs:2})).rejects.toThrow("no export was retried");expect(mock.calls).toBe(0);});
it("rejects owner changes and files outside the output root",async()=>{const {file,config}=await fixture();await writeFile(file,"render");await expect(verifyNativeRender(file,config,expected,{assertOwner:async()=>{throw new Error("Owner changed");}})).rejects.toThrow("Owner changed");const outside=await fixture();await writeFile(outside.file,"outside");await expect(verifyNativeRender(outside.file,config,expected)).rejects.toThrow();expect(mock.calls).toBe(0);});
it("does not accept a file that fails full decoding",async()=>{const {file,config}=await fixture();await writeFile(file,"render");mock.decode=1;await expect(verifyNativeRender(file,config,expected,{timeoutMs:30,pollMs:2})).rejects.toThrow("unproven");});
it("requires actual decoded frame count, even when metadata and exit status look complete",async()=>{const {file,config}=await fixture();await writeFile(file,"render");mock.frames=119;await expect(verifyNativeRender(file,config,expected,{timeoutMs:30,pollMs:2})).rejects.toThrow("unproven");});

it("matches requested color tags exactly and refuses missing or mismatched declarations",()=>{
 const color={range:"pc" as const,space:"bt709",transfer:"bt709",primaries:"bt709"};
 const video=mock.probe.streams[0];Object.assign(video,{color_range:"pc",color_space:"bt709",color_transfer:"bt709",color_primaries:"bt709"});
 expect(matchesRenderContract(mock.probe,{...expected,color})).toBe(true);
 for(const field of ["color_range","color_space","color_transfer","color_primaries"]){
   const previous=video[field];delete video[field];expect(matchesRenderContract(mock.probe,{...expected,color})).toBe(false);
   video[field]="unknown";expect(matchesRenderContract(mock.probe,{...expected,color})).toBe(false);video[field]=previous;
 }
 delete video.color_space;expect(matchesRenderContract(mock.probe,{...expected,color:{range:"pc"}})).toBe(true);
 video.color_range="tv";expect(matchesRenderContract(mock.probe,{...expected,color:{range:"pc"}})).toBe(false);
 expect(matchesRenderContract(mock.probe,expected)).toBe(true);
});
it("validates color-contract fields without making color checks mandatory for legacy callers",()=>{
 expect(renderContract.parse(expected).color).toBeUndefined();
 expect(renderContract.parse({...expected,color:{range:"tv",transfer:"arib-std-b67"}}).color?.transfer).toBe("arib-std-b67");
 for(const color of [{},{range:"full"},{range:"pc",space:""},{range:"pc",space:"x".repeat(65)},{range:"pc",gamma:2.2}])expect(()=>renderContract.parse({...expected,color})).toThrow();
});
it("reports requested color verification only after matching tags and complete decode",async()=>{
 const {file,config}=await fixture();await writeFile(file,"render");mock.probe.streams[0].color_range="pc";
 const result=await verifyNativeRender(file,config,{...expected,color:{range:"pc"}},{timeoutMs:1000,pollMs:2});
 expect(result.colorTagsChecked).toBe(true);expect(result.sourceFidelity).toContain("not pixel color conformance");
 await expect(verifyNativeRender(file,config,{...expected,color:{range:"tv"}},{timeoutMs:30,pollMs:2})).rejects.toThrow("does not match");
});
it("preserves the observed mismatch when the final probe exhausts the observation deadline",async()=>{
 const {file,config}=await fixture();await writeFile(file,"render");mock.probe.streams[0].color_range="tv";mock.probeTimeoutAfter=1;
 await expect(verifyNativeRender(file,config,{...expected,color:{range:"pc"}},{timeoutMs:100,pollMs:2})).rejects.toMatchObject({message:expect.stringContaining("does not match"),cause:{code:"PROCESS_TIMEOUT"}});
});
it("checks requested stream starts without accepting missing or coerced zero values",()=>{
 const contract={...expected,videoStartTime:0,audio:[{...expected.audio[0]!,startTime:0}]};
 for(const stream of mock.probe.streams)stream.start_time="0.000000";
 expect(matchesRenderContract(mock.probe,contract)).toBe(true);
 for(const stream of mock.probe.streams){
  for(const value of [undefined,null,"", " ",false,"N/A","Infinity",0.25,-0.25]){
   stream.start_time=value;expect(matchesRenderContract(mock.probe,contract)).toBe(false);
  }
  stream.start_time="0.000000";
 }
 mock.probe.streams[1].start_time="0.250000";
 expect(matchesRenderContract(mock.probe,{...contract,audio:[{...contract.audio[0]!,startTime:0.25}]})).toBe(true);
 expect(matchesRenderContract(mock.probe,expected)).toBe(true);
});
it("bounds requested timestamps and permits negative presentation starts",()=>{
 expect(renderContract.parse({...expected,videoStartTime:-0.25}).videoStartTime).toBe(-0.25);
 for(const start of [Infinity,NaN,86401,-86401,"0",null]){
  expect(()=>renderContract.parse({...expected,videoStartTime:start})).toThrow();
  expect(()=>renderContract.parse({...expected,audio:[{...expected.audio[0]!,startTime:start}]})).toThrow();
 }
});
