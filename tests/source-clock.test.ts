import {it,expect,vi} from "vitest";
import {mkdtemp,writeFile,readFile,readdir,realpath,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {SourceClockMedia,sourceClockStreams,contiguousPcmPackets,verifyVideoPacketClock} from "../src/library/source-clock.js";
import {loadConfig} from "../src/config.js";
import {sha256File} from "../src/analysis/file-inventory.js";
const mock=vi.hoisted(()=>({run:vi.fn()}));
vi.mock("../src/process.js",()=>({runProcess:(...args:unknown[])=>mock.run(...args)}));
const video={index:2,codec_type:"video",codec_name:"h264",width:1280,height:720,nb_frames:"60",avg_frame_rate:"30/1",start_time:"0.000000",duration:"2"};
const audio={index:3,codec_type:"audio",codec_name:"aac",channels:2,start_time:"0.000000",duration:"2"};
it("requires explicitly selected supported streams with bounded known timestamps",()=>{
 expect(sourceClockStreams([audio,video],2,3)).toEqual({video,audio});
 for(const change of [{duration:"N/A"},{duration:601},{start_time:-1},{start_time:null},{start_time:true},{nb_frames:"N/A"},{codec_name:"hevc"}])expect(()=>sourceClockStreams([{...video,...change},audio],2,3)).toThrow();
 expect(()=>sourceClockStreams([video,{...audio,channels:1}],2,3)).toThrow();
 expect(()=>sourceClockStreams([video,audio],0,3)).toThrow();
 for(const field of ["width","height","nb_frames"])for(const value of [undefined,null,"N/A",Infinity,NaN,0,-1,0.5,Number.MAX_SAFE_INTEGER+1])expect(()=>sourceClockStreams([{...video,[field]:value},audio],2,3)).toThrow();
 expect(()=>sourceClockStreams([{...video,nb_frames:100001},audio],2,3)).toThrow("verification limit");
});
it("detects absent timestamps, nonzero origins, gaps and overlaps in normalized PCM",()=>{
 expect(contiguousPcmPackets([{pts_time:"0",duration_time:"0.1"},{pts_time:"0.1",duration_time:"0.1"}])).toMatchObject({packets:2,endSeconds:0.2,maxGapSeconds:0});
 for(const packets of [[],[{duration_time:1}],[{pts_time:null,duration_time:1}],[{pts_time:0.1,duration_time:1}],[{pts_time:0,duration_time:0}],[{pts_time:0,duration_time:1},{pts_time:0.5,duration_time:1}]])expect(()=>contiguousPcmPackets(packets)).toThrow();
});
async function fixture(mode="pass"){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-clock-"))),source=path.join(root,"source.mp4");await writeFile(source,"source");const expectedSha256=await sha256File(source);
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"});
 mock.run.mockReset();mock.run.mockImplementation(async(_exe:string,args:string[])=>{
  let stdout="";
  if(args.includes("-n")){await writeFile(args.at(-1)!,"prepared");if(mode==="source-change")await writeFile(source,"changed");}
  else if(args.includes("-show_streams")){const original=args.at(-1)===source,hasTimecode=mode.includes("timecode"),selectedVideo={...video,...(hasTimecode?{tags:{timecode:"10:00:00:00"}}:{})};stdout=JSON.stringify({streams:original?[selectedVideo,audio]:[{...selectedVideo,index:0,...(mode==="truncated"?{nb_frames:"1"}:{})},{...audio,index:1,codec_name:"pcm_s24le",sample_rate:"48000"},...(hasTimecode?[{index:2,codec_type:"data",codec_tag_string:"tmcd",tags:{timecode:mode==="bad-timecode"?"11:00:00:00":"10:00:00:00"}}]:[])]});}
  else if(args.includes("-show_packets"))stdout=JSON.stringify({packets:args.includes("a:0")?[{pts_time:0,duration_time:2}]:Array.from({length:60},(_,i)=>({pts_time:i/30+(mode==="clock-change"&&args.includes("v:0")&&i===20?0.01:0),dts_time:(i-2)/30,duration_time:1/30}))});
  else if(args.includes("hash")){const pcm=args.includes("pcm_s24le");stdout="SHA256="+(pcm?"b":mode==="video-mismatch"&&args.includes("0:v:0")?"c":"a").repeat(64);}
  return {exitCode:0,stdout,stderr:""};
 });
 return {root,source,config,options:{file:source,expectedSha256,videoStream:2,audioStream:3}};
}
it("writes a new verified receipt with explicit maps and preserves the source",async()=>{
 const f=await fixture(),result=await new SourceClockMedia(f.config).prepare(f.options);
 expect(result).toMatchObject({verified:true,sourceUnchanged:true,hostImportVerified:false,sourceClockPcmSha256:"b".repeat(64)});
 expect(await sha256File(f.source)).toBe(f.options.expectedSha256);
 expect(JSON.parse(await readFile(path.join(path.dirname(result.output),"receipt.json"),"utf8"))).toEqual(result);
 const transform=mock.run.mock.calls.find(call=>call[1].includes("-n"))![1];expect(transform).toContain("0:2");expect(transform).toContain("0:3");expect(transform).toContain("file,pipe");
 expect(transform.slice(transform.indexOf("-fs"),transform.indexOf("-fs")+2)).toEqual(["-fs",String(4*1024**3)]);
});
it("rejects unauthorized or changed sources before launching media processes",async()=>{
 const f=await fixture();await expect(new SourceClockMedia({...f.config,capabilities:new Set(["inspect"])}).prepare(f.options)).rejects.toThrow();
 await expect(new SourceClockMedia(f.config).prepare({...f.options,expectedSha256:"0".repeat(64)})).rejects.toThrow("checksum changed");expect(mock.run).not.toHaveBeenCalled();
});
it("permits only the source timecode declaration on an additional tmcd stream",async()=>{
 const f=await fixture("timecode");expect((await new SourceClockMedia(f.config).prepare(f.options)).verified).toBe(true);
 const bad=await fixture("bad-timecode");await expect(new SourceClockMedia(bad.config).prepare(bad.options)).rejects.toThrow("timecode");
});
it("retains failed artifacts without a success receipt when video or source changes",async()=>{
 for(const mode of ["video-mismatch","source-change","truncated","clock-change"]){const f=await fixture(mode);await expect(new SourceClockMedia(f.config).prepare(f.options)).rejects.toThrow(mode==="clock-change"?"Changed video packet clock":mode==="video-mismatch"?"essence mismatch":mode==="truncated"?"Changed video field":"Source changed");
 const base=path.join(f.root,"avid-mcp-library"),dir=path.join(base,(await readdir(base))[0]!);expect(await readdir(dir)).toEqual(expect.arrayContaining(["attempt.json","prepared.mov","failure.json"]));expect(await readdir(dir)).not.toContain("receipt.json");}
});
it("checks every packet clock including reordered presentation times and negative decode times",()=>{
 const packets=[{pts_time:0,dts_time:-0.08,duration_time:0.04},{pts_time:0.08,dts_time:-0.04,duration_time:0.04},{pts_time:0.04,dts_time:0,duration_time:0.04}];
 expect(verifyVideoPacketClock(packets,packets,3)).toEqual({packets:3,maxDifferenceSeconds:0});
 for(const field of ["pts_time","dts_time","duration_time"]){
  expect(()=>verifyVideoPacketClock(packets,packets.map((p,i)=>i===1?{...p,[field]:0.5}:p),3)).toThrow("Changed video packet clock");
  expect(()=>verifyVideoPacketClock(packets,packets.map((p,i)=>i===1?{...p,[field]:null}:p),3)).toThrow("Unsupported");
 }
 expect(()=>verifyVideoPacketClock(packets,packets.slice(1),3)).toThrow("count");
});
it("inspects completed and unresolved attempts without invoking media processes or inferring worker state",async()=>{
 const f=await fixture(),service=new SourceClockMedia(f.config),receipt=await service.prepare(f.options),directory=path.dirname(receipt.output),runId=path.basename(directory).slice(13);
 mock.run.mockClear();
 expect(await service.status(runId)).toMatchObject({state:"receipt_matches_files",outputSha256:receipt.outputSha256,workerState:"unknown"});
 await unlink(path.join(directory,"receipt.json"));
 expect(await service.status(runId)).toMatchObject({state:"unresolved",outputSha256:null,workerState:"unknown"});
 expect(mock.run).not.toHaveBeenCalled();
});
it("rejects changed output, conflicting records and mismatched receipt identity",async()=>{
 const f=await fixture(),service=new SourceClockMedia(f.config),receipt=await service.prepare(f.options),directory=path.dirname(receipt.output),runId=path.basename(directory).slice(13),record=path.join(directory,"receipt.json");
 await writeFile(record,JSON.stringify({...receipt,audioStream:7}));await expect(service.status(runId)).rejects.toThrow("identity mismatch");
 await writeFile(record,JSON.stringify(receipt));await writeFile(path.join(directory,"failure.json"),'{}');await expect(service.status(runId)).rejects.toThrow("Conflicting");
 await unlink(path.join(directory,"failure.json"));await writeFile(receipt.output,"changed");await expect(service.status(runId)).rejects.toThrow("output changed");
});
it("reports caught failures and refuses changed or unauthorized preparation sources",async()=>{
 const f=await fixture("video-mismatch"),service=new SourceClockMedia(f.config);await expect(service.prepare(f.options)).rejects.toThrow();
 const root=path.join(f.root,"avid-mcp-library"),runId=(await readdir(root))[0]!.slice(13);
 expect(await service.status(runId)).toMatchObject({state:"failure_recorded",workerState:"unknown",outputSha256:null});
 await expect(new SourceClockMedia({...f.config,allowedRoots:[root]}).status(runId)).rejects.toThrow();
 await writeFile(f.source,"changed");await expect(service.status(runId)).rejects.toThrow("source changed");
 await expect(service.status("../outside")).rejects.toThrow();
});
