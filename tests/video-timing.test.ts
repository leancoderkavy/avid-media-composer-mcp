import {it,expect} from 'vitest';
import {parseVideoTiming,videoTimingSchema} from '../src/library/video-timing.js';
const log=(pts:number[])=>'[Parsed_showinfo_2] config in time_base: 1/1000, frame_rate: 30/1\n'+pts.map((p,n)=>`[Parsed_showinfo_2] n: ${n} pts: ${p} pts_time:0 fmt:yuv420p\n[Parsed_showinfo_2] color_range:tv`).join('\n');
it('records exact PTS step extrema, duplicates and backwards steps without assuming durations',()=>{
 expect(parseVideoTiming(log([0,33,33,20,80]))).toEqual({frames:5,timeBase:{num:1,den:1000},firstPts:0,lastPts:80,duplicateSteps:1,backwardSteps:1,minDelta:-13,maxDelta:60});
 expect(parseVideoTiming(log([-10]))).toMatchObject({frames:1,firstPts:-10,lastPts:-10,minDelta:null,maxDelta:null});
});
it('rejects missing, reordered, unsafe and ambiguous observations',()=>{
 for(const text of ['',log([]),log([0,1]).replace('n: 1','n: 2'),log([0]).replace('pts: 0','pts: NOPTS'),log([0]).replace('1/1000','0/1000'),log([0])+log([1]),log([Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER])])expect(()=>parseVideoTiming(text)).toThrow();
});
it('validates persisted counter and extrema consistency',()=>{
 const good=parseVideoTiming(log([0,1]));
 for(const patch of [{duplicateSteps:2},{minDelta:2},{minDelta:null},{backwardSteps:1}])expect(videoTimingSchema.safeParse({...good,...patch}).success).toBe(false);
});
