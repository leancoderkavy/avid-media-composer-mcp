type Node={kind:string;timelineStart:number;timelineEnd:number;sourceMobId?:string|undefined;sourceTrackId?:number|undefined;sourceStart?:number|undefined;opaque?:boolean|undefined};
type Track={index:number;mediaKind:string;nodes:Node[]};
type Mob={mobId:string;rate:number;duration:number;sourceBounds:{start:number;end:number};tracks:Track[]};
type Bin={file:string;mobs:Mob[]};
/** Diagnostic traversal only: no rate conversion, effect interpretation or media lookup. */
export function traceSavedSources(bins:Bin[],origin:{bin:Bin;mob:Mob},start:number,end:number,maxDepth=8){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>origin.mob.duration||!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>16)throw new Error("Invalid source trace range or depth");
 const steps:Record<string,unknown>[]=[];let incomplete=false;
 const emit=(value:Record<string,unknown>)=>{if(steps.length>=500)throw new Error("Source trace exceeds 500 steps; narrow the range");steps.push(value);};
 function walk(bin:Bin,mob:Mob,track:Track,left:number,right:number,depth:number,seen:Set<string>){
  const base={bin:bin.file,mobId:mob.mobId,trackIndex:track.index,mediaKind:track.mediaKind,start:left,end:right,depth};
  const stop=(status:string)=>{incomplete=true;emit({...base,status});};
  const key=JSON.stringify([bin.file,mob.mobId,track.index,track.mediaKind]);
  if(seen.has(key)){stop("cycle");return;}if(depth>=maxDepth){stop("depth_limit");return;}
  const nextSeen=new Set(seen);nextSeen.add(key);let covered=left;
  const nodes=track.nodes.filter(n=>n.timelineStart<right&&n.timelineEnd>left).sort((a,b)=>a.timelineStart-b.timelineStart);
  for(const node of nodes){
   const a=Math.max(left,node.timelineStart),b=Math.min(right,node.timelineEnd);
   if(a>covered){stop("uncovered_range");}if(a<covered){stop("overlapping_nodes");return;}covered=b;
   const step={...base,start:a,end:b,kind:node.kind};
   if(node.kind!=="SCLP"||node.opaque||node.sourceMobId===undefined||node.sourceTrackId===undefined||node.sourceStart===undefined){incomplete=true;emit({...step,status:"unsupported_component"});continue;}
   const sourceStart=node.sourceStart+a-node.timelineStart,sourceEnd=sourceStart+b-a;
   let candidates=bin.mobs.filter(m=>m.mobId===node.sourceMobId).map(mob=>({bin,mob}));
   if(!candidates.length)candidates=bins.flatMap(bin=>bin.mobs.filter(m=>m.mobId===node.sourceMobId).map(mob=>({bin,mob})));
   emit({...step,sourceMobId:node.sourceMobId,sourceTrackId:node.sourceTrackId,sourceStart,sourceEnd,status:candidates.length===1?"reference":candidates.length?"ambiguous":"unresolved"});
   if(candidates.length!==1){incomplete=true;continue;}
   const target=candidates[0]!;
   if(target.mob.rate!==mob.rate){stop("mixed_rate");continue;}
   if(target.mob.sourceBounds.start!==0){stop("source_bounds_unsupported");continue;}
   if(sourceStart<0||sourceEnd>target.mob.duration){stop("source_range_outside_mob");continue;}
   const tracks=target.mob.tracks.filter(t=>t.mediaKind===track.mediaKind&&t.index===node.sourceTrackId);
   if(tracks.length!==1){stop(tracks.length?"ambiguous_track":"missing_track");continue;}
   walk(target.bin,target.mob,tracks[0]!,sourceStart,sourceEnd,depth+1,nextSeen);
  }
  if(covered<right)stop("uncovered_range");
 }
 const tracks=origin.mob.tracks.filter(t=>t.mediaKind==="picture"||t.mediaKind==="sound");
 if(!tracks.length)incomplete=true;
 for(const track of tracks)walk(origin.bin,origin.mob,track,start,end,0,new Set());
 return {steps,incomplete,maxDepth,scope:"Diagnostic equal-rate direct source chains. Local-bin identities take precedence over cross-bin matches. Unsupported components and unresolved references remain explicit; no terminal-reference classification, media availability or playback verification."};
}
