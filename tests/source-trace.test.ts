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
