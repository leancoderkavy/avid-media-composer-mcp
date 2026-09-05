import {mkdir,writeFile,stat} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";

export const sourceClockOptions=z.object({file:z.string().min(1),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),videoStream:z.number().int().min(0).max(127),audioStream:z.number().int().min(0).max(127)}).strict();
const CLOCK="aresample=48000:async=1:first_pts=0";
type Stream=Record<string,unknown>;
const number=(value:unknown)=>typeof value==="number"||typeof value==="string"&&value.trim()!==""?Number(value):NaN;
export function sourceClockStreams(streams:Stream[],videoIndex:number,audioIndex:number){
  const video=streams.find(s=>s.index===videoIndex&&s.codec_type==="video"),audio=streams.find(s=>s.index===audioIndex&&s.codec_type==="audio");
  if(!video||!audio||video.codec_name!=="h264"||audio.channels!==2)throw new Error("Select one H.264 video stream and one stereo audio stream by absolute stream index");
  for(const stream of [video,audio]){
    const duration=number(stream.duration),start=number(stream.start_time);
    if(!Number.isFinite(duration)||duration<=0||duration>600||!Number.isFinite(start)||start<0||start+duration>600)throw new Error("Selected streams require known nonnegative timestamps and at most 600 seconds of coverage");
  }
  if(!Number.isInteger(number(video.nb_frames))||number(video.nb_frames)<=0||number(video.width)<=0||number(video.height)<=0)throw new Error("Video requires known geometry and frame count");
  return {video,audio};
}
export function contiguousPcmPackets(packets:{pts_time?:unknown;duration_time?:unknown}[]){
  if(!packets.length||packets.length>100000)throw new Error("Unsupported PCM packet count");
  let end=0,maxGap=0;
  for(const packet of packets){const pts=number(packet.pts_time),duration=number(packet.duration_time);if(!Number.isFinite(pts)||!Number.isFinite(duration)||duration<=0)throw new Error("Invalid PCM packet timestamp");maxGap=Math.max(maxGap,Math.abs(pts-end));end=pts+duration;}
  if(maxGap>=1/48000)throw new Error("PCM packets are not contiguous from zero");
  return {packets:packets.length,endSeconds:end,maxGapSeconds:maxGap};
}
export class SourceClockMedia {
  constructor(private config:ServerConfig){}
  async prepare(input:z.infer<typeof sourceClockOptions>){
    requireCapability(this.config.capabilities,"export");
    const options=sourceClockOptions.parse(input),source=await resolveReadablePath(options.file,this.config.allowedRoots,"file");
    if(![".mp4",".mov"].includes(path.extname(source).toLowerCase()))throw new Error("Expected a local MP4 or MOV source");
    if((await stat(source)).size>4*1024**3)throw new Error("Source exceeds 4 GiB preparation limit");
    if(await sha256File(source)!==options.expectedSha256)throw new Error("Source checksum changed");
    const run=async(exe:string,args:string[])=>{const result=await runProcess(exe,args,{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:8*1024*1024});if(result.exitCode!==0)throw new Error(`Source-clock preparation failed: ${result.stderr.slice(-1500)}`);return result.stdout;};
    const probe=async(file:string)=>JSON.parse(await run(this.config.ffprobeExecutable,["-v","error","-protocol_whitelist","file,pipe","-show_streams","-of","json",file])) as {streams:Stream[]};
    const original=await probe(source),selected=sourceClockStreams(original.streams,options.videoStream,options.audioStream);
    const directory=path.join(await new MediaLibrary(this.config).directory(),`source-clock-${randomUUID()}`);await mkdir(directory);
    await resolveReadablePath(directory,[this.config.outputRoot!],"directory");
    const output=path.join(directory,"prepared.mov"),attempt=path.join(directory,"attempt.json");
    await writeFile(attempt,JSON.stringify({source,sourceSha256:options.expectedSha256,videoStream:options.videoStream,audioStream:options.audioStream,output,recipe:CLOCK,startedAt:new Date().toISOString()}),{flag:"wx"});
    const ffmpeg=this.config.ffmpegExecutable??"ffmpeg";
    try{
      await run(ffmpeg,["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-i",source,"-map",`0:${options.videoStream}`,"-map",`0:${options.audioStream}`,"-c:v","copy","-af",CLOCK,"-c:a","pcm_s24le",output]);
      await resolveReadablePath(output,[directory],"file");
      if((await stat(output)).size>4*1024**3)throw new Error("Prepared media exceeds 4 GiB limit");
      const outputBefore=await sha256File(output),prepared=await probe(output);
      const extra=prepared.streams.filter(s=>s.codec_type!=="video"&&s.codec_type!=="audio");
      const timecode=(selected.video.tags as Record<string,unknown>|undefined)?.timecode;
      if(prepared.streams.filter(s=>s.codec_type==="video").length!==1||prepared.streams.filter(s=>s.codec_type==="audio").length!==1||extra.length>1||extra.some(s=>s.codec_type!=="data"||s.codec_tag_string!=="tmcd"||typeof timecode!=="string"||(s.tags as Record<string,unknown>|undefined)?.timecode!==timecode))throw new Error("Unexpected output streams or timecode");
      const video=prepared.streams.find(s=>s.codec_type==="video"),audio=prepared.streams.find(s=>s.codec_type==="audio");
      if(!video||!audio||audio.codec_name!=="pcm_s24le"||audio.channels!==2||audio.sample_rate!=="48000"||number(audio.start_time)!==0)throw new Error("Output PCM contract mismatch");
      for(const field of ["codec_name","width","height","nb_frames","avg_frame_rate","start_time","color_range","color_space","color_primaries","color_transfer"])
        if(video[field]!==selected.video[field])throw new Error(`Changed video field: ${field}`);
      const hash=async(file:string,map:string,codec:string,filter?:string)=>{
        const result=(await run(ffmpeg,["-nostdin","-v","error","-protocol_whitelist","file,pipe","-i",file,"-map",map,...(filter?["-af",filter]:[]),"-c",codec,"-f","hash","-hash","sha256","pipe:1"])).trim();
        if(!/^SHA256=[a-f0-9]{64}$/.test(result))throw new Error("Invalid essence checksum");return result.slice(7);
      };
      const videoHash=await hash(source,`0:${options.videoStream}`,"copy");
      if(await hash(output,"0:v:0","copy")!==videoHash)throw new Error("Copied video essence mismatch");
      const pcmHash=await hash(source,`0:${options.audioStream}`,"pcm_s24le",CLOCK);
      if(await hash(output,"0:a:0","pcm_s24le")!==pcmHash)throw new Error("Source-clock PCM mismatch");
      const packets=JSON.parse(await run(this.config.ffprobeExecutable,["-v","error","-protocol_whitelist","file,pipe","-select_streams","a:0","-show_packets","-show_entries","packet=pts_time,duration_time","-of","json",output]));
      const continuity=contiguousPcmPackets(packets.packets);
      if(await sha256File(await resolveReadablePath(source,this.config.allowedRoots,"file"))!==options.expectedSha256)throw new Error("Source changed during preparation");
      if(await sha256File(await resolveReadablePath(output,[directory],"file"))!==outputBefore)throw new Error("Output changed during verification");
      const receipt={source,sourceSha256:options.expectedSha256,output,outputSha256:outputBefore,videoStream:options.videoStream,audioStream:options.audioStream,original,prepared,recipe:CLOCK,videoEssenceSha256:videoHash,sourceClockPcmSha256:pcmHash,continuity,sourceUnchanged:true,verified:true,hostImportVerified:false,limitations:["Only selected streams are included","Presentation-clock normalization may insert or remove audio samples","No Avid import, relink, color or perceptual sync qualification"]};
      await writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});return receipt;
    }catch(error){await writeFile(path.join(directory,"failure.json"),JSON.stringify({verified:false,message:error instanceof Error?error.message:String(error),output,attempt}),{flag:"wx"});throw error;}
  }
}
