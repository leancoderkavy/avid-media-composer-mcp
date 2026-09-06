import {it,expect} from "vitest";
import {parseAudioTiming,audioTimingSchema} from "../src/library/audio-timing.js";
const line=(n:number,pts:number,amount=1024,rate=48000)=>`[Parsed_ashowinfo_5 @ addr] n:${n} pts:${pts} pts_time:0 fmt:s16 channels:2 chlayout:stereo rate:${rate} nb_samples:${amount} checksum:abc`;
it("accounts for adjacent gaps and overlaps without mistaking sample sums for presentation span",()=>{
 expect(parseAudioTiming([line(0,0),line(1,1100),line(2,2000,500)].join('\n'),48000)).toEqual({frames:3,sampleRate:48000,samples:2548,firstPts:0,endPts:2500,gapSamples:76,overlapSamples:124,discontinuities:2});
});
it("preserves negative initial ticks and reports repeated overlapping frames",()=>{
 expect(parseAudioTiming([line(0,-1),line(1,-1)].join('\n'),48000)).toMatchObject({firstPts:-1,endPts:1023,samples:2048,overlapSamples:1024,discontinuities:1});
});
it("refuses missing, truncated, reordered, changed-rate and unsafe observations",()=>{
 for(const log of ['',line(1,0),line(0,0)+'\n'+line(2,1024),line(0,0,1024,44100),line(0,Number.MAX_SAFE_INTEGER),line(0,0).replace('pts:0','pts:NOPTS'),line(0,0,0)])expect(()=>parseAudioTiming(log,48000)).toThrow();
});
it("rejects inconsistent persisted accounting",()=>{
 const value=parseAudioTiming(line(0,0),48000);
 expect(()=>audioTimingSchema.parse({...value,gapSamples:1})).toThrow();
 expect(()=>audioTimingSchema.parse({...value,discontinuities:1})).toThrow();
});
