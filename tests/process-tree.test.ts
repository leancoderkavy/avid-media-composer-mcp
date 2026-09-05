import {EventEmitter} from "node:events";import type {ChildProcess} from "node:child_process";import {it,expect,vi,afterEach} from "vitest";
const mock=vi.hoisted(()=>({spawn:vi.fn()}));vi.mock("node:child_process",()=>({spawn:mock.spawn}));import {terminateWindowsTree} from "../src/process-tree.js";
afterEach(()=>{vi.useRealTimers();mock.spawn.mockReset();});
const owner=()=>({pid:12345,exitCode:null,signalCode:null} as ChildProcess);
it.skipIf(process.platform!=="win32")("targets only the owned live parent and waits for taskkill closure",async()=>{
 vi.useFakeTimers();const killer=Object.assign(new EventEmitter(),{pid:23456,kill:vi.fn()});mock.spawn.mockReturnValue(killer);const result=terminateWindowsTree(owner());expect(mock.spawn).toHaveBeenCalledWith("taskkill.exe",["/PID","12345","/T","/F"],expect.objectContaining({windowsHide:true,shell:false,stdio:"ignore"}));killer.emit("close",0);expect(await result).toEqual({method:"windows-taskkill",succeeded:true});expect(vi.getTimerCount()).toBe(0);
 expect(await terminateWindowsTree({...owner(),exitCode:0} as ChildProcess)).toMatchObject({succeeded:false});expect(mock.spawn).toHaveBeenCalledTimes(1);
});
it.skipIf(process.platform!=="win32")("retains uncertainty for failed and timed-out tree termination",async()=>{
 vi.useFakeTimers();const killer=Object.assign(new EventEmitter(),{pid:23456,kill:vi.fn()});mock.spawn.mockReturnValue(killer);let finished=false;const result=terminateWindowsTree(owner())!.then(value=>{finished=true;return value;});await vi.advanceTimersByTimeAsync(5000);expect(killer.kill).toHaveBeenCalledWith("SIGKILL");expect(finished).toBe(false);killer.emit("close",0);expect(await result).toMatchObject({succeeded:false,reason:"Tree termination timed out"});expect(vi.getTimerCount()).toBe(0);
});
it.skipIf(process.platform!=="win32")("handles missing taskkill without claiming tree termination",async()=>{
 const killer=Object.assign(new EventEmitter(),{pid:undefined,kill:vi.fn()});mock.spawn.mockReturnValue(killer);const result=terminateWindowsTree(owner());killer.emit("error",new Error("missing"));expect(await result).toMatchObject({succeeded:false});
});
