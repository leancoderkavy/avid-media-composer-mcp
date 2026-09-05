import {it,expect} from "vitest";
import {alignSpeakerSegment} from "../src/library/speaker-alignment.js";
it("unions duplicate intervals for the same speaker without inventing simultaneous voices",()=>{
  const value=alignSpeakerSegment({start:0,end:4},{start:0,end:4},[{start:0,end:2,speaker:"a"},{start:1,end:3,speaker:"a"}]);expect(value).toMatchObject({status:"single_candidate",speechSeconds:3,uncoveredSeconds:1,simultaneousSpeakerSeconds:0,candidates:[{speaker:"a",overlapSeconds:3,fractionOfSegment:0.75}]});
});
it("separates sequential candidates from genuinely simultaneous intervals",()=>{
  const sequential=alignSpeakerSegment({start:0,end:4},{start:0,end:4},[{start:0,end:2,speaker:"a"},{start:2,end:4,speaker:"b"}]);expect(sequential).toMatchObject({status:"multiple_candidates",speechSeconds:4,simultaneousSpeakerSeconds:0});
  const overlap=alignSpeakerSegment({start:0,end:4},{start:0,end:4},[{start:0,end:3,speaker:"a"},{start:1,end:4,speaker:"b"}]);expect(overlap).toMatchObject({status:"overlapping_candidates",speechSeconds:4,simultaneousSpeakerSeconds:2});expect(overlap.candidates.map(value=>value.overlapSeconds)).toEqual([3,3]);
});
it("distinguishes out-of-range time from uncovered analyzed time and ignores boundary-only contact",()=>{
  const value=alignSpeakerSegment({start:0,end:6},{start:2,end:5},[{start:1,end:2,speaker:"outside"},{start:3,end:4,speaker:"inside"},{start:5,end:6,speaker:"outside"}]);expect(value).toMatchObject({status:"single_candidate",analyzedSeconds:3,outsideAnalysisSeconds:3,speechSeconds:1,uncoveredSeconds:2});expect(value.candidates).toHaveLength(1);
  expect(alignSpeakerSegment({start:0,end:1},{start:0,end:1},[])).toMatchObject({status:"no_speech_overlap",candidates:[],uncoveredSeconds:1});
});
it("reports truncated candidate lists while retaining coverage across every candidate",()=>{
  const value=alignSpeakerSegment({start:0,end:4},{start:0,end:4},[{start:0,end:1,speaker:"a"},{start:1,end:3,speaker:"b"},{start:3,end:4,speaker:"c"}],1);expect(value).toMatchObject({status:"multiple_candidates",candidatesTruncated:true,totalCandidates:3,speechSeconds:4,candidates:[{speaker:"b",overlapSeconds:2}]});
});
