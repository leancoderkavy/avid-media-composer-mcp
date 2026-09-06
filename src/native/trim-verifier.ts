import {isDeepStrictEqual} from "node:util";
import * as z from "zod/v4";

const frame=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const node=z.object({kind:z.string(),timelineStart:frame,timelineEnd:frame,sourceStart:frame.optional(),sourceMobId:z.string().optional(),sourceTrackId:frame.optional(),opaque:z.boolean().optional(),channelCombiner:z.unknown().optional()}).passthrough();
const track=z.object({ordinal:frame,mediaKind:z.string(),nodes:z.array(node).max(10000)}).passthrough();
const mob=z.object({mobId:z.string().min(1),mobType:z.string(),rate:z.number().positive(),duration:frame,tracks:z.array(track).max(128)}).passthrough();
const graph=z.object({schema:z.literal(1),complete:z.literal(true),warnings:z.array(z.unknown()).length(0),mobs:z.array(mob).max(1000)}).passthrough();
const request=z.object({mobId:z.string().min(1),cut:frame,delta:z.union([z.literal(-1),z.literal(1)]),trackOrdinals:z.array(frame).min(1).max(128)}).strict();

/** Compares decoded saved graphs only. Does not execute a trim or prove media handles/playback. */
export function verifySavedDualRollerTrim(beforeInput:unknown,afterInput:unknown,input:z.infer<typeof request>){
 const before=graph.parse(beforeInput),after=graph.parse(afterInput),plan=request.parse(input);
 const ordered=(value:z.infer<typeof graph>)=>{
  const ids=value.mobs.map(m=>m.mobId);if(new Set(ids).size!==ids.length)throw new Error("Ambiguous mob identities");
  return [...value.mobs].sort((a,b)=>a.mobId.localeCompare(b.mobId));
 };
 const expected=structuredClone(ordered(before));ordered(after);
 const target=expected.find(m=>m.mobId===plan.mobId);if(!target||target.mobType!=="CompositionMob")throw new Error("Expected one composition");
 if(new Set(plan.trackOrdinals).size!==plan.trackOrdinals.length||new Set(target.tracks.map(t=>t.ordinal)).size!==target.tracks.length)throw new Error("Ambiguous trim track selection");
 for(const ordinal of plan.trackOrdinals){
  const selected=target.tracks.find(t=>t.ordinal===ordinal);if(!selected||!["picture","sound"].includes(selected.mediaKind))throw new Error("Unsupported trim track");
  const sorted=[...selected.nodes].sort((a,b)=>a.timelineStart-b.timelineStart);
  for(let i=0;i<sorted.length;i++){const n=sorted[i]!;if(n.timelineEnd<=n.timelineStart||n.timelineEnd>target.duration||(i>0&&sorted[i-1]!.timelineEnd>n.timelineStart))throw new Error("Invalid or overlapping trim track ranges");}
  const left=selected.nodes.filter(n=>n.timelineEnd===plan.cut),right=selected.nodes.filter(n=>n.timelineStart===plan.cut);
  if(left.length!==1||right.length!==1)throw new Error("Expected adjacent clips at trim cut");
  const a=left[0]!,b=right[0]!;
  for(const n of [a,b])if(n.kind!=="SCLP"||n.opaque||n.channelCombiner!==undefined||n.sourceStart===undefined||!n.sourceMobId||n.sourceTrackId===undefined)throw new Error("Unsupported trim component");
  for(const n of [a,b]){const source=before.mobs.find(m=>m.mobId===n.sourceMobId);if(!source||source.rate!==target.rate)throw new Error("Unresolved or mixed-rate trim source");}
  const cut=plan.cut+plan.delta,source=b.sourceStart!+plan.delta;
  if(!Number.isSafeInteger(cut)||!Number.isSafeInteger(source)||source<0||cut<=a.timelineStart||cut>=b.timelineEnd)throw new Error("Trim would empty a clip or exceed numeric bounds");
  a.timelineEnd=cut;b.timelineStart=cut;b.sourceStart=source;
 }
 if(!isDeepStrictEqual(expected,ordered(after)))throw new Error("Saved graph differs from the exact requested trim");
 return {verified:true as const,mobId:plan.mobId,cutBefore:plan.cut,cutAfter:plan.cut+plan.delta,trackOrdinals:plan.trackOrdinals,scope:"Complete decoded mob records only; file metadata, unknown binary fields, media handles and playback are not verified"};
}
