import {mkdtemp,writeFile,mkdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {it,expect} from "vitest";
import {parseTimecode,formatTimecode,assessTimecodeContinuity} from "../src/library/timecode-continuity.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";

it("parses non-drop timecode into a frame count at the nominal integer rate",()=>{
 expect(parseTimecode("01:00:00:00","30/1")).toEqual({frames:108000,dropFrame:false,nominalRate:30});
 expect(parseTimecode("00:00:01:23","24000/1001")).toEqual({frames:47,dropFrame:false,nominalRate:24});
});

it("applies drop-frame numbering only for 29.97 and 59.94 declarations",()=>{
 expect(parseTimecode("00:01:00;02","30000/1001")).toEqual({frames:1800,dropFrame:true,nominalRate:30});
 expect(parseTimecode("00:10:00;00","30000/1001")).toEqual({frames:17982,dropFrame:true,nominalRate:30});
 expect(parseTimecode("00:01:00;04","60000/1001")).toEqual({frames:3600,dropFrame:true,nominalRate:60});
 expect(parseTimecode("00:01:00;02","30/1")).toBeNull();
 expect(parseTimecode("00:01:00;02","25/1")).toBeNull();
});

it("rejects malformed fields, dropped frame numbers and unsupported rates",()=>{
 expect(parseTimecode("00:01:00;00","30000/1001")).toBeNull();
 expect(parseTimecode("00:00:00:30","30/1")).toBeNull();
 expect(parseTimecode("00:60:00:00","30/1")).toBeNull();
 expect(parseTimecode("1:00:00:00","30/1")).toBeNull();
 expect(parseTimecode("01:00:00:00","0/0")).toBeNull();
 expect(parseTimecode("01:00:00:00","121/1")).toBeNull();
});

it("formats frame counts back to the same timecode, including drop-frame skips",()=>{
 expect(formatTimecode(108000,30,false)).toBe("01:00:00:00");
 expect(formatTimecode(1800,30,true)).toBe("00:01:00;02");
 expect(formatTimecode(17982,30,true)).toBe("00:10:00;00");
 expect(formatTimecode(3600,60,true)).toBe("00:01:00;04");
 for(const frames of [0,1799,1800,17981,17982,17983,107892,2589408])expect(parseTimecode(formatTimecode(frames,30,true),"30000/1001")?.frames).toBe(frames);
});

const entry=(name:string,timecode:string|undefined,frames:number|undefined,rate="30/1",source:"format"|"stream"|"tmcd"="format")=>({
 id:createHash("sha256").update(name).digest("hex"),file:`/media/${name}`,
 metadata:{
  format:{duration:"10",...(timecode!==undefined&&source==="format"?{tags:{timecode}}:{})},
  streams:[
   {index:0,codec_type:"video",r_frame_rate:rate,...(frames===undefined?{}:{nb_frames:String(frames)}),...(timecode!==undefined&&source==="stream"?{tags:{timecode}}:{})},
   {index:1,codec_type:"audio",sample_rate:"48000"},
   ...(timecode!==undefined&&source==="tmcd"?[{index:2,codec_type:"data",codec_tag_string:"tmcd",tags:{timecode}}]:[]),
  ],
 },
});

it("orders files by declared start and classifies contiguous, gap and overlap pairs",()=>{
 const result=assessTimecodeContinuity([entry("c.mp4","01:00:12:00",60),entry("a.mp4","01:00:00:00",300),entry("b.mp4","01:00:10:00",30),entry("d.mp4","01:00:13:00",30)]);
 expect(result.files.map(file=>path.basename(file.file))).toEqual(["a.mp4","b.mp4","c.mp4","d.mp4"]);
 expect(result.files[0]).toMatchObject({status:"assessed",timecode:"01:00:00:00",source:"format",dropFrame:false,frameRate:"30/1",nominalRate:30,frameCount:300,startFrame:108000,endFrame:108300,endTimecode:"01:00:10:00",endExceedsDay:false});
 expect(result.pairs.map(pair=>[pair.relation,pair.frames,pair.seconds])).toEqual([["contiguous",0,0],["gap",30,1],["overlap",-30,-1]]);
 expect(result.summary).toEqual({files:4,assessed:4,pairs:3,contiguous:1,gaps:1,overlaps:1,incomparable:0,unassessed:0});
});

it("reports missing timecode or frame count as unassessed and excludes them from pairs",()=>{
 const result=assessTimecodeContinuity([entry("a.mp4","01:00:00:00",300),entry("none.mp4",undefined,300),entry("frames.mp4","01:00:10:00",undefined),entry("b.mp4","01:00:10:00",60)]);
 expect(result.files.map(file=>file.status)).toEqual(["assessed","assessed","missing_frame_count","missing_timecode"]);
 expect(result.pairs).toHaveLength(1);expect(result.summary).toMatchObject({assessed:2,unassessed:2});
});

it("marks pairs across different rates or drop-frame flags incomparable instead of computing frames",()=>{
 const result=assessTimecodeContinuity([entry("a.mp4","01:00:00:00",300),entry("b.mp4","01:00:10;00",60,"30000/1001"),entry("c.mp4","01:00:20:00",60,"25/1")]);
 expect(result.pairs.map(pair=>pair.relation)).toEqual(["incomparable","incomparable"]);
 expect(result.pairs[0]).toMatchObject({frames:null,seconds:null,reason:"Different nominal rate or drop-frame declaration"});
});

it("takes timecode from the first video stream, then a tmcd stream, when the container tag is absent",()=>{
 const result=assessTimecodeContinuity([entry("s.mp4","02:00:00:00",30,"30/1","stream"),entry("t.mp4","03:00:00:00",30,"30/1","tmcd")]);
 expect(result.files.map(file=>file.source)).toEqual(["stream","tmcd"]);
});

it("rejects invalid or unparseable declarations explicitly and flags ends beyond 24 hours",()=>{
 const result=assessTimecodeContinuity([entry("bad.mp4","99:99:99:99",30),entry("late.mp4","23:59:59:00",90)]);
 expect(result.files.find(file=>file.file.endsWith("bad.mp4"))).toMatchObject({status:"invalid_timecode",timecode:"99:99:99:99"});
 expect(result.files.find(file=>file.file.endsWith("late.mp4"))).toMatchObject({status:"assessed",endExceedsDay:true});
});

it("reads indexed metadata through the library and never touches media bytes",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-tc-")),directory=path.join(root,"avid-mcp-library");await mkdir(directory);
 const records=[entry("a.mp4","01:00:00:00",300),entry("b.mp4","01:00:10:00",60)];
 for(const record of records){await writeFile(path.join(root,path.basename(record.file)),"fixture");await writeFile(path.join(directory,`${record.id}.json`),JSON.stringify({...record,file:path.join(root,path.basename(record.file)),bytes:7,transcript:[]}));}
 const library=new MediaLibrary(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect"}));
 const result=await library.timecodeContinuity([records[1]!.id,records[0]!.id,records[0]!.id]);
 expect(result.summary).toMatchObject({files:2,pairs:1,contiguous:1});
 expect(result.meaning).toContain("declared");
 await expect(new MediaLibrary(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"export"})).timecodeContinuity([records[0]!.id])).rejects.toThrow("inspect");
});
