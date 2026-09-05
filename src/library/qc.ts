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

export const qcOptions=z.object({
  start:z.number().nonnegative().default(0),end:z.number().positive(),
  videoStream:z.number().int().nonnegative().nullable().optional(),audioStream:z.number().int().nonnegative().nullable().optional(),
  blackSeconds:z.number().min(0.05).max(60).default(0.5),blackPixelThreshold:z.number().min(0).max(1).default(0.1),blackPictureRatio:z.number().min(0).max(1).default(0.98),
  freezeSeconds:z.number().min(0.1).max(60).default(2),freezeNoise:z.number().min(0).max(1).default(0.001),
  silenceSeconds:z.number().min(0.1).max(60).default(0.5),silenceDb:z.number().min(-100).max(0).default(-50),
}).strict().refine(value=>value.end>value.start&&value.end-value.start<=600,"QC range must be at most 600 seconds");
type Interval={start:number;end:number;openAtRangeEnd?:boolean};
export function selectQcStreams<T extends {index?:number;codec_type?:string;start_time?:unknown}>(streams:T[],options:{videoStream?:number|null|undefined;audioStream?:number|null|undefined}){
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
  const intervals=(kind:"freeze"|"silence")=>{
    const result:Interval[]=[];let beginning:number|undefined;
    const regex=new RegExp(`${kind}_(start|end):\\s*${numeric}`,"g");
    for(const match of log.matchAll(regex)){
      if(match[1]==="start")beginning=clip(Number(match[2]));
      else if(beginning!==undefined){result.push({start:beginning,end:clip(Number(match[2]))});beginning=undefined;}
    }
    if(beginning!==undefined)result.push({start:beginning,end,openAtRangeEnd:true});
    if(result.length>10000)throw new Error("QC event limit exceeded");
    return result.filter(item=>item.end>item.start);
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
  return {black:black.filter(item=>item.end>item.start),freeze:intervals("freeze"),silence:intervals("silence"),frameTiming:vfr?{variableFraction:Number(vfr[1]),variableIntervals:Number(vfr[2]),constantIntervals:Number(vfr[3]),meaning:"Decoded timestamp interval variation; not a frame-drop or sync diagnosis"}:null,loudness};
}

export class MediaQc {
  constructor(private config:ServerConfig){}
  async analyze(id:string,input:z.input<typeof qcOptions>){
    requireCapability(this.config.capabilities,"export");const options=qcOptions.parse(input),library=new MediaLibrary(this.config);
    const [entry]=await library.metadata([id]);if(!entry)throw new Error("Unknown media");
    const duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(duration)||options.end>duration)throw new Error("QC range exceeds media duration");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const streams=entry.metadata.streams??[],selected=selectQcStreams(streams,options);
    const {video,audio}=selected;
    const executable=this.config.ffmpegExecutable??"ffmpeg",span=options.end-options.start;
    const base=["-hide_banner","-nostdin","-nostats","-xerror","-v","info","-protocol_whitelist","file,pipe","-ss",String(options.start),"-t",String(span),"-i",source];
    let log="";
    const run=async(args:string[])=>{
      const result=await runProcess(executable,[...base,...args,"-f","null","-"],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:4*1024*1024});
      if(result.exitCode!==0)throw new Error(`QC decoding failed: ${result.stderr.slice(-1000)}`);log+=result.stderr;
    };
    if(video)await run(["-map",`0:${video.index}`,"-an","-vf",`trim=duration=${span},setpts=PTS-STARTPTS,blackdetect=d=${options.blackSeconds}:pix_th=${options.blackPixelThreshold}:pic_th=${options.blackPictureRatio},freezedetect=n=${options.freezeNoise}:d=${options.freezeSeconds},vfrdet`]);
    if(audio)await run(["-map",`0:${audio.index}`,"-vn","-af",`atrim=duration=${span},asetpts=PTS-STARTPTS,silencedetect=n=${options.silenceDb}dB:d=${options.silenceSeconds},loudnorm=print_format=json`]);
    if(await sha256File(source)!==id)throw new Error("Source changed during QC");
    const findings=parseQcLog(log,options.start,options.end);
    if(video&&!findings.frameTiming)throw new Error("Video QC summary missing; result is incomplete");
    if(audio&&!findings.loudness)throw new Error("Audio QC summary missing; result is incomplete");
    const optionalNumber=(value:unknown)=>value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
    const videoStart=optionalNumber(video?.start_time),audioStart=optionalNumber(audio?.start_time);
    const report={schema:1,id,range:{start:options.start,end:options.end},options,streams:{video:video?.index??null,audio:audio?.index??null},findings,
      timing:{videoStart,audioStart,audioMinusVideoStart:videoStart!==null&&audioStart!==null?audioStart-videoStart:null,meaning:"Container stream offsets only; perceptual audio/video synchronization is not tested"},
      reviewRequired:true,limitations:["Only the reported video/audio stream indices were analyzed; omitted selectors default to the first stream of each type","Black, static and silent scenes can be intentional","Black end timestamps have decoded-frame precision","Findings apply only to the selected range","No delivery-standard pass/fail verdict"],sourceModified:false};
    const revision=randomUUID(),root=await library.directory(),output=path.join(root,`qc-${revision}.json`),html=path.join(root,`qc-${revision}.html`);
    await writeFile(output,JSON.stringify(report,null,2),{flag:"wx"});
    const escaped=JSON.stringify(report,null,2).replace(/[&<>]/g,value=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[value]!);
    await writeFile(html,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Media QC report</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Media QC report</h1><p>Review findings in context. These measurements are not a delivery certification.</p><pre>${escaped}</pre></html>`,{flag:"wx"});
    return {revision,output,html,...report};
  }
}
