import {stat,realpath} from "node:fs/promises";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";

const colorTag=z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/);
const startTime=z.number().min(-86400).max(86400);
export const renderContract=z.object({
  videoCodec:z.string().regex(/^[a-z0-9_]+$/),width:z.number().int().positive().max(16384),height:z.number().int().positive().max(16384),
  frames:z.number().int().positive().max(10000000),rate:z.object({num:z.number().int().positive().max(240000),den:z.number().int().positive().max(10000)}).strict(),
  videoStartTime:startTime.optional(),
  audio:z.array(z.object({codec:z.string().regex(/^[a-z0-9_]+$/),channels:z.number().int().positive().max(64),sampleRate:z.number().int().positive().max(384000),startTime:startTime.optional()}).strict()).max(64),
  color:z.object({range:z.enum(["tv","pc"]),space:colorTag.optional(),transfer:colorTag.optional(),primaries:colorTag.optional()}).strict().optional(),
}).strict();
type Contract=z.infer<typeof renderContract>;
function matchesStartTime(value:unknown,expected:number|undefined){
  if(expected===undefined)return true;
  if(typeof value!=="number"&&(typeof value!=="string"||value.trim()===""))return false;
  const actual=Number(value);return Number.isFinite(actual)&&Math.abs(actual-expected)<=0.000001;
}
export function matchesRenderContract(probe:any,expected:Contract){
  if(!Array.isArray(probe?.streams))return false;
  const video=probe.streams.filter((s:any)=>s.codec_type==="video"),audio=probe.streams.filter((s:any)=>s.codec_type==="audio");
  if(video.length!==1||audio.length!==expected.audio.length)return false;
  const v=video[0],rate=String(v.avg_frame_rate).split("/").map(Number);
  if(!matchesStartTime(v.start_time,expected.videoStartTime))return false;
  if(rate.length!==2||!rate[0]||!rate[1]||rate[0]*expected.rate.den!==rate[1]*expected.rate.num)return false;
  const duration=expected.frames*expected.rate.den/expected.rate.num;
  if(v.codec_name!==expected.videoCodec||v.width!==expected.width||v.height!==expected.height||Number(v.nb_frames)!==expected.frames||!Number.isFinite(Number(v.duration))||Math.abs(Number(v.duration)-duration)>0.001)return false;
  if(expected.color){
    for(const [key,field] of [["range","color_range"],["space","color_space"],["transfer","color_transfer"],["primaries","color_primaries"]] as const){
      const value=expected.color[key];if(value!==undefined&&v[field]!==value)return false;
    }
  }
  return audio.every((stream:any,index:number)=>stream.codec_name===expected.audio[index]!.codec&&stream.channels===expected.audio[index]!.channels&&Number(stream.sample_rate)===expected.audio[index]!.sampleRate&&matchesStartTime(stream.start_time,expected.audio[index]!.startTime)&&Number.isFinite(Number(stream.duration))&&Math.abs(Number(stream.duration)-duration)<=0.05);
}

/** Readiness is separate from RPC completion. This function never starts or retries an export. */
export async function verifyNativeRender(file:string,config:ServerConfig,input:Contract,options:{timeoutMs?:number;pollMs?:number;assertOwner?:()=>Promise<void>}={}){
  requireCapability(config.capabilities,"inspect");const expected=renderContract.parse(input);
  if(!config.outputRoot)throw new Error("Output root is required for render verification");
  const root=await realpath(config.outputRoot),timeoutMs=options.timeoutMs??60000,pollMs=options.pollMs??1000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>900000||!Number.isInteger(pollMs)||pollMs<1||pollMs>10000)throw new Error("Invalid render observation limits");
  const deadline=Date.now()+timeoutMs;let previous:string|undefined,lastReason="Output not observed",identity:string|undefined,deadlineError:unknown;
  const remaining=()=>Math.max(1,Math.min(config.commandTimeoutMs,deadline-Date.now()));
  while(Date.now()<deadline){
    await options.assertOwner?.();
    let resolved:string|undefined;
    try{resolved=await resolveReadablePath(file,[root],"file");}
    catch(error){if(!["ENOENT","PATH_NOT_FOUND"].includes((error as {code?:string}).code??""))throw error;}
    if(resolved){
      if(identity&&identity!==resolved)throw new Error("Render path changed during observation");identity=resolved;
      const info=await stat(resolved),stamp=`${info.size}:${info.mtimeMs}:${info.ino}`;
      if(info.size>0&&previous===stamp){
        let probe:Awaited<ReturnType<typeof runProcess>>;
        try{probe=await runProcess(config.ffprobeExecutable,["-v","error","-protocol_whitelist","file,pipe","-show_streams","-of","json",resolved],{timeoutMs:remaining(),maxOutputBytes:1024*1024});}
        catch(error){
          if((error as {code?:string}).code==="PROCESS_TIMEOUT"&&Date.now()>=deadline){deadlineError=error;break;}
          throw error;
        }
        let metadata:unknown;try{metadata=JSON.parse(probe.stdout);}catch{lastReason="Metadata is not complete JSON";}
        if(probe.exitCode===0&&matchesRenderContract(metadata,expected)){
          const sha256=await sha256File(resolved);
          const decode=await runProcess(config.ffmpegExecutable??"ffmpeg",["-nostdin","-v","error","-xerror","-protocol_whitelist","file,pipe","-i",resolved,"-map","0:v:0","-map","0:a?","-fps_mode","passthrough","-progress","pipe:1","-f","null","-"],{timeoutMs:remaining(),maxOutputBytes:1024*1024});
          const decodedFrames=Number([...decode.stdout.matchAll(/^frame=(\d+)\s*$/gm)].at(-1)?.[1]);
          await options.assertOwner?.();
          const after=await stat(resolved),finalPath=await resolveReadablePath(file,[root],"file");
          if(decode.exitCode===0&&decode.stdout.includes("progress=end")&&decodedFrames===expected.frames&&Date.now()<=deadline&&finalPath===resolved&&`${after.size}:${after.mtimeMs}:${after.ino}`===stamp&&await sha256File(resolved)===sha256){
            return {output:resolved,bytes:after.size,sha256,expected,metadata,decodedFrames,decodePassed:true,contractMatched:true,colorTagsChecked:expected.color!==undefined,sourceFidelity:"Not assessed; this verifies the declared output contract, including requested metadata tags, not pixel color conformance",exportRetried:false};
          }
          lastReason="Decode failed or output changed during verification";
        }else lastReason="Observed metadata does not match the declared render contract";
      }
      previous=stamp;
    }else {previous=undefined;lastReason="Output not observed";}
    await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,Math.max(1,deadline-Date.now()))));
  }
  throw new Error(`Render readiness unproven: ${lastReason}. Inspect this output and host before any new export; no export was retried.`,deadlineError?{cause:deadlineError}:undefined);
}
