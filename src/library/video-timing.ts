import * as z from "zod/v4";
const integer=z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),count=integer.nonnegative();
export const videoTimingSchema=z.object({frames:count.positive(),timeBase:z.object({num:count.positive(),den:count.positive()}).strict(),firstPts:integer,lastPts:integer,duplicateSteps:count,backwardSteps:count,minDelta:integer.nullable(),maxDelta:integer.nullable()}).strict().superRefine((v,ctx)=>{
 if(v.duplicateSteps+v.backwardSteps>v.frames-1||(v.frames===1?(v.firstPts!==v.lastPts||v.minDelta!==null||v.maxDelta!==null):(v.minDelta===null||v.maxDelta===null||v.minDelta>v.maxDelta||(v.minDelta<0)!==(v.backwardSteps>0))))ctx.addIssue({code:"custom",message:"Video timing accounting is inconsistent"});
 if(v.frames>1&&v.minDelta!==null&&v.maxDelta!==null){
  const total=BigInt(v.lastPts)-BigInt(v.firstPts),steps=BigInt(v.frames-1);
  if(total<steps*BigInt(v.minDelta)||total>steps*BigInt(v.maxDelta)||(v.duplicateSteps>0&&(v.minDelta>0||v.maxDelta<0))||(v.minDelta===0&&v.duplicateSteps===0))ctx.addIssue({code:"custom",message:"Video timing extrema are inconsistent"});
 }
});
/** Observed PTS steps, not frame durations or inferred missing-frame counts. */
export function parseVideoTiming(log:string){
 let timeBase:{num:number;den:number}|undefined,frames=0,firstPts=0,lastPts=0,duplicateSteps=0,backwardSteps=0,minDelta:number|null=null,maxDelta:number|null=null;
 const safe=(raw:string|number)=>{const value=Number(raw);if(!Number.isSafeInteger(value))throw new Error("Unsafe video timestamp accounting");return value;};
 for(const line of log.split(/\r?\n/)){
  if(!line.includes('[Parsed_showinfo_'))continue;
  if(line.includes('config in time_base:')){
   const match=/config in time_base:\s*(\d+)\/(\d+)/.exec(line);if(!match||timeBase)throw new Error("Ambiguous video time base");
   timeBase={num:safe(match[1]!),den:safe(match[2]!)};continue;
  }
  if(!/\bn:/.test(line))continue;
  const match=/\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:/.exec(line);
  if(!match||!timeBase||safe(match[1]!)!==frames)throw new Error("Incomplete or reordered video timing observation");
  const pts=safe(match[2]!);
  if(frames===0)firstPts=pts;
  else{const delta=safe(pts-lastPts);if(delta===0)duplicateSteps++;if(delta<0)backwardSteps++;minDelta=minDelta===null?delta:Math.min(minDelta,delta);maxDelta=maxDelta===null?delta:Math.max(maxDelta,delta);}
  lastPts=pts;frames++;
 }
 return videoTimingSchema.parse({frames,timeBase,firstPts,lastPts,duplicateSteps,backwardSteps,minDelta,maxDelta});
}
