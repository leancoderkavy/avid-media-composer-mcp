import {it,expect} from "vitest";
import {parseShotLog,shotOptions} from "../src/library/shots.js";
it("maps cuts into source time and contiguous half-open intervals",()=>{
  const result=parseShotLog('lavfi.scd.score: 80, lavfi.scd.time: 2\nlavfi.scd.score: 40, lavfi.scd.time: 4',10,16);
  expect(result.cuts).toEqual([{time:12,score:80},{time:14,score:40}]);
  expect(result.shots).toEqual([{index:0,start:10,end:12,representativeSeconds:11},{index:1,start:12,end:14,representativeSeconds:13},{index:2,start:14,end:16,representativeSeconds:15}]);
});
it("deduplicates cuts, excludes range edges, and applies explicit minimum gap",()=>{
  const log=[0,1,1,1.2,3.9,4].map(time=>`lavfi.scd.score: 20, lavfi.scd.time: ${time}`).join('\n');
  expect(parseShotLog(log,0,4,0.5).cuts).toEqual([{time:1,score:20}]);
  expect(parseShotLog('',0,4).shots).toHaveLength(1);
});
it("rejects invalid ranges and detector options",()=>{
  for(const options of [{end:3601},{start:3,end:2},{end:2,threshold:0},{end:2,minimumGap:-1}])expect(()=>shotOptions.parse(options)).toThrow();
});
