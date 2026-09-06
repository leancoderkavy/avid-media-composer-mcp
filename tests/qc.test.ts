import {it,expect} from "vitest";
import {parseQcLog,qcOptions,qcVideoFrames} from "../src/library/qc.js";

it('preserves an open black start without inventing an end or minimum duration',()=>{
 expect(parseQcLog('lavfi.black_start=2\n',10,12.5).blackOpenAtProcessingEnd).toMatchObject({start:12,end:null,minimumDurationVerified:false});
 expect(parseQcLog('lavfi.black_start=0\nlavfi.black_end=1\n',10,12.5).blackOpenAtProcessingEnd).toBeNull();
 expect(parseQcLog('lavfi.black_start=0\nlavfi.black_end=1\nlavfi.black_start=2\n',10,12.5).blackOpenAtProcessingEnd?.start).toBe(12);
 for(const time of ['-1','3','1e999'])expect(()=>parseQcLog(`lavfi.black_start=${time}\n`,10,12.5)).toThrow('outside');
});
it("requires a positive frame count in the terminal progress block, never an earlier count",()=>{
  expect(qcVideoFrames('frame=1\nprogress=continue\nframe= 120\nfps=30\nprogress=end\n')).toBe(120);
  for(const progress of ['frame=120\nprogress=continue\nprogress=end','frame=120\nprogress=continue','frame=0\nprogress=end','frame=1.5\nprogress=end','frame=99999999999999999\nprogress=end','frame=10\nframe=11\nprogress=end','frame=10\nprogress=end\nframe=11'])expect(()=>qcVideoFrames(progress)).toThrow(/incomplete/);
});
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

it("distinguishes measured silence from empty or missing sample coverage",()=>{
  expect(parseQcLog('Number of samples: 48000\n',0,4).audioSamplesPerChannel).toBe(48000);
  expect(parseQcLog('Number of samples: 0\n',3,4).audioSamplesPerChannel).toBe(0);
  for(const log of ['', 'Number of samples: NaN\n','Number of samples: 1.5\n','Number of samples: 99999999999999999999\n'])expect(parseQcLog(log,0,4).audioSamplesPerChannel).toBeNull();
});

it("selects absolute stream indices, allows single-type analysis, and rejects missing or wrong-type selections",async()=>{
  const {selectQcStreams}=await import("../src/library/qc.js");
  const streams=[{index:0,codec_type:"video"},{index:1,codec_type:"video"},{index:2,codec_type:"audio"},{index:3,codec_type:"audio"}];
  expect(selectQcStreams(streams,{})).toEqual({video:streams[0],audio:streams[2]});
  expect(selectQcStreams(streams,{videoStream:1,audioStream:3})).toEqual({video:streams[1],audio:streams[3]});
  expect(selectQcStreams(streams,{videoStream:null,audioStream:3})).toEqual({video:undefined,audio:streams[3]});
  expect(()=>selectQcStreams(streams,{videoStream:3})).toThrow(/wrong type/);
  expect(()=>selectQcStreams(streams,{audioStream:9})).toThrow(/unavailable/);
  expect(()=>selectQcStreams(streams,{videoStream:null,audioStream:null})).toThrow(/No audio or video/);
  expect(()=>qcOptions.parse({end:5,videoStream:-1})).toThrow();
});

it("reports declared stream characteristics without inferring absent values or exposing arbitrary tags",async()=>{
  const {qcStreamDetails}=await import("../src/library/qc.js");
  const details=qcStreamDetails({index:2,codec_type:"video",pix_fmt:"yuv420p10le",color_transfer:"smpte2084",color_primaries:"bt2020",color_range:"tv",tags:{comment:"private"}});
  expect(details).toMatchObject({index:2,pix_fmt:"yuv420p10le",color_transfer:"smpte2084",color_primaries:"bt2020",color_range:"tv",bits_per_raw_sample:null});
  expect(details).not.toHaveProperty("tags");expect(qcStreamDetails(undefined)).toBeNull();
});
