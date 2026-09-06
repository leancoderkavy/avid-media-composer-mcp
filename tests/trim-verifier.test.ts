import {it,expect} from "vitest";
import {verifySavedDualRollerTrim} from "../src/native/trim-verifier.js";
function fixture(){
 const clip=(start:number,end:number,sourceStart:number)=>({kind:"SCLP",timelineStart:start,timelineEnd:end,sourceStart,sourceMobId:"source",sourceTrackId:1});
 const before={schema:1,complete:true,warnings:[],mobs:[{mobId:"seq",mobType:"CompositionMob",rate:30,duration:120,name:"Keep name",tracks:[{ordinal:0,mediaKind:"picture",nodes:[clip(0,60,2850),clip(60,120,3300)]},{ordinal:1,mediaKind:"sound",nodes:[clip(0,60,2850),clip(60,120,3300)]}]}]};
 before.mobs.push({mobId:"source",mobType:"MasterMob",rate:30,duration:10000,name:"Source",tracks:before.mobs[0]!.tracks.map(t=>({...t,index:1,nodes:[clip(0,10000,0)]}))});
 const after=structuredClone(before);for(const track of after.mobs[0]!.tracks){track.nodes[0]!.timelineEnd++;track.nodes[1]!.timelineStart++;track.nodes[1]!.sourceStart++;}
 return {before,after,plan:{mobId:"seq",cut:60,delta:1 as const,trackOrdinals:[0,1]}};
}
it("verifies exact forward and reverse saved dual-roller changes",()=>{
 const {before,after,plan}=fixture();expect(verifySavedDualRollerTrim(before,after,plan).cutAfter).toBe(61);
 expect(verifySavedDualRollerTrim(after,before,{...plan,cut:61,delta:-1}).cutAfter).toBe(60);
});
it("rejects incomplete, ambiguous and unsupported baseline graphs",()=>{
 const {before,after,plan}=fixture();expect(()=>verifySavedDualRollerTrim({...before,complete:false},after,plan)).toThrow();
 expect(()=>verifySavedDualRollerTrim({...before,mobs:[...before.mobs,...before.mobs]},after,plan)).toThrow("Ambiguous");
 expect(()=>verifySavedDualRollerTrim(before,after,{...plan,trackOrdinals:[0,0]})).toThrow("Ambiguous");
 before.mobs[0]!.tracks[0]!.nodes[0]!.kind="TRAN";expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("Unsupported");
});
it("rejects unrelated changes and incomplete selected-track edits",()=>{
 const {before,after,plan}=fixture();after.mobs[0]!.name="Unexpected rename";expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("exact requested trim");
 after.mobs[0]!.name="Keep name";after.mobs[0]!.tracks[1]=structuredClone(before.mobs[0]!.tracks[1]!);expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("exact requested trim");
});
it("does not ignore an added descriptive-metadata track during an otherwise exact trim",()=>{
 const {before,after,plan}=fixture();
 const changed={...after,mobs:after.mobs.map((mob,index)=>index?mob:{...mob,tracks:[...mob.tracks,{ordinal:2,index:1,mediaKind:"DescriptiveMetadata",nodes:[{kind:"FILL",timelineStart:0,timelineEnd:120}]}]})};
 expect(()=>verifySavedDualRollerTrim(before,changed,plan)).toThrow("exact requested trim");
});
it("rejects wrong incoming source offsets and empty results",()=>{
 const {before,after,plan}=fixture();after.mobs[0]!.tracks[0]!.nodes[1]!.sourceStart--;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("exact requested trim");
 before.mobs[0]!.tracks[0]!.nodes[1]!.timelineEnd=61;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("empty a clip");
});
it("refuses mixed-rate source offsets",()=>{const {before,after,plan}=fixture();before.mobs[1]!.rate=24;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("mixed-rate");});
it.each([0,1])("refuses unqualified nonzero origin for mob %s even for an otherwise exact edit",index=>{
 const {before,after,plan}=fixture();
 for(const graph of [before,after]){const m=graph.mobs[index]!;Object.assign(m,{sourceBounds:{start:90,end:90+m.duration}});}
 expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow(/Nonzero .* origin/);
});
it("validates declared source bounds and accepts explicit zero origins",()=>{
 const {before,after,plan}=fixture();
 for(const graph of [before,after])for(const m of graph.mobs)Object.assign(m,{sourceBounds:{start:0,end:m.duration}});
 expect(verifySavedDualRollerTrim(before,after,plan).verified).toBe(true);
 Object.assign(before.mobs[1]!,{sourceBounds:{start:0,end:9999}});
 expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("bounds disagree");
});
it("reports exact declared source intervals in both directions",()=>{
 const {before,after,plan}=fixture();const result=verifySavedDualRollerTrim(before,after,plan);
 expect(result.declaredSourceBounds.slice(0,2)).toEqual([
  {trackOrdinal:0,side:"outgoing",sourceMobId:"source",sourceTrackId:1,sourceTrackOrdinal:0,mediaKind:"picture",sourceDuration:10000,before:{start:2850,end:2910},after:{start:2850,end:2911}},
  {trackOrdinal:0,side:"incoming",sourceMobId:"source",sourceTrackId:1,sourceTrackOrdinal:0,mediaKind:"picture",sourceDuration:10000,before:{start:3300,end:3360},after:{start:3301,end:3360}},
 ]);
 const inverse=verifySavedDualRollerTrim(after,before,{...plan,cut:61,delta:-1});expect(inverse.declaredSourceBounds[0]!.after).toEqual(result.declaredSourceBounds[0]!.before);
});
it("distinguishes picture and sound tracks sharing the same numeric source index",()=>{
 const {before,after,plan}=fixture();const bounds=verifySavedDualRollerTrim(before,after,plan).declaredSourceBounds;
 expect(bounds.map(b=>[b.mediaKind,b.sourceTrackOrdinal])).toEqual([["picture",0],["picture",0],["sound",1],["sound",1]]);
});
it("refuses missing and ambiguous source tracks instead of using overall mob duration",()=>{
 for(const duplicate of [false,true]){
  const {before,after,plan}=fixture();const source=before.mobs[1]!;if(duplicate)source.tracks.push(structuredClone(source.tracks[0]!));else source.tracks.shift();
  expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("Missing or ambiguous declared source track");
 }
});
it.each([1,-1] as const)("rejects a one-frame extension into a source-track gap in direction %s",delta=>{
 const {before,after,plan}=fixture();for(const graph of [before,after]){
  const track=graph.mobs[1]!.tracks[0]!,base=track.nodes[0]!;track.nodes=[{...base,timelineEnd:2910},{...base,timelineStart:3300}];
 }
 if(delta===-1)for(const track of after.mobs[0]!.tracks){track.nodes[0]!.timelineEnd=59;track.nodes[1]!.timelineStart=59;track.nodes[1]!.sourceStart=3299;}
 expect(()=>verifySavedDualRollerTrim(before,after,{...plan,delta})).toThrow("source-track coverage");
});
it("accepts continuous direct source coverage across adjacent declared nodes",()=>{
 const {before,after,plan}=fixture();for(const graph of [before,after]){const track=graph.mobs[1]!.tracks[0]!,base=track.nodes[0]!;track.nodes=[{...base,timelineEnd:2900},{...base,timelineStart:2900}];}
 expect(verifySavedDualRollerTrim(before,after,plan).verified).toBe(true);
});
it("refuses selected filler, opaque coverage and overlapping source-track nodes",()=>{
 for(const mode of ["FILL","opaque","overlap"]){
  const {before,after,plan}=fixture(),track=before.mobs[1]!.tracks[0]!;
  if(mode==="FILL")track.nodes[0]!.kind="FILL";
  else if(mode==="opaque")Object.assign(track.nodes[0]!,{opaque:true});
  else track.nodes.push({...track.nodes[0]!,timelineStart:2000,timelineEnd:4000});
  expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow(/source.track/);
 }
});
it("refuses exhausted outgoing declared duration even when the graph is the requested edit",()=>{
 const {before,after,plan}=fixture();for(const value of [before,after])for(const track of value.mobs[0]!.tracks)track.nodes[0]!.sourceStart=9940;
 expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("declared source bounds");
});
it("refuses invalid baseline source ends and unsafe interval arithmetic",()=>{
 for(const offset of [9990,Number.MAX_SAFE_INTEGER-20]){
  const {before,after,plan}=fixture();for(const value of [before,after])for(const track of value.mobs[0]!.tracks)track.nodes[1]!.sourceStart=offset+(value===after?1:0);
  expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("declared source bounds");
 }
});
