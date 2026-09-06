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

export const shotOptions=z.object({start:z.number().nonnegative().default(0),end:z.number().positive(),threshold:z.number().min(0.1).max(100).default(10),minimumGap:z.number().min(0).max(60).default(0)}).strict().refine(value=>value.end>value.start&&value.end-value.start<=3600,"Shot detection range must be at most one hour");
export function parseShotLog(log:string,start:number,end:number,minimumGap=0){
  const candidates=[];
  for(const match of log.matchAll(/lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.eE+-]+)/g)){
    const score=Number(match[1]),time=start+Number(match[2]);
    if(!Number.isFinite(score)||!Number.isFinite(time)||score<0||score>100)throw new Error("Invalid scene detector output");
    if(time>start&&time<end)candidates.push({time,score});
    if(candidates.length>5000)throw new Error("Shot candidate limit exceeded; use a shorter range");
  }
  candidates.sort((a,b)=>a.time-b.time);
  const cuts:typeof candidates=[];
  for(const candidate of candidates){const previous=cuts.at(-1)?.time??start;if(candidate.time>previous&&candidate.time-previous>=minimumGap&&end-candidate.time>=minimumGap)cuts.push(candidate);}
  const bounds=[start,...cuts.map(cut=>cut.time),end];
  const shots=bounds.slice(0,-1).map((begin,index)=>({index,start:begin,end:bounds[index+1]!,representativeSeconds:(begin+bounds[index+1]!)/2}));
  return {cuts,shots,candidateCount:candidates.length,suppressedCandidates:candidates.length-cuts.length};
}

export class ShotDetection {
  constructor(private readonly config:ServerConfig){}
  async detect(id:string,input:z.input<typeof shotOptions>){
    requireCapability(this.config.capabilities,"export");const options=shotOptions.parse(input),library=new MediaLibrary(this.config);
    const entry=await library.validatedMetadata(id);
    const duration=Number(entry.metadata.format?.duration);
    if(!Number.isFinite(duration)||options.end>duration)throw new Error("Shot range exceeds source duration");
    if(!entry.metadata.streams?.some((stream:{codec_type?:string})=>stream.codec_type==="video"))throw new Error("Shot detection requires video");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const span=options.end-options.start;
    const result=await runProcess(this.config.ffmpegExecutable??"ffmpeg",["-hide_banner","-nostdin","-nostats","-xerror","-v","info","-protocol_whitelist","file,pipe","-ss",String(options.start),"-t",String(span),"-i",source,"-map","0:v:0","-an","-vf",`trim=duration=${span},scdet=threshold=${options.threshold}`,"-fps_mode","passthrough","-progress","pipe:1","-f","null","-"],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:4*1024*1024});
    if(result.exitCode!==0)throw new Error(`Shot detection failed: ${result.stderr.slice(-1000)}`);
    const decodedFrames=Number([...result.stdout.matchAll(/^frame=(\d+)\s*$/gm)].at(-1)?.[1]);
    if(!result.stdout.includes("progress=end")||!Number.isFinite(decodedFrames)||decodedFrames<1)throw new Error("Shot decoding did not produce a complete frame summary");
    if(await sha256File(source)!==id)throw new Error("Source changed during shot detection");
    const findings=parseShotLog(result.stderr,options.start,options.end,options.minimumGap),revision=randomUUID();
    const report={schema:1,revision,id,options,decodedFrames,...findings,sourceUnchanged:true,method:"FFmpeg scdet at native resolution, first video stream",limitations:["Threshold-based visual cuts, not semantic scene understanding","Flashes and camera motion can produce false cuts; fades or similar shots can be missed","Times use decoded frame precision relative to the requested range","Range edges are artificial shot boundaries","Minimum gap filtering keeps the earliest eligible candidate"]};
    const output=path.join(await library.directory(),`shots-${revision}.json`);await writeFile(output,JSON.stringify(report,null,2),{flag:"wx"});
    return {...report,output};
  }
}
