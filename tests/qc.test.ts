import {it,expect} from "vitest";
import {parseQcLog,qcOptions} from "../src/library/qc.js";
it("maps detector timestamps into source ranges and closes an unfinished freeze at the range boundary",()=>{
  const result=parseQcLog('black_start:0 black_end:1.966667\nfreeze_start: 0\nfreeze_end: 2\nfreeze_start: 4\nsilence_start: 0\nsilence_end: 2 | silence_duration: 2\nVFR:nan (0/0)\nVFR:0.000000 (0/179)',10,16);
  expect(result.black[0]).toEqual({start:10,end:11.966667});expect(result.freeze).toEqual([{start:10,end:12},{start:14,end:16,openAtRangeEnd:true}]);
  expect(result.silence).toEqual([{start:10,end:12}]);expect(result.frameTiming?.constantIntervals).toBe(179);
});
it("preserves silence's nonfinite loudness as explicit raw values, not false numeric levels",()=>{
  const result=parseQcLog('{"input_i":"-inf","input_tp":"-inf","input_lra":"0.0"}',0,3);
  expect(result.loudness).toMatchObject({integratedLufs:null,truePeakDbtp:null,integratedRaw:"-inf",loudnessRangeLu:0});
  expect(parseQcLog('',0,3).frameTiming).toBeNull();expect(parseQcLog('',0,3).loudness).toBeNull();
});
it("rejects oversized ranges and invalid detector parameters",()=>{
  expect(()=>qcOptions.parse({end:601})).toThrow();expect(()=>qcOptions.parse({start:3,end:2})).toThrow();
  expect(()=>qcOptions.parse({end:5,silenceDb:2})).toThrow();expect(()=>qcOptions.parse({end:5,freezeNoise:-1})).toThrow();
});
