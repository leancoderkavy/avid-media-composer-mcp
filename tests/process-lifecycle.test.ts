import {EventEmitter} from "node:events";
import {it,expect,vi,afterEach} from "vitest";
const mock=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock("node:child_process",()=>({spawn:mock.spawn}));
import {runProcess} from "../src/process.js";
afterEach(()=>{vi.useRealTimers();mock.spawn.mockReset();});
function child(){const value=Object.assign(new EventEmitter(),{pid:12345,stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn(()=>true)});mock.spawn.mockReturnValue(value);return value;}
it("keeps timeout pending through kill errors and escalation until confirmed close",async()=>{
 vi.useFakeTimers();const worker=child();let finished=false;
 const result=runProcess("fixture",[],{timeoutMs:50}).catch(error=>{finished=true;return error;});
 await vi.advanceTimersByTimeAsync(50);expect(worker.kill).toHaveBeenCalledTimes(1);expect(finished).toBe(false);
 worker.emit("error",Object.assign(new Error("kill denied"),{code:"EPERM"}));await Promise.resolve();expect(finished).toBe(false);
 await vi.advanceTimersByTimeAsync(1000);expect(worker.kill).toHaveBeenLastCalledWith("SIGKILL");expect(finished).toBe(false);
 worker.emit("close",null);expect(await result).toMatchObject({code:"PROCESS_TIMEOUT"});expect(finished).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it("stops retaining overflowing output and rejects only after close",async()=>{
 vi.useFakeTimers();const worker=child();let finished=false;const result=runProcess("fixture",[],{timeoutMs:5000,maxOutputBytes:4}).catch(error=>{finished=true;return error;});
 worker.stdout.emit("data",Buffer.from("overflow"));worker.stderr.emit("data",Buffer.alloc(1000));await Promise.resolve();expect(finished).toBe(false);expect(worker.kill).toHaveBeenCalledTimes(1);
 worker.emit("close",0);expect(await result).toMatchObject({code:"PROCESS_OUTPUT_LIMIT"});expect(vi.getTimerCount()).toBe(0);
});
it("settles a spawn failure without waiting for a nonexistent PID",async()=>{
 vi.useFakeTimers();const worker=child();Object.assign(worker,{pid:undefined});const result=runProcess("missing",[],{timeoutMs:50}).catch(error=>error);worker.emit("error",Object.assign(new Error("missing"),{code:"ENOENT"}));expect(await result).toMatchObject({code:"EXECUTABLE_NOT_FOUND"});expect(worker.kill).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("waits for close when a live child emits an error before a timeout",async()=>{
 vi.useFakeTimers();const worker=child();let finished=false;const result=runProcess("fixture",[],{timeoutMs:5000}).catch(error=>{finished=true;return error;});
 worker.emit("error",Object.assign(new Error("runtime failure"),{code:"EPERM"}));await Promise.resolve();expect(finished).toBe(false);expect(worker.kill).toHaveBeenCalledTimes(1);
 worker.emit("close",1);expect(await result).toMatchObject({code:"PROCESS_RUNTIME_ERROR"});expect(vi.getTimerCount()).toBe(0);
});
