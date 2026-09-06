import {mkdir,writeFile,stat,opendir,open,link,unlink} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {readBoundedJson} from "../security/bounded-read.js";

export const sourceClockOptions=z.object({file:z.string().min(1),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),videoStream:z.number().int().min(0).max(127),audioStream:z.number().int().min(0).max(127)}).strict();
const CLOCK="aresample=48000:async=1:first_pts=0";
const MAX_MEDIA_BYTES=4*1024**3;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const attemptSchema=z.object({source:z.string().min(1).max(32768),sourceSha256:digest,videoStream:sourceClockOptions.shape.videoStream,audioStream:sourceClockOptions.shape.audioStream,output:z.string().min(1).max(32768),recipe:z.literal(CLOCK),startedAt:z.string().datetime()}).strict();
const receiptStatusSchema=attemptSchema.omit({startedAt:true}).extend({outputSha256:digest,verified:z.literal(true),sourceUnchanged:z.literal(true),hostImportVerified:z.literal(false)}).strip();
/** Exclusive complete-file publication; no replacement or power-loss durability claim. */
export async function publishPreparationReceipt(directory:string,receipt:unknown){
  const temporary=path.join(directory,`.receipt-${randomUUID()}.tmp`);
  const handle=await open(temporary,"wx",0o600);
  try{
    try{await handle.writeFile(JSON.stringify(receipt,null,2));}finally{await handle.close();}
    await link(temporary,path.join(directory,"receipt.json"));
  }finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}
type Stream=Record<string,unknown>;
const number=(value:unknown)=>typeof value==="number"||typeof value==="string"&&value.trim()!==""?Number(value):NaN;
export function sourceClockStreams(streams:Stream[],videoIndex:number,audioIndex:number){
  const video=streams.find(s=>s.index===videoIndex&&s.codec_type==="video"),audio=streams.find(s=>s.index===audioIndex&&s.codec_type==="audio");
  if(!video||!audio||video.codec_name!=="h264"||audio.channels!==2)throw new Error("Select one H.264 video stream and one stereo audio stream by absolute stream index");
  for(const stream of [video,audio]){
    const duration=number(stream.duration),start=number(stream.start_time);
    if(!Number.isFinite(duration)||duration<=0||duration>600||!Number.isFinite(start)||start<0||start+duration>600)throw new Error("Selected streams require known nonnegative timestamps and at most 600 seconds of coverage");
  }
  if([video.nb_frames,video.width,video.height].some(value=>!Number.isSafeInteger(number(value))||number(value)<=0))throw new Error("Video requires known integer geometry and frame count");
  if(number(video.nb_frames)>100000)throw new Error("Video exceeds 100000-frame verification limit");
  return {video,audio};
}
export function contiguousPcmPackets(packets:{pts_time?:unknown;duration_time?:unknown}[]){
  if(!packets.length||packets.length>100000)throw new Error("Unsupported PCM packet count");
  let end=0,maxGap=0;
  for(const packet of packets){const pts=number(packet.pts_time),duration=number(packet.duration_time);if(!Number.isFinite(pts)||!Number.isFinite(duration)||duration<=0)throw new Error("Invalid PCM packet timestamp");maxGap=Math.max(maxGap,Math.abs(pts-end));end=pts+duration;}
  if(maxGap>=1/48000)throw new Error("PCM packets are not contiguous from zero");
  return {packets:packets.length,endSeconds:end,maxGapSeconds:maxGap};
}
export function verifyVideoPacketClock(source:Stream[],output:Stream[],frames:number){
  if(!source.length||source.length!==frames||source.length!==output.length||source.length>100000)throw new Error("Video packet count mismatch or unsupported count");
  let maxDifferenceSeconds=0;
  for(let index=0;index<source.length;index++){
    for(const field of ["pts_time","dts_time","duration_time"]){
      const before=number(source[index]![field]),after=number(output[index]![field]);
      if(!Number.isFinite(before)||!Number.isFinite(after)||(field==="duration_time"&&(before<=0||after<=0)))throw new Error("Unsupported video packet clock");
      const difference=Math.abs(before-after);maxDifferenceSeconds=Math.max(maxDifferenceSeconds,difference);
      // ffprobe formats time fields to six decimal places.
      if(difference>0.0000011)throw new Error(`Changed video packet clock at ${index}: ${field}`);
    }
  }
  return {packets:source.length,maxDifferenceSeconds};
}
export class SourceClockMedia {
  constructor(private config:ServerConfig){}
  async list(file:string,expectedSha256:string,after?:string,limit=20){
    requireCapability(this.config.capabilities,"inspect");digest.parse(expectedSha256);
    const uuid=z.string().uuid();if(after!==undefined)uuid.parse(after);z.number().int().min(1).max(50).parse(limit);
    const source=await resolveReadablePath(file,this.config.allowedRoots,"file");
    if((await stat(source)).size>MAX_MEDIA_BYTES||await sha256File(source)!==expectedSha256)throw new Error("Preparation source changed");
    const root=await new MediaLibrary(this.config).directory(),names:string[]=[];let scanned=0;
    for await(const entry of await opendir(root)){
      if(++scanned>10000)throw new Error("Preparation discovery limit exceeded");
      if(entry.isDirectory()&&entry.name.startsWith("source-clock-")){
        const runId=entry.name.slice(13);if(uuid.safeParse(runId).success&&(!after||runId>after))names.push(runId);
      }
    }
    const candidates=names.sort(),page=candidates.slice(0,limit),attempts=[];let unreadable=0;
    for(const runId of page){
      try{
        const directory=await resolveReadablePath(path.join(root,`source-clock-${runId}`),[root],"directory");
        const record=attemptSchema.parse(await readBoundedJson(await resolveReadablePath(path.join(directory,"attempt.json"),[directory],"file"),65536));
        if(record.source!==source||record.sourceSha256!==expectedSha256)continue;
        if(path.resolve(record.output)!==path.join(directory,"prepared.mov"))throw new Error("Preparation output path mismatch");
        attempts.push({runId,startedAt:record.startedAt,videoStream:record.videoStream,audioStream:record.audioStream});
      }catch{unreadable++;}
    }
    if(await sha256File(await resolveReadablePath(source,this.config.allowedRoots,"file"))!==expectedSha256)throw new Error("Preparation source changed during discovery");
    return {source,sourceSha256:expectedSha256,attempts,nextAfter:candidates.length>page.length?page.at(-1):null,scanned:page.length,unreadable,meaning:"Pages scan saved attempt records, including other sources. Empty pages may have continuation. Records are not completion or worker-state evidence; inspect each run with avid_source_clock_status. Unreadable records are counted without attributing them to this source."};
  }
  async status(runId:string){
    requireCapability(this.config.capabilities,"inspect");z.string().uuid().parse(runId);
    const root=await new MediaLibrary(this.config).directory();
    const directory=await resolveReadablePath(path.join(root,`source-clock-${runId}`),[root],"directory");
    const read=async(name:string,maxBytes:number)=>readBoundedJson(await resolveReadablePath(path.join(directory,name),[directory],"file"),maxBytes);
    const attempt=attemptSchema.parse(await read("attempt.json",65536));
    const source=await resolveReadablePath(attempt.source,this.config.allowedRoots,"file");
    if((await stat(source)).size>MAX_MEDIA_BYTES||await sha256File(source)!==attempt.sourceSha256)throw new Error("Preparation source changed");
    const output=path.join(directory,"prepared.mov");
    if(path.resolve(attempt.output)!==output)throw new Error("Preparation output path mismatch");
    const optional=async(name:string)=>{try{return await read(name,1024*1024);}catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")return undefined;throw error;}};
    const receiptRaw=await optional("receipt.json"),failureRaw=await optional("failure.json");
    if(receiptRaw!==undefined&&failureRaw!==undefined)throw new Error("Conflicting preparation outcome records");
    let state:"unresolved"|"failure_recorded"|"receipt_matches_files"="unresolved",outputSha256:string|null=null;
    if(failureRaw!==undefined){
      const failure=z.object({verified:z.literal(false),message:z.string().max(100000),output:z.string(),attempt:z.string()}).strict().parse(failureRaw);
      if(failure.output!==attempt.output||failure.attempt!==path.join(directory,"attempt.json"))throw new Error("Preparation failure identity mismatch");
      state="failure_recorded";
    }
    if(receiptRaw!==undefined){
      const receipt=receiptStatusSchema.parse(receiptRaw);
      for(const key of ["source","sourceSha256","videoStream","audioStream","output","recipe"] as const)if(receipt[key]!==attempt[key])throw new Error("Preparation receipt identity mismatch");
      const checked=await resolveReadablePath(output,[directory],"file");
      if((await stat(checked)).size>MAX_MEDIA_BYTES||await sha256File(checked)!==receipt.outputSha256)throw new Error("Prepared output changed");
      outputSha256=receipt.outputSha256;state="receipt_matches_files";
    }
    return {runId,state,source,sourceSha256:attempt.sourceSha256,videoStream:attempt.videoStream,audioStream:attempt.audioStream,startedAt:attempt.startedAt,output,outputSha256,workerState:"unknown",meaning:"Saved record inspection with current source/output checksum checks; not a new essence verification or authenticated receipt. No worker termination, retry, cleanup or Avid import is inferred."};
  }
  async prepare(input:z.infer<typeof sourceClockOptions>){
    requireCapability(this.config.capabilities,"export");
    const options=sourceClockOptions.parse(input),source=await resolveReadablePath(options.file,this.config.allowedRoots,"file");
    if(![".mp4",".mov"].includes(path.extname(source).toLowerCase()))throw new Error("Expected a local MP4 or MOV source");
    if((await stat(source)).size>MAX_MEDIA_BYTES)throw new Error("Source exceeds 4 GiB preparation limit");
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
      // FFmpeg's muxer limit can overshoot slightly and exit successfully with
      // truncated media. Size and complete essence checks below remain required.
      await run(ffmpeg,["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-i",source,"-map",`0:${options.videoStream}`,"-map",`0:${options.audioStream}`,"-c:v","copy","-af",CLOCK,"-c:a","pcm_s24le","-fs",String(MAX_MEDIA_BYTES),output]);
      await resolveReadablePath(output,[directory],"file");
      if((await stat(output)).size>MAX_MEDIA_BYTES)throw new Error("Prepared media exceeds 4 GiB limit");
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
      const videoPackets=async(file:string,stream:string)=>JSON.parse(await run(this.config.ffprobeExecutable,["-v","error","-protocol_whitelist","file,pipe","-select_streams",stream,"-show_packets","-show_entries","packet=pts_time,dts_time,duration_time","-of","json",file])).packets as Stream[];
      const videoClock=verifyVideoPacketClock(await videoPackets(source,String(options.videoStream)),await videoPackets(output,"v:0"),number(selected.video.nb_frames));
      const pcmHash=await hash(source,`0:${options.audioStream}`,"pcm_s24le",CLOCK);
      if(await hash(output,"0:a:0","pcm_s24le")!==pcmHash)throw new Error("Source-clock PCM mismatch");
      const packets=JSON.parse(await run(this.config.ffprobeExecutable,["-v","error","-protocol_whitelist","file,pipe","-select_streams","a:0","-show_packets","-show_entries","packet=pts_time,duration_time","-of","json",output]));
      const continuity=contiguousPcmPackets(packets.packets);
      if(await sha256File(await resolveReadablePath(source,this.config.allowedRoots,"file"))!==options.expectedSha256)throw new Error("Source changed during preparation");
      if(await sha256File(await resolveReadablePath(output,[directory],"file"))!==outputBefore)throw new Error("Output changed during verification");
      const receipt={source,sourceSha256:options.expectedSha256,output,outputSha256:outputBefore,videoStream:options.videoStream,audioStream:options.audioStream,original,prepared,recipe:CLOCK,videoEssenceSha256:videoHash,videoClock,sourceClockPcmSha256:pcmHash,continuity,sourceUnchanged:true,verified:true,hostImportVerified:false,limitations:["Only selected streams are included","Presentation-clock normalization may insert or remove audio samples","No Avid import, relink, color or perceptual sync qualification"]};
      await publishPreparationReceipt(directory,receipt);return receipt;
    }catch(error){await writeFile(path.join(directory,"failure.json"),JSON.stringify({verified:false,message:error instanceof Error?error.message:String(error),output,attempt}),{flag:"wx"});throw error;}
  }
}
