import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {afterEach,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock("node:child_process",()=>({spawn:mock.spawn}));
import {runProcess} from "../src/process.js";

afterEach(()=>{vi.useRealTimers();mock.spawn.mockReset();});
function fixture(){
 vi.useFakeTimers();
 const child=Object.assign(new EventEmitter(),{pid:12345,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
 const killer=Object.assign(new EventEmitter(),{pid:23456,kill:vi.fn().mockReturnValue(false)});
 mock.spawn.mockReturnValueOnce(child).mockReturnValueOnce(killer);
 let settled=false;
 const result=runProcess("owned-fixture",[],{timeoutMs:100}).then(value=>{settled=true;return value;},error=>{settled=true;return error;});
 return {child,killer,result,settled:()=>settled};
}
it.skipIf(process.platform!=="win32")("returns timeout evidence when the worker closes but taskkill never does",async()=>{
 const run=fixture();await vi.advanceTimersByTimeAsync(100);run.child.emit("close",1);
 expect(run.settled()).toBe(false);await vi.advanceTimersByTimeAsync(4999);expect(run.settled()).toBe(false);
 await vi.advanceTimersByTimeAsync(1);
 expect(await run.result).toMatchObject({code:"PROCESS_TIMEOUT",details:{treeTermination:{succeeded:false,reason:expect.stringContaining("descendants unverified")}}});
 expect(run.child.kill).not.toHaveBeenCalled();expect(run.killer.kill).toHaveBeenCalledWith("SIGKILL");expect(vi.getTimerCount()).toBe(0);
 run.killer.emit("close",0);expect((await run.result).details.treeTermination.succeeded).toBe(false);
});
it.skipIf(process.platform!=="win32")("does not confuse the helper deadline with worker closure",async()=>{
 const run=fixture();await vi.advanceTimersByTimeAsync(5100);
 expect(run.settled()).toBe(false);expect(run.child.kill).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(1000);expect(run.child.kill).toHaveBeenLastCalledWith("SIGKILL");expect(run.settled()).toBe(false);
 run.child.emit("close",1);
 expect(await run.result).toMatchObject({code:"PROCESS_TIMEOUT",details:{treeTermination:{succeeded:false}}});expect(vi.getTimerCount()).toBe(0);
});
