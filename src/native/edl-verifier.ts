import * as z from "zod/v4";
import {analyzeEdl} from "../analysis/edl.js";
import {sha256File} from "../analysis/file-inventory.js";

const timecode=z.string().regex(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
export const edlCutContract=z.object({
  frameRate:z.literal(30),
  events:z.array(z.object({reel:z.string().min(1).max(256),track:z.string().min(1).max(32),sourceIn:timecode,sourceOut:timecode,recordIn:timecode,recordOut:timecode}).strict()).min(1).max(10000),
}).strict();

function frames(value:string):number {
  const parts=value.split(":").map(Number);
  const [hours,minutes,seconds,frame]=parts as [number,number,number,number];
  if(hours>=24||minutes>=60||seconds>=60||frame>=30)throw new Error("EDL timecode exceeds 30 fps non-drop bounds");
  return ((hours*60+minutes)*60+seconds)*30+frame;
}

/** Artifact-only qualification; callers must authorize the path before invoking. */
export async function verifyEdlCuts(file:string,input:z.infer<typeof edlCutContract>){
  const contract=edlCutContract.parse(input),before=await sha256File(file),analysis=await analyzeEdl(file);
  if(analysis.sourceTruncated||analysis.unparsedLines.length)throw new Error("EDL contains truncated or unparsed content");
  if(analysis.frameCountMode!=="NON-DROP FRAME")throw new Error("EDL requires explicit NON-DROP FRAME timing");
  if(analysis.events.length!==contract.events.length)throw new Error("EDL event count differs from the expected edit");
  const rows=[];
  for(let index=0;index<analysis.events.length;index++){
    const event=analysis.events[index]!,expected=contract.events[index]!;
    if(event.raw.trim().split(/\s+/).length!==8)throw new Error("EDL event contains unsupported inline fields");
    if(event.transition!=="C"||event.transitionDuration||event.motionEffect)throw new Error("EDL cut verification does not support transitions or motion effects");
    for(const key of ["reel","track","sourceIn","sourceOut","recordIn","recordOut"] as const)if(event[key]!==expected[key])throw new Error(`EDL event ${index+1} differs in ${key}`);
    const sourceStart=frames(event.sourceIn),sourceEnd=frames(event.sourceOut),recordStart=frames(event.recordIn),recordEnd=frames(event.recordOut);
    if(sourceEnd<=sourceStart||recordEnd<=recordStart||sourceEnd-sourceStart!==recordEnd-recordStart)throw new Error("EDL cut durations must be positive and match without rollover or retiming");
    rows.push({reel:event.reel,track:event.track,sourceStart,sourceEnd,recordStart,recordEnd});
  }
  if(await sha256File(file)!==before)throw new Error("EDL changed during verification");
  return {sha256:before,frameRate:30,eventCount:rows.length,events:rows,cutContractVerified:true,scope:"Exact ordered cut/reel/track/timecode contract at 30 fps non-drop. No source-media identity, native export, effects, playback or atomic snapshot verification."};
}
