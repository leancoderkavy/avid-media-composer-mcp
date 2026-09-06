import {it,expect} from "vitest";
import {verifySavedDualRollerTrim} from "../src/native/trim-verifier.js";
function fixture(){
 const clip=(start:number,end:number,sourceStart:number)=>({kind:"SCLP",timelineStart:start,timelineEnd:end,sourceStart,sourceMobId:"source",sourceTrackId:1});
 const before={schema:1,complete:true,warnings:[],mobs:[{mobId:"seq",mobType:"CompositionMob",rate:30,duration:120,name:"Keep name",tracks:[{ordinal:0,mediaKind:"picture",nodes:[clip(0,60,2850),clip(60,120,3300)]},{ordinal:1,mediaKind:"sound",nodes:[clip(0,60,2850),clip(60,120,3300)]}]}]};
 before.mobs.push({mobId:"source",mobType:"MasterMob",rate:30,duration:10000,name:"Source",tracks:[]});
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
it("rejects wrong incoming source offsets and empty results",()=>{
 const {before,after,plan}=fixture();after.mobs[0]!.tracks[0]!.nodes[1]!.sourceStart--;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("exact requested trim");
 before.mobs[0]!.tracks[0]!.nodes[1]!.timelineEnd=61;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("empty a clip");
});
it("refuses mixed-rate source offsets",()=>{const {before,after,plan}=fixture();before.mobs[1]!.rate=24;expect(()=>verifySavedDualRollerTrim(before,after,plan)).toThrow("mixed-rate");});
