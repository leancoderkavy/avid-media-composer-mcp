import * as z from "zod/v4";
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const audioTimingSchema=z.object({frames:count.positive(),sampleRate:count.positive().max(768000),samples:count.positive(),firstPts:z.number().int(),endPts:z.number().int(),gapSamples:count,overlapSamples:count,discontinuities:count}).strict().superRefine((value,ctx)=>{
 if(value.discontinuities>=value.frames||(value.discontinuities===0)!==(value.gapSamples===0&&value.overlapSamples===0)||BigInt(value.samples)+BigInt(value.gapSamples)-BigInt(value.overlapSamples)!==BigInt(value.endPts)-BigInt(value.firstPts))ctx.addIssue({code:"custom",message:"Audio timing accounting is inconsistent"});
});
/** Requires asettb=1/sampleRate immediately before ashowinfo. Counts adjacent
 * timestamp discontinuities, not unique coverage or perceptual synchronization. */
export function parseAudioTiming(log:string,sampleRate:number){
 let frames=0,samples=0,firstPts=0,endPts=0,gapSamples=0,overlapSamples=0,discontinuities=0;
 const safe=(value:number)=>{if(!Number.isSafeInteger(value))throw new Error("Unsafe audio timestamp accounting");return value;};
 for(const line of log.split(/\r?\n/)){
  if(!/\[Parsed_ashowinfo_/.test(line))continue;
  const match=/\bn:(\d+)\s+pts:(-?\d+)\s+pts_time:\S+.*\brate:(\d+)\s+nb_samples:(\d+)\b/.exec(line);
  if(!match)throw new Error("Incomplete audio timing observation");
  const [ordinal,pts,rate,amount]=match.slice(1).map(value=>safe(Number(value))) as [number,number,number,number];
  if(ordinal!==frames||rate!==sampleRate||amount<1)throw new Error("Inconsistent audio timing observation");
  if(frames===0)firstPts=pts;
  else {const gap=safe(pts-endPts);if(gap!==0)discontinuities++;if(gap>0)gapSamples=safe(gapSamples+gap);else overlapSamples=safe(overlapSamples-gap);}
  endPts=safe(pts+amount);samples=safe(samples+amount);frames++;
 }
 return audioTimingSchema.parse({frames,sampleRate,samples,firstPts,endPts,gapSamples,overlapSamples,discontinuities});
}
