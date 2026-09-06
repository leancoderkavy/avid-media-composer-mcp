import {it,expect} from "vitest";
import {traceSavedSources} from "../src/library/source-trace.js";
const mob=(mobId:string,sourceMobId:string,offset=0)=>({mobId,rate:30,duration:200,sourceBounds:{start:0,end:200},tracks:[{index:1,mediaKind:"picture",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:200,sourceMobId,sourceTrackId:1,sourceStart:offset}]}]});
it("maps clipped ranges through equal-rate sources and reports unresolved endpoints",()=>{
 const a=mob("a","b",20),b=mob("b","external",30),bin={file:"fixture",mobs:[a,b]};const result=traceSavedSources([bin],{bin,mob:a},10,20);
 expect(result.steps).toMatchObject([{sourceStart:30,sourceEnd:40,status:"reference"},{sourceStart:60,sourceEnd:70,status:"unresolved"}]);expect(result.incomplete).toBe(true);
});
it("stops at cycles, mixed rates, depth limits and invalid ranges",()=>{
 const a=mob("a","b"),b=mob("b","a"),bin={file:"fixture",mobs:[a,b]};
 expect(traceSavedSources([bin],{bin,mob:a},0,10).steps.at(-1)).toMatchObject({status:"cycle"});
 expect(traceSavedSources([bin],{bin,mob:a},0,10,1).steps.at(-1)).toMatchObject({status:"depth_limit"});
 b.rate=25;expect(traceSavedSources([bin],{bin,mob:a},0,10).steps.at(-1)).toMatchObject({status:"mixed_rate"});
 expect(()=>traceSavedSources([bin],{bin,mob:a},0,201)).toThrow();
});
it("uses unique local identities and refuses ambiguous external matches",()=>{
 const a=mob("a","b"),b=mob("b","terminal"),local={file:"local",mobs:[a]},other={file:"other",mobs:[b,b]};
 expect(traceSavedSources([local,other],{bin:local,mob:a},0,10).steps[0]).toMatchObject({status:"ambiguous"});local.mobs.push(b);
 expect(traceSavedSources([local,other],{bin:local,mob:a},0,10).steps[0]).toMatchObject({status:"reference"});
});
it("reports unsupported components, uncovered intervals and overlapping nodes",()=>{
 const a=mob("a","external"),bin={file:"fixture",mobs:[a]},node=a.tracks[0]!.nodes[0]!;
 node.kind="FILL";node.timelineStart=5;node.timelineEnd=15;
 expect(traceSavedSources([bin],{bin,mob:a},0,20).steps.map(s=>s.status)).toEqual(["uncovered_range","unsupported_component","uncovered_range"]);
 a.tracks[0]!.nodes.push({...node});
 expect(traceSavedSources([bin],{bin,mob:a},5,15).steps.at(-1)).toMatchObject({status:"overlapping_nodes"});
});
it("refuses unsupported bounds, out-of-range references and missing or ambiguous tracks",()=>{
 const a=mob("a","b"),b=mob("b","external"),bin={file:"fixture",mobs:[a,b]};
 const status=()=>traceSavedSources([bin],{bin,mob:a},0,10).steps.at(-1)?.status;
 b.sourceBounds.start=1;expect(status()).toBe("source_bounds_unsupported");b.sourceBounds.start=0;
 a.tracks[0]!.nodes[0]!.sourceStart=195;expect(status()).toBe("source_range_outside_mob");a.tracks[0]!.nodes[0]!.sourceStart=0;
 b.tracks[0]!.index=2;expect(status()).toBe("missing_track");b.tracks[0]!.index=1;
 b.tracks.push(b.tracks[0]!);expect(status()).toBe("ambiguous_track");
});
it("rejects excessive output instead of silently truncating a trace",()=>{
 const a=mob("a","external"),bin={file:"fixture",mobs:[a]};a.duration=501;
 a.tracks[0]!.nodes=Array.from({length:501},(_,i)=>({...a.tracks[0]!.nodes[0]!,timelineStart:i,timelineEnd:i+1}));
 expect(()=>traceSavedSources([bin],{bin,mob:a},0,501)).toThrow("500 steps");
});
it("locates gaps and mixed-rate stops within the affected clipped range",()=>{
 const a=mob("a","b"),b=mob("b","external"),node=a.tracks[0]!.nodes[0]!;b.rate=25;node.timelineStart=10;node.timelineEnd=20;
 const bin={file:"fixture",mobs:[a,b]},result=traceSavedSources([bin],{bin,mob:a},5,30);
 expect(result.steps.filter(s=>s.status==="uncovered_range")).toMatchObject([{start:5,end:10},{start:20,end:30}]);
 expect(result.steps.find(s=>s.status==="mixed_rate")).toMatchObject({start:10,end:20,originRate:30,targetRate:25,sourceRangeConverted:false,sourceMobId:"b",sourceBin:"fixture"});
 expect(result.steps.some(s=>s.depth===1)).toBe(false);
});
it("traces both qualified stereo channels independently across clipped cuts",()=>{
 const a=mob("a","b"),b=mob("b","terminal");a.tracks[0]!.mediaKind="sound";b.tracks[0]!.mediaKind="sound";
 b.tracks.push({...b.tracks[0]!,index:2,nodes:[{...b.tracks[0]!.nodes[0]!,sourceStart:3}]});
 const nodes=[0,20].flatMap(start=>([1,2] as const).map(channel=>({...a.tracks[0]!.nodes[0]!,timelineStart:start,timelineEnd:start+20,sourceStart:40+start,sourceTrackId:channel,channelCombiner:{channelIndex:channel,channelCount:2 as const}})));
 a.tracks[0]!.nodes=nodes;const bin={file:"fixture",mobs:[a,b]},result=traceSavedSources([bin],{bin,mob:a},10,30);
 const direct=result.steps.filter(s=>s.depth===0);
 expect(direct).toMatchObject([{sourceStart:50,sourceEnd:60,channelCombiner:{channelIndex:1}},{sourceStart:50,sourceEnd:60,channelCombiner:{channelIndex:2}},{sourceStart:60,sourceEnd:70,channelCombiner:{channelIndex:1}},{sourceStart:60,sourceEnd:70,channelCombiner:{channelIndex:2}}]);
 expect(result.steps.filter(s=>s.depth===1).map(s=>s.sourceStart)).toEqual([50,53,60,63]);
 expect(result.steps.some(s=>s.status==="overlapping_nodes")).toBe(false);
 nodes[1]!.channelCombiner.channelIndex=1;
 expect(traceSavedSources([bin],{bin,mob:a},10,30).steps.at(-1)).toMatchObject({status:"unsupported_channel_group"});
});
it.each(["missing", "bounds", "opaque", "kind", "picture"])("rejects a %s channel pair without treating it as stereo",variant=>{
 const source=mob("a","external"),node=source.tracks[0]!.nodes[0]!;
 const nodes=([1,2] as const).map(channel=>({...node,opaque:false,channelCombiner:{channelIndex:channel,channelCount:2 as const}}));
 if(variant==="missing")nodes.pop();
 if(variant==="bounds")nodes[1]!.timelineEnd=100;
 if(variant==="opaque")nodes[1]!.opaque=true;
 if(variant==="kind")nodes[1]!.kind="FILL";
 const a={...source,tracks:[{index:1,mediaKind:variant==="picture"?"picture":"sound",nodes}]},bin={file:"fixture",mobs:[a]};
 expect(traceSavedSources([bin],{bin,mob:a},0,10).steps).toMatchObject([{status:"unsupported_channel_group"}]);
});
