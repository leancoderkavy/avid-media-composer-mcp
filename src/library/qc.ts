import {writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {parseAudioTiming} from "./audio-timing.js";

export const qcOptions=z.object({
  start:z.number().nonnegative().default(0),end:z.number().positive(),
  videoStream:z.number().int().nonnegative().nullable().optional(),audioStream:z.number().int().nonnegative().nullable().optional(),
  blackSeconds:z.number().min(0.05).max(60).default(0.5),blackPixelThreshold:z.number().min(0).max(1).default(0.1),blackPictureRatio:z.number().min(0).max(1).default(0.98),
  freezeSeconds:z.number().min(0.1).max(60).default(2),freezeNoise:z.number().min(0).max(1).default(0.001),
  silenceSeconds:z.number().min(0.1).max(60).default(0.5),silenceDb:z.number().min(-100).max(0).default(-50),
}).strict().refine(value=>value.end>value.start&&value.end-value.start<=600,"QC range must be at most 600 seconds");
type Interval={start:number;end:number};
type OpenInterval={start:number;end:null;openAtProcessingEnd:true};
export function qcVideoFrames(progress:string){
  const lines=progress.trim().split(/\r?\n/);
  if(lines.at(-1)!=="progress=end")throw new Error("Video QC final progress is missing; result is incomplete");
  const previous=lines.findLastIndex(line=>line==="progress=continue");
  const frames=lines.slice(previous+1,-1).filter(line=>line.startsWith("frame="));
  const raw=frames.length===1?frames[0]!.slice(6).trim():"";
  const count=/^\d+$/.test(raw)?Number(raw):NaN;
  if(!Number.isSafeInteger(count)||count<1)throw new Error("Video QC decoded no frames or frame coverage is missing; result is incomplete");
  return count;
}
export function qcStreamDetails(stream:Record<string,unknown>|undefined){
  if(!stream)return null;
  const fields=["index","codec_type","codec_name","profile","width","height","pix_fmt","color_range","color_space","color_transfer","color_primaries","chroma_location","field_order","bits_per_raw_sample","bits_per_sample","sample_fmt","sample_rate","channels","channel_layout","time_base","r_frame_rate","avg_frame_rate","start_time","duration"];
  return Object.fromEntries(fields.map(key=>[key,typeof stream[key]==="string"||typeof stream[key]==="number"?stream[key]:null]));
}
export function selectQcStreams<T extends {index?:number;codec_type?:string;start_time?:unknown;sample_rate?:unknown}>(streams:T[],options:{videoStream?:number|null|undefined;audioStream?:number|null|undefined}){
  const select=(kind:"video"|"audio",index:number|null|undefined)=>{
    if(index===null)return undefined;
    const stream=index===undefined?streams.find(s=>s.codec_type===kind):streams.find(s=>s.index===index&&s.codec_type===kind);
    if(index!==undefined&&!stream)throw new Error(`Requested ${kind} stream index ${index} is unavailable or has the wrong type`);
    return stream;
  };
  const video=select("video",options.videoStream),audio=select("audio",options.audioStream);
  if(!video&&!audio)throw new Error("No audio or video stream selected");
  return {video,audio};
}
const numeric="(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)";
export function parseQcLog(log:string,start:number,end:number){
  const clip=(time:number)=>Math.max(start,Math.min(end,start+time));
  const black:Interval[]=[];
  for(const match of log.matchAll(new RegExp(`black_start:${numeric}\\s+black_end:${numeric}`,"g")))black.push({start:clip(Number(match[1])),end:clip(Number(match[2]))});
  let openBlack:number|undefined,blackTransitions=0;
  for(const match of log.matchAll(new RegExp(`lavfi\\.black_(start|end)=${numeric}(?=\\s|$)`,"g"))){
    if(++blackTransitions>10000)throw new Error("QC black transition limit exceeded");
    const time=Number(match[2]);if(!Number.isFinite(time)||time<0||start+time>=end)throw new Error("QC black transition is outside the analyzed range");
    openBlack=match[1]==="start"?start+time:undefined;
  }
  const blackOpenAtProcessingEnd=openBlack===undefined?null:{start:openBlack,end:null,minimumDurationVerified:false,meaning:"Black-start metadata had no closing transition before processing ended. May be shorter than blackSeconds; no media endpoint or perceptual darkness inferred."};
  const intervals=(kind:"freeze"|"silence")=>{
    const result:(Interval|OpenInterval)[]=[];let beginning:number|undefined;
    const regex=new RegExp(`${kind}_(start|end):\\s*${numeric}`,"g");
    for(const match of log.matchAll(regex)){
      if(match[1]==="start")beginning=clip(Number(match[2]));
      else if(beginning!==undefined){result.push({start:beginning,end:clip(Number(match[2]))});beginning=undefined;}
    }
    if(beginning!==undefined&&beginning<end)result.push({start:beginning,end:null,openAtProcessingEnd:true});
    if(result.length>10000)throw new Error("QC event limit exceeded");
    return result.filter(item=>item.end===null||item.end>item.start);
  };
  const vfr=[...log.matchAll(/VFR:([\d.]+)\s+\((\d+)\/(\d+)\)/g)].at(-1);
  const measurement=[...log.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)].at(-1);
  let loudness:unknown=null;
  if(measurement){
    const value=JSON.parse(measurement[0]);
    const number=(key:string)=>{const n=Number(value[key]);return Number.isFinite(n)?n:null;};
    loudness={integratedLufs:number("input_i"),truePeakDbtp:number("input_tp"),loudnessRangeLu:number("input_lra"),integratedRaw:value.input_i,truePeakRaw:value.input_tp,meaning:"Input measurements only; no normalized media written"};
  }
  if(black.length>10000)throw new Error("QC event limit exceeded");
  const sampleMatch=[...log.matchAll(/Number of samples:\s*(\d+)\s*$/gm)].at(-1);
  const sampleCount=sampleMatch?Number(sampleMatch[1]):null;
  const audioSamplesPerChannel=sampleCount!==null&&Number.isSafeInteger(sampleCount)?sampleCount:null;
  return {blackOpenAtProcessingEnd,black:black.filter(item=>item.end>item.start),freeze:intervals("freeze"),silence:intervals("silence"),frameTiming:vfr?{variableFraction:Number(vfr[1]),variableIntervals:Number(vfr[2]),constantIntervals:Number(vfr[3]),meaning:"Decoded timestamp interval variation; not a frame-drop or sync diagnosis"}:null,loudness,audioSamplesPerChannel};
}

export class MediaQc {
  constructor(private config:ServerConfig){}
  async analyze(id:string,input:z.input<typeof qcOptions>){
    requireCapability(this.config.capabilities,"export");const options=qcOptions.parse(input),library=new MediaLibrary(this.config);
    const entry=await library.validatedMetadata(id);
    const duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(duration)||options.end>duration)throw new Error("QC range exceeds media duration");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const streams=entry.metadata.streams??[],selected=selectQcStreams(streams,options);
    const {video,audio}=selected;
    const audioRate=Number(audio?.sample_rate);
    if(audio&&(!Number.isSafeInteger(audioRate)||audioRate<=0||audioRate>768000))throw new Error("Selected audio sample rate is unavailable or unsupported");
    const executable=this.config.ffmpegExecutable??"ffmpeg";
    const base=["-hide_banner","-nostdin","-nostats","-xerror","-v","info","-protocol_whitelist","file,pipe","-t",String(options.end),"-i",source];
    let log="",decodedFrames:number|null=null;
    const run=async(args:string[])=>{
      const result=await runProcess(executable,[...base,...args,"-f","null","-"],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:16*1024*1024});
      if(result.exitCode!==0)throw new Error(`QC decoding failed: ${result.stderr.slice(-1000)}`);log+=result.stderr;return result.stdout;
    };
    if(video)decodedFrames=qcVideoFrames(await run(["-progress","pipe:1","-map",`0:${video.index}`,"-an","-vf",`trim=start=${options.start}:end=${options.end},setpts=PTS-${options.start}/TB,blackdetect=d=${options.blackSeconds}:pix_th=${options.blackPixelThreshold}:pic_th=${options.blackPictureRatio},metadata=mode=print:key=lavfi.black_start,metadata=mode=print:key=lavfi.black_end,freezedetect=n=${options.freezeNoise}:d=${options.freezeSeconds},vfrdet`,"-fps_mode","passthrough"]));
    if(audio)await run(["-map",`0:${audio.index}`,"-vn","-af",`atrim=start=${options.start}:end=${options.end},asetpts=PTS-${options.start}/TB,silencedetect=n=${options.silenceDb}dB:d=${options.silenceSeconds},aformat=sample_rates=${audioRate},asettb=1/${audioRate},ashowinfo,astats=metadata=0:reset=0:measure_perchannel=none:measure_overall=Number_of_samples,loudnorm=print_format=json`]);
    if(await sha256File(source)!==id)throw new Error("Source changed during QC");
    const findings=parseQcLog(log,options.start,options.end);
    if(video&&!findings.frameTiming)throw new Error("Video QC summary missing; result is incomplete");
    if(audio&&!findings.loudness)throw new Error("Audio QC summary missing; result is incomplete");
    if(audio&&(findings.audioSamplesPerChannel===null||findings.audioSamplesPerChannel<=0))throw new Error("Audio QC decoded no samples or sample coverage is missing; result is incomplete");
    const audioTiming=audio?parseAudioTiming(log,audioRate):null;
    if(audioTiming&&audioTiming.samples!==findings.audioSamplesPerChannel)throw new Error("Audio timing and sample amount disagree");
    const optionalNumber=(value:unknown)=>value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
    const videoStart=optionalNumber(video?.start_time),audioStart=optionalNumber(audio?.start_time);
    const report={schema:1,id,range:{start:options.start,end:options.end},options,streams:{video:video?.index??null,audio:audio?.index??null},findings,
      audioTiming,audioTimingMeaning:"Adjacent frame timestamp gaps/overlaps before loudness normalization. Integer ticks use 1/sampleRate after shifting the requested range start to zero; not union coverage, clock correction or perceptual sync.",
      videoCoverage:video?{decodedFrames,requestedSeconds:options.end-options.start,meaning:"Frames processed by the selected video QC filter chain with passthrough frame timing. Count does not prove continuous coverage, constant frame rate, or image fidelity."}:null,
      audioCoverage:audio?{samplesPerChannel:findings.audioSamplesPerChannel,sampleRate:audioRate,decodedSeconds:findings.audioSamplesPerChannel!/audioRate!,requestedSeconds:options.end-options.start,amountMatchesRequestedDuration:Math.abs(findings.audioSamplesPerChannel!-(options.end-options.start)*audioRate!)<=1,meaning:"Sample amount at the declared rate before loudness normalization. Does not prove continuous timestamp coverage or perceptual synchronization."}:null,
      streamDetails:{video:qcStreamDetails(video),audio:qcStreamDetails(audio),meaning:"Source probe metadata declarations; absent fields are null, not inferred. Tags do not verify mastering, actual transfer behavior, or delivery compliance."},
      timing:{videoStart,audioStart,audioMinusVideoStart:videoStart!==null&&audioStart!==null?audioStart-videoStart:null,meaning:"Container stream offsets only; perceptual audio/video synchronization is not tested"},
      reviewRequired:true,limitations:["Only the reported video/audio stream indices were analyzed; omitted selectors default to the first stream of each type","Black, static and silent scenes can be intentional","Black end timestamps have decoded-frame precision","Findings apply only to the selected range","No delivery-standard pass/fail verdict"],sourceModified:false};
    const revision=randomUUID(),root=await library.directory(),output=path.join(root,`qc-${revision}.json`),html=path.join(root,`qc-${revision}.html`);
    await writeFile(output,JSON.stringify(report,null,2),{flag:"wx"});
    const escaped=JSON.stringify(report,null,2).replace(/[&<>]/g,value=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[value]!);
    await writeFile(html,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Media QC report</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Media QC report</h1><p>Review findings in context. These measurements are not a delivery certification.</p><pre>${escaped}</pre></html>`,{flag:"wx"});
    return {revision,output,html,...report};
  }
}
