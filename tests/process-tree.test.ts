import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {afterEach,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock("node:child_process",()=>({spawn:mock.spawn}));
import {classifyTaskkillOutput,terminateWindowsTree} from "../src/process-tree.js";

afterEach(()=>{vi.useRealTimers();mock.spawn.mockReset();});

it("counts terminated root and descendant processes without retaining any text",()=>{
 const output=[
  "SUCCESS: The process with PID 400 (child process of PID 300) has been terminated.",
  "SUCCESS: The process with PID 300 (child process of PID 200) has been terminated.",
 ].join("\r\n");
 expect(classifyTaskkillOutput(output,300)).toEqual({terminated:2,notFound:0,accessDenied:0,unclassified:0,rootNotFound:false,truncated:false});
});

it("reports a missing root process separately from missing descendants",()=>{
 expect(classifyTaskkillOutput('ERROR: The process "300" not found.',300)).toMatchObject({notFound:1,rootNotFound:true,terminated:0});
 expect(classifyTaskkillOutput('ERROR: The process "999" not found.',300)).toMatchObject({notFound:1,rootNotFound:false});
});

it("counts refused terminations by their reason line, not the announcement line",()=>{
 const output="ERROR: The process with PID 400 (child process of PID 300) could not be terminated.\r\nReason: Access is denied.\r\n";
 expect(classifyTaskkillOutput(output,300)).toMatchObject({accessDenied:1,notFound:0,unclassified:0});
 const gone="ERROR: The process with PID 400 (child process of PID 300) could not be terminated.\r\nReason: There is no running instance of the task.\r\n";
 expect(classifyTaskkillOutput(gone,300)).toMatchObject({accessDenied:0,notFound:1,unclassified:0});
});

it("counts unrecognized non-empty lines instead of guessing localized meaning",()=>{
 expect(classifyTaskkillOutput("ERFOLGREICH: Der Prozess mit PID 300 wurde beendet.\n\n  \n",300)).toMatchObject({unclassified:1,terminated:0,truncated:false});
});

it("marks classification truncated beyond the bounded line budget",()=>{
 const lines=Array.from({length:2001},(_,index)=>`SUCCESS: The process with PID ${index+1000} (child process of PID 300) has been terminated.`).join("\n");
 const outcome=classifyTaskkillOutput(lines,300);
 expect(outcome.truncated).toBe(true);expect(outcome.terminated).toBe(2000);
});

it("retains the classified taskkill outcome on the termination receipt",async()=>{
 vi.useFakeTimers();
 const platform=Object.getOwnPropertyDescriptor(process,"platform")!;Object.defineProperty(process,"platform",{value:"win32",configurable:true});
 try{
 const child=Object.assign(new EventEmitter(),{pid:300,exitCode:null,signalCode:null,kill:vi.fn()});
 const killer=Object.assign(new EventEmitter(),{pid:23456,stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn().mockReturnValue(false)});
 mock.spawn.mockReturnValueOnce(killer);
 const pending=terminateWindowsTree(child as never)!;
 killer.stdout.emit("data",Buffer.from('ERROR: The process "300" not found.\r\n'));
 killer.emit("close",128);
 expect(await pending).toEqual({method:"windows-taskkill",succeeded:false,reason:"Tree termination did not report success",exitCode:128,outcome:{terminated:0,notFound:1,accessDenied:0,unclassified:0,rootNotFound:true,truncated:false}});
 expect(mock.spawn).toHaveBeenCalledWith("taskkill.exe",["/PID","300","/T","/F"],expect.objectContaining({stdio:["ignore","pipe","pipe"]}));
 }finally{Object.defineProperty(process,"platform",platform);}
});

it("returns undefined on non-Windows hosts instead of claiming tree termination",()=>{
 const platform=Object.getOwnPropertyDescriptor(process,"platform")!;Object.defineProperty(process,"platform",{value:"darwin",configurable:true});
 try{expect(terminateWindowsTree({pid:1,exitCode:null,signalCode:null} as never)).toBeUndefined();expect(mock.spawn).not.toHaveBeenCalled();}
 finally{Object.defineProperty(process,"platform",platform);}
});

it("counts a refusal announcement without a reason line as unclassified rather than dropping it",()=>{
 expect(classifyTaskkillOutput("ERROR: The process with PID 400 (child process of PID 300) could not be terminated.\n",300)).toMatchObject({unclassified:1,accessDenied:0,notFound:0});
 expect(classifyTaskkillOutput("ERROR: The process with PID 400 (child process of PID 300) could not be terminated.\nSUCCESS: The process with PID 300 has been terminated.\n",300)).toMatchObject({unclassified:1,terminated:1});
});
