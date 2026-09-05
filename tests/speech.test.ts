import {mkdtemp,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {SpeechAnalysis,loadSpeechModel} from "../src/library/speech.js";
import {speechModels,speechOptions} from "../src/library/speech-options.js";
import {jobSchema} from "../src/library/jobs.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {loadConfig} from "../src/config.js";
const mocks=vi.hoisted(()=>({infer:vi.fn(),pipeline:vi.fn(),dispose:vi.fn()}));
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({pipeline:mocks.pipeline})}));
vi.mock("../src/process.js",()=>({runProcess:async(_exe:string,args:string[])=>{await writeFile(args.at(-1)!,Buffer.alloc(16000*4));return {exitCode:0};}}));
beforeEach(()=>{vi.clearAllMocks();mocks.infer.mockResolvedValue({chunks:[{timestamp:[0.2,0.8],text:"Bonjour le monde."}]});mocks.pipeline.mockResolvedValue(Object.assign(mocks.infer,{dispose:mocks.dispose}));});
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-speech-")),source=path.join(root,"source.mp4");await writeFile(source,"fixture");const id=await sha256File(source);
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,export,project-write"});
  const library=new MediaLibrary(config),directory=await library.directory();
  await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:20}},transcript:[]}));return {config,id,source};
}
it("pins selected weights and disables implicit downloads",async()=>{
  await loadSpeechModel("cache",false,"tiny");expect(mocks.pipeline).toHaveBeenCalledWith("automatic-speech-recognition",speechModels.tiny.model,expect.objectContaining({revision:speechModels.tiny.revision,local_files_only:true}));
  await loadSpeechModel("cache",true,"tiny.en");expect(mocks.pipeline).toHaveBeenLastCalledWith("automatic-speech-recognition",speechModels["tiny.en"].model,expect.objectContaining({local_files_only:false}));
});
it("retains source timing and language provenance for direct multilingual transcription",async()=>{
  const {config,id}=await fixture(),speech=new SpeechAnalysis(config);const result=await speech.transcribe(id,10,11,{model:"tiny",language:"fr"});
  expect(mocks.infer).toHaveBeenCalledWith(expect.any(Float32Array),expect.objectContaining({language:"fr",task:"transcribe"}));
  expect(result).toMatchObject({language:"fr",modelRevision:speechModels.tiny.revision,languageDetectionVerified:false,segments:[{start:10.2,end:10.8,text:"Bonjour le monde."}]});
  const fallback=await speech.transcribe(id,10,11,{model:"tiny",language:"auto"});expect(mocks.infer.mock.calls.at(-1)![1]).toHaveProperty("language","en");
  expect(fallback).toMatchObject({language:"en",languageRequested:"auto",languageSelection:"english_fallback",languageDetectionSupported:false,languageDetectionVerified:false});expect(fallback.note).toContain("English was used");
  expect(mocks.pipeline).toHaveBeenCalledTimes(1);await speech.dispose();expect(mocks.dispose).toHaveBeenCalledTimes(1);
});
it("rejects unsupported model/language combinations before work and preserves old job defaults",async()=>{
  expect(()=>speechOptions.parse({model:"tiny.en",language:"fr"})).toThrow();expect(()=>speechOptions.parse({model:"tiny",language:"invented"})).toThrow();
  expect(jobSchema.parse({kind:"speech",id:"a".repeat(64),start:0,end:1})).toMatchObject({options:{model:"tiny.en",language:"auto"}});
  expect(()=>jobSchema.parse({kind:"speech",id:"a".repeat(64),start:0,end:1,options:{model:"tiny.en",language:"es"}})).toThrow();
  const {config,id}=await fixture();await expect(new SpeechAnalysis(config).transcribe(id,0,1,{model:"tiny.en",language:"fr"})).rejects.toThrow();expect(mocks.pipeline).not.toHaveBeenCalled();
});
it("rejects changed sources before inference",async()=>{
  const {config,id,source}=await fixture();await writeFile(source,"changed");await expect(new SpeechAnalysis(config).transcribe(id,0,1,{model:"tiny",language:"es"})).rejects.toThrow("changed");expect(mocks.pipeline).not.toHaveBeenCalled();
});
