import {mkdtemp,writeFile,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,beforeEach} from "vitest";
import {SpeechAnalysis,loadSpeechModel} from "../src/library/speech.js";
import {speechModels,speechOptions} from "../src/library/speech-options.js";
import {jobSchema} from "../src/library/jobs.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {loadConfig} from "../src/config.js";
const mocks=vi.hoisted(()=>({infer:vi.fn(),pipeline:vi.fn(),dispose:vi.fn(),generate:vi.fn()}));
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({pipeline:mocks.pipeline,Tensor:class{constructor(public type:string,public data:BigInt64Array,public dims:number[]){}}})}));
vi.mock("../src/process.js",()=>({runProcess:async(_exe:string,args:string[])=>{await writeFile(args.at(-1)!,Buffer.alloc(Number(args[args.indexOf("-t")+1])*16000*4));return {exitCode:0};}}));
beforeEach(()=>{
  vi.resetAllMocks();const generator={generate:mocks.generate};
  mocks.generate.mockResolvedValue({type:"int64",dims:[1,2],data:BigInt64Array.from([1n,2n])});
  mocks.infer.mockImplementation(async(samples:Float32Array,settings:Record<string,unknown>)=>{
    const count=1+Math.ceil(Math.max(0,samples.length-480000)/320000);
    for(let i=0;i<count;i++)await generator.generate({inputs:{type:"float32",dims:[1,1,1],data:Float32Array.from([i])},...settings});
    return {chunks:[{timestamp:[0.2,0.8],text:"Bonjour le monde."}]};
  });
  mocks.pipeline.mockResolvedValue(Object.assign(mocks.infer,{dispose:mocks.dispose,model:generator}));
});
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-speech-")),source=path.join(root,"source.mp4");await writeFile(source,"fixture");const id=await sha256File(source);
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,export,project-write"});
  const library=new MediaLibrary(config),directory=await library.directory();
  await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:90}},transcript:[]}));return {config,id,source};
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
it("resumes committed tokens after failure and preserves the parent and model method",async()=>{
  const {config,id}=await fixture(),speech=new SpeechAnalysis(config);
  mocks.generate.mockResolvedValueOnce({type:"int64",dims:[1,2],data:BigInt64Array.from([1n,2n])}).mockRejectedValueOnce(new Error("stop"));
  await expect(speech.transcribe(id,0,65)).rejects.toMatchObject({code:"SPEECH_INCOMPLETE"});
  expect((await mocks.pipeline.mock.results[0]!.value).model.generate).toBe(mocks.generate);
  const parent=(await speech.checkpoints.list(id)).runs[0]!;expect(parent).toMatchObject({state:"partial",completedWindows:1});
  const directory=await new MediaLibrary(config).directory(),file=path.join(directory,`speech-run-${parent.runId}`,"0.json"),before=await readFile(file,"utf8");
  await expect(speech.checkpoints.append(parent.runId,0,JSON.parse(before))).rejects.toMatchObject({code:"EEXIST"});
  const result=await new SpeechAnalysis(config).resume(parent.runId);expect(result).toMatchObject({reusedWindows:1,completedWindows:3,parentRunId:parent.runId});expect(await readFile(file,"utf8")).toBe(before);
  expect(await speech.checkpoints.status(result.runId)).toMatchObject({state:"completed"});await expect(speech.resume(result.runId)).rejects.toThrow("completed");
  await writeFile(result.path,"changed");await expect(speech.checkpoints.status(result.runId)).rejects.toThrow("transcript changed");
});
it("rejects changed audio plans, input tokens, source scope and completed checkpoint changes",async()=>{
  const {config,id}=await fixture(),speech=new SpeechAnalysis(config);
  mocks.generate.mockResolvedValueOnce({type:"int64",dims:[1,2],data:BigInt64Array.from([1n,2n])}).mockRejectedValueOnce(new Error("stop"));
  await expect(speech.transcribe(id,0,65)).rejects.toThrow();const parent=(await speech.checkpoints.list(id)).runs[0]!.runId;
  await expect(new SpeechAnalysis({...config,allowedRoots:[]}).resume(parent)).rejects.toThrow();
  const directory=await new MediaLibrary(config).directory(),base=path.join(directory,`speech-run-${parent}`),file=path.join(base,"0.json"),original=await readFile(file,"utf8"),record=JSON.parse(original);
  record.inputHash="0".repeat(64);await writeFile(file,JSON.stringify(record));await expect(speech.resume(parent)).rejects.toThrow("input changed");
  record.tokens=[-1];await writeFile(file,JSON.stringify(record));await expect(speech.resume(parent)).rejects.toThrow();await writeFile(file,original);
  const manifestFile=path.join(base,"manifest.json"),manifest=await readFile(manifestFile,"utf8"),header=JSON.parse(manifest);header.audioHash="0".repeat(64);await writeFile(manifestFile,JSON.stringify(header));await expect(speech.resume(parent)).rejects.toThrow("audio plan changed");await writeFile(manifestFile,manifest);
  const completed=await speech.resume(parent),completedFile=path.join(directory,`speech-run-${completed.runId}`,"0.json");record.inputHash=JSON.parse(original).inputHash;record.tokens=[3];await writeFile(completedFile,JSON.stringify(record));await expect(speech.checkpoints.status(completed.runId)).rejects.toThrow("checkpoints changed");
  await unlink(completedFile);await expect(speech.checkpoints.status(completed.runId)).rejects.toThrow("missing windows");
});
