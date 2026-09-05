import {it,expect,vi,afterEach} from "vitest";const mock=vi.hoisted(()=>({run:vi.fn()}));vi.mock("../src/process.js",()=>({runProcess:mock.run}));import {assertSpeakerStopped} from "../src/library/speaker-cleanup.js";
const owner={schema:1 as const,analysisId:"12345678-1234-4234-8234-123456789abc",id:"a".repeat(64),pid:12345,executables:["node.exe","python.exe"]};afterEach(()=>{vi.restoreAllMocks();mock.run.mockReset();});
it.skipIf(process.platform!=="win32")("requires absent owner and excludes its own process-query command",async()=>{
 vi.spyOn(process,"kill").mockImplementation(()=>{throw Object.assign(new Error("absent"),{code:"ESRCH"});});mock.run.mockResolvedValue({exitCode:0,stdout:"0",stderr:""});await assertSpeakerStopped("D:\\owned\\run",owner);expect(mock.run.mock.calls[0]![1].at(-1)).toContain("$_.ProcessId -ne $PID");
 mock.run.mockResolvedValueOnce({exitCode:0,stdout:"1",stderr:""});await expect(assertSpeakerStopped("D:\\owned\\run",owner)).rejects.toThrow("references");mock.run.mockResolvedValueOnce({exitCode:1,stdout:"",stderr:"denied"});await expect(assertSpeakerStopped("D:\\owned\\run",owner)).rejects.toThrow("unavailable");
});
it.skipIf(process.platform!=="win32")("does not infer termination from a live or inaccessible owner",async()=>{
 const kill=vi.spyOn(process,"kill").mockReturnValue(true);await expect(assertSpeakerStopped("D:\\owned\\run",owner)).rejects.toThrow("still present");kill.mockImplementation(()=>{throw Object.assign(new Error("denied"),{code:"EPERM"});});await expect(assertSpeakerStopped("D:\\owned\\run",owner)).rejects.toThrow("denied");expect(mock.run).not.toHaveBeenCalled();
});
it.skipIf(process.platform!=="win32")("refuses the actual current process as an active owner",async()=>{await expect(assertSpeakerStopped("D:\\owned\\run",{...owner,pid:process.pid})).rejects.toThrow("still present");expect(mock.run).not.toHaveBeenCalled();});
