type Node={kind:string;timelineStart:number;timelineEnd:number;sourceMobId?:string|undefined;sourceTrackId?:number|undefined;sourceStart?:number|undefined;opaque?:boolean|undefined;channelCombiner?:{channelIndex:1|2;channelCount:2}|undefined};
type Track={index:number;mediaKind:string;nodes:Node[]};
type Mob={mobId:string;rate:number;duration:number;sourceBounds:{start:number;end:number};tracks:Track[];descriptor?:unknown};
type Bin={file:string;mobs:Mob[]};
/** Diagnostic traversal only: no rate conversion, effect interpretation or media lookup. */
export function traceSavedSources(bins:Bin[],origin:{bin:Bin;mob:Mob},start:number,end:number,maxDepth=8){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>origin.mob.duration||!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>16)throw new Error("Invalid source trace range or depth");
 const steps:Record<string,unknown>[]=[];let incomplete=false;
 const descriptors=new Map<string,{bin:string;mobId:string;status:string;descriptor:unknown}>();
 const emit=(value:Record<string,unknown>)=>{if(steps.length>=500)throw new Error("Source trace exceeds 500 steps; narrow the range");steps.push(value);};
 function walk(bin:Bin,mob:Mob,track:Track,left:number,right:number,depth:number,seen:Set<string>){
  const base={bin:bin.file,mobId:mob.mobId,trackIndex:track.index,mediaKind:track.mediaKind,start:left,end:right,depth};
  const stop=(status:string,details:Record<string,unknown>={})=>{incomplete=true;emit({...base,...details,status});};
  const key=JSON.stringify([bin.file,mob.mobId,track.index,track.mediaKind]);
  descriptors.set(JSON.stringify([bin.file,mob.mobId]),{bin:bin.file,mobId:mob.mobId,status:mob.descriptor===undefined?"not_recorded":mob.descriptor===null?"absent":"recorded",descriptor:mob.descriptor??null});
  if(seen.has(key)){stop("cycle");return;}if(depth>=maxDepth){stop("depth_limit");return;}
  const nextSeen=new Set(seen);nextSeen.add(key);let covered=left;
  const nodes=track.nodes.filter(n=>n.timelineStart<right&&n.timelineEnd>left).sort((a,b)=>a.timelineStart-b.timelineStart);
  for(let index=0;index<nodes.length;index++){
   const node=nodes[index]!;
   const a=Math.max(left,node.timelineStart),b=Math.min(right,node.timelineEnd);
   if(a>covered){stop("uncovered_range",{start:covered,end:a});}if(a<covered){stop("overlapping_nodes",{start:a,end:Math.min(covered,b)});return;}covered=b;
   const group=[node];
   if(node.channelCombiner){
    const peer=nodes[index+1];
    if(track.mediaKind!=="sound"||!peer?.channelCombiner||node.channelCombiner.channelCount!==2||peer.channelCombiner.channelCount!==2||node.channelCombiner.channelIndex===peer.channelCombiner.channelIndex||node.timelineStart!==peer.timelineStart||node.timelineEnd!==peer.timelineEnd||node.kind!=="SCLP"||peer.kind!=="SCLP"||node.opaque||peer.opaque){stop("unsupported_channel_group",{start:a,end:b});return;}
    // Only paired, identically bounded channel references emitted by the qualified parser can overlap.
    group.push(peer);index++;
   }
   for(const node of group){
   const step={...base,start:a,end:b,kind:node.kind,...(node.channelCombiner?{channelCombiner:node.channelCombiner}:{})};
   if(node.kind!=="SCLP"||node.opaque||node.sourceMobId===undefined||node.sourceTrackId===undefined||node.sourceStart===undefined){incomplete=true;emit({...step,status:"unsupported_component"});continue;}
   // Compute bounded deltas first: adding absolute timeline coordinates can
   // lose an integer frame even when the final source range would be safe.
   const sourceStart=node.sourceStart+(a-node.timelineStart),sourceEnd=sourceStart+(b-a);
   if(!Number.isSafeInteger(sourceStart)||!Number.isSafeInteger(sourceEnd)||sourceStart<0||sourceEnd<=sourceStart){incomplete=true;emit({...step,status:"invalid_source_range"});continue;}
   let candidates=bin.mobs.filter(m=>m.mobId===node.sourceMobId).map(mob=>({bin,mob}));
   if(!candidates.length)candidates=bins.flatMap(bin=>bin.mobs.filter(m=>m.mobId===node.sourceMobId).map(mob=>({bin,mob})));
   const targetRate=candidates.length===1?candidates[0]!.mob.rate:null;
   emit({...step,sourceMobId:node.sourceMobId,sourceTrackId:node.sourceTrackId,sourceStart,sourceEnd,originRate:mob.rate,targetRate,sourceRangeBasis:targetRate===mob.rate?"equal-rate-offsets":"unconverted-offsets",status:candidates.length===1?"reference":candidates.length?"ambiguous":"unresolved"});
   if(candidates.length!==1){incomplete=true;continue;}
   const target=candidates[0]!;
   if(target.mob.rate!==mob.rate){stop("mixed_rate",{...step,sourceMobId:target.mob.mobId,sourceBin:target.bin.file,originRate:mob.rate,targetRate:target.mob.rate,sourceRangeConverted:false});continue;}
   if(target.mob.sourceBounds.start!==0){stop("source_bounds_unsupported",step);continue;}
   if(sourceStart<0||sourceEnd>target.mob.duration){stop("source_range_outside_mob",step);continue;}
   const tracks=target.mob.tracks.filter(t=>t.mediaKind===track.mediaKind&&t.index===node.sourceTrackId);
   if(tracks.length!==1){stop(tracks.length?"ambiguous_track":"missing_track",step);continue;}
   walk(target.bin,target.mob,tracks[0]!,sourceStart,sourceEnd,depth+1,nextSeen);
   }
  }
  if(covered<right)stop("uncovered_range",{start:covered,end:right});
 }
 const tracks=origin.mob.tracks.filter(t=>t.mediaKind==="picture"||t.mediaKind==="sound");
 if(!tracks.length)incomplete=true;
 for(const track of tracks)walk(origin.bin,origin.mob,track,start,end,0,new Set());
 return {steps,incomplete,maxDepth,descriptors:[...descriptors.values()],scope:"Diagnostic equal-rate direct source chains and selected saved descriptor declarations. Locator paths are untrusted metadata and are never opened. Local-bin identities take precedence over cross-bin matches. Unsupported components and unresolved references remain explicit; no terminal-reference classification, media availability or playback verification."};
}
