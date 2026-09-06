import {isDeepStrictEqual} from "node:util";
import * as z from "zod/v4";
import {AvidMcpError} from "../errors.js";

const frame=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const node=z.object({kind:z.string(),timelineStart:frame,timelineEnd:frame,sourceStart:frame.optional(),sourceMobId:z.string().optional(),sourceTrackId:frame.optional(),opaque:z.boolean().optional(),channelCombiner:z.unknown().optional()}).passthrough();
const track=z.object({ordinal:frame,index:frame.optional(),mediaKind:z.string(),nodes:z.array(node).max(10000)}).passthrough();
const markerIdentity=z.object({id:z.string().max(128).nullable(),guid:z.string().max(128).nullable()}).passthrough();
const mob=z.object({mobId:z.string().min(1),mobType:z.string(),rate:z.number().positive(),duration:frame,sourceBounds:z.object({start:frame,end:frame}).passthrough().optional(),tracks:z.array(track).max(128),markers:z.array(markerIdentity).max(10000).optional()}).passthrough().superRefine((value,ctx)=>{
 if(value.sourceBounds&&value.sourceBounds.end-value.sourceBounds.start!==value.duration)ctx.addIssue({code:"custom",message:"Declared source bounds disagree with mob duration"});
});
const graph=z.object({schema:z.literal(1),complete:z.literal(true),warnings:z.array(z.unknown()).length(0),mobs:z.array(mob).max(1000)}).passthrough();
const request=z.object({mobId:z.string().min(1),cut:frame,delta:z.union([z.literal(-1),z.literal(1)]),trackOrdinals:z.array(frame).min(1).max(128)}).strict();
function requireSourceTrackCoverage(source:z.infer<typeof mob>,index:number,kind:string,start:number,end:number){
 const matches=source.tracks.filter(t=>t.index===index&&t.mediaKind===kind);
 if(matches.length!==1)throw new Error("Missing or ambiguous declared source track");
 const selected=matches[0]!,nodes=[...selected.nodes].sort((a,b)=>a.timelineStart-b.timelineStart);
 let covered=start,previousEnd=-1;
 for(const n of nodes){
  if(n.timelineEnd<=n.timelineStart||n.timelineEnd>source.duration||n.timelineStart<previousEnd)throw new Error("Invalid or overlapping declared source track ranges");
  previousEnd=n.timelineEnd;
  if(n.timelineEnd<=start||n.timelineStart>=end)continue;
  if(n.timelineStart>covered||n.kind!=="SCLP"||n.opaque||n.channelCombiner!==undefined)throw new Error("Trim range lacks direct declared source-track coverage");
  covered=Math.max(covered,Math.min(end,n.timelineEnd));
 }
 if(covered<end)throw new Error("Trim range lacks direct declared source-track coverage");
 return selected.ordinal;
}

/** Compares decoded saved graphs only. Does not execute a trim or prove media handles/playback. */
export function verifySavedDualRollerTrim(beforeInput:unknown,afterInput:unknown,input:z.infer<typeof request>){
 const before=graph.parse(beforeInput),after=graph.parse(afterInput),plan=request.parse(input);
 const ordered=(value:z.infer<typeof graph>)=>{
  const ids=value.mobs.map(m=>m.mobId);if(new Set(ids).size!==ids.length)throw new Error("Ambiguous mob identities");
  return [...value.mobs].sort((a,b)=>a.mobId.localeCompare(b.mobId));
 };
 const expected=structuredClone(ordered(before));ordered(after);
 const target=expected.find(m=>m.mobId===plan.mobId);if(!target||target.mobType!=="CompositionMob")throw new Error("Expected one composition");
 const candidate=after.mobs.find(m=>m.mobId===plan.mobId);
 if(target.markers!==undefined&&candidate?.markers!==undefined){
  const identities=(markers:z.infer<typeof markerIdentity>[])=>markers.map(marker=>JSON.stringify([marker.id,marker.guid])).sort();
  if(!isDeepStrictEqual(identities(target.markers),identities(candidate.markers)))throw new AvidMcpError('SAVED_TRIM_MARKER_IDENTITIES_CHANGED','Saved marker identifiers changed across the compared trim. Exact saved-state verification failed; inspect saved and native markers before further marker writes.',{beforeMarkerCount:target.markers.length,afterMarkerCount:candidate.markers.length,exactStateVerified:false,nativeIdentityContinuityVerified:false,nextStep:'inspect_saved_and_native_markers'});
 }
 if(target.sourceBounds&&target.sourceBounds.start!==0)throw new Error("Nonzero composition origin is not qualified for saved trim verification");
 const declaredSourceBounds:{trackOrdinal:number;side:"outgoing"|"incoming";sourceMobId:string;sourceTrackId:number;sourceTrackOrdinal:number;mediaKind:string;sourceDuration:number;before:{start:number;end:number};after:{start:number;end:number}}[]=[];
 if(new Set(plan.trackOrdinals).size!==plan.trackOrdinals.length||new Set(target.tracks.map(t=>t.ordinal)).size!==target.tracks.length)throw new Error("Ambiguous trim track selection");
 for(const ordinal of plan.trackOrdinals){
  const selected=target.tracks.find(t=>t.ordinal===ordinal);if(!selected||!["picture","sound"].includes(selected.mediaKind))throw new Error("Unsupported trim track");
  const sorted=[...selected.nodes].sort((a,b)=>a.timelineStart-b.timelineStart);
  for(let i=0;i<sorted.length;i++){const n=sorted[i]!;if(n.timelineEnd<=n.timelineStart||n.timelineEnd>target.duration||(i>0&&sorted[i-1]!.timelineEnd>n.timelineStart))throw new Error("Invalid or overlapping trim track ranges");}
  const left=selected.nodes.filter(n=>n.timelineEnd===plan.cut),right=selected.nodes.filter(n=>n.timelineStart===plan.cut);
  if(left.length!==1||right.length!==1)throw new Error("Expected adjacent clips at trim cut");
  const a=left[0]!,b=right[0]!;
  for(const n of [a,b])if(n.kind!=="SCLP"||n.opaque||n.channelCombiner!==undefined||n.sourceStart===undefined||!n.sourceMobId||n.sourceTrackId===undefined)throw new Error("Unsupported trim component");
  const sources=[a,b].map(n=>{const source=before.mobs.find(m=>m.mobId===n.sourceMobId);if(!source||source.rate!==target.rate)throw new Error("Unresolved or mixed-rate trim source");if(source.sourceBounds&&source.sourceBounds.start!==0)throw new Error("Nonzero source origin is not qualified for saved trim verification");return source;});
  const cut=plan.cut+plan.delta,source=b.sourceStart!+plan.delta;
  if(!Number.isSafeInteger(cut)||!Number.isSafeInteger(source)||source<0||cut<=a.timelineStart||cut>=b.timelineEnd)throw new Error("Trim would empty a clip or exceed numeric bounds");
  for(const [index,n] of [a,b].entries()){
   const sourceMob=sources[index]!,beforeStart=n.sourceStart!,beforeEnd=beforeStart+(n.timelineEnd-n.timelineStart);
   const afterStart=index===0?beforeStart:source,afterEnd=index===0?beforeEnd+plan.delta:beforeEnd;
   if(![beforeEnd,afterStart,afterEnd].every(Number.isSafeInteger)||beforeStart<0||afterStart<0||beforeEnd>sourceMob.duration||afterEnd>sourceMob.duration||beforeEnd<=beforeStart||afterEnd<=afterStart)throw new Error("Trim source range exceeds declared source bounds or numeric limits");
   const sourceTrackOrdinal=requireSourceTrackCoverage(sourceMob,n.sourceTrackId!,selected.mediaKind,Math.min(beforeStart,afterStart),Math.max(beforeEnd,afterEnd));
   declaredSourceBounds.push({trackOrdinal:ordinal,side:index===0?"outgoing":"incoming",sourceMobId:sourceMob.mobId,sourceTrackId:n.sourceTrackId!,sourceTrackOrdinal,mediaKind:selected.mediaKind,sourceDuration:sourceMob.duration,before:{start:beforeStart,end:beforeEnd},after:{start:afterStart,end:afterEnd}});
  }
  a.timelineEnd=cut;b.timelineStart=cut;b.sourceStart=source;
 }
 if(!isDeepStrictEqual(expected,ordered(after)))throw new Error("Saved graph differs from the exact requested trim");
 return {verified:true as const,mobId:plan.mobId,cutBefore:plan.cut,cutAfter:plan.cut+plan.delta,trackOrdinals:plan.trackOrdinals,declaredSourceBounds,scope:"Complete decoded mob records, same-rate source-mob bounds and direct declared source-track coverage only; nested physical media handles, online availability, unknown binary fields and playback are not verified"};
}
