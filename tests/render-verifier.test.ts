import {mkdtemp,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {verifyNativeRender,matchesRenderContract} from "../src/native/render-verifier.js";
import {loadConfig} from "../src/config.js";
const mock=vi.hoisted(()=>({calls:0,probe:{} as any,decode:0,frames:120}));
vi.mock("../src/process.js",()=>({runProcess:async(executable:string)=>{mock.calls++;return {exitCode:executable==="ffprobe"?0:mock.decode,stdout:executable==="ffprobe"?JSON.stringify(mock.probe):`frame=${mock.frames}\nprogress=end\n`,stderr:""};}}));
const expected={videoCodec:"h264",width:1920,height:1080,frames:120,rate:{num:30,den:1},audio:[{codec:"pcm_s24le",channels:1,sampleRate:48000}]};
beforeEach(()=>{mock.calls=0;mock.decode=0;mock.frames=120;mock.probe={streams:[{codec_type:"video",codec_name:"h264",width:1920,height:1080,nb_frames:"120",avg_frame_rate:"30/1",duration:"4"},{codec_type:"audio",codec_name:"pcm_s24le",channels:1,sample_rate:"48000",duration:"4"}]};});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-render-")),file=path.join(root,"render.mp4");return {file,config:loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root})};}
it("waits for delayed output then validates contract and decoding",async()=>{const {file,config}=await fixture();const writer=new Promise<void>(resolve=>setTimeout(()=>{void writeFile(file,"render").then(()=>resolve());},10));const result=await verifyNativeRender(file,config,expected,{timeoutMs:1000,pollMs:5});await writer;expect(result).toMatchObject({decodePassed:true,contractMatched:true,exportRetried:false});expect(mock.calls).toBe(2);});
it("does not equate a stable file with correct channel count or duration",()=>{expect(matchesRenderContract(mock.probe,expected)).toBe(true);mock.probe.streams[1].channels=2;expect(matchesRenderContract(mock.probe,expected)).toBe(false);mock.probe.streams[1].channels=1;delete mock.probe.streams[0].duration;expect(matchesRenderContract(mock.probe,expected)).toBe(false);});
it("leaves missing output unproven without invoking an export",async()=>{const {file,config}=await fixture();await expect(verifyNativeRender(file,config,expected,{timeoutMs:20,pollMs:2})).rejects.toThrow("no export was retried");expect(mock.calls).toBe(0);});
it("rejects owner changes and files outside the output root",async()=>{const {file,config}=await fixture();await writeFile(file,"render");await expect(verifyNativeRender(file,config,expected,{assertOwner:async()=>{throw new Error("Owner changed");}})).rejects.toThrow("Owner changed");const outside=await fixture();await writeFile(outside.file,"outside");await expect(verifyNativeRender(outside.file,config,expected)).rejects.toThrow();expect(mock.calls).toBe(0);});
it("does not accept a file that fails full decoding",async()=>{const {file,config}=await fixture();await writeFile(file,"render");mock.decode=1;await expect(verifyNativeRender(file,config,expected,{timeoutMs:30,pollMs:2})).rejects.toThrow("unproven");});
it("requires actual decoded frame count, even when metadata and exit status look complete",async()=>{const {file,config}=await fixture();await writeFile(file,"render");mock.frames=119;await expect(verifyNativeRender(file,config,expected,{timeoutMs:30,pollMs:2})).rejects.toThrow("unproven");});
