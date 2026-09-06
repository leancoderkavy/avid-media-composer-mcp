import {installModelNotice} from "./model-notices.js";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {modelRuntime} from "./model-runtime.js";
import {speechModels,speechOptions,speechModel,speechLanguageDecision,type SpeechOptions} from "./speech-options.js";
import {SpeechCheckpoints,speechInputHash,speechTokens} from "./speech-checkpoints.js";
import {AvidMcpError} from "../errors.js";
import {rankSpeechLanguages} from "./speech-language.js";
import {speechAudioArguments} from "./speech-audio.js";
import {readBoundedFile} from "../security/bounded-read.js";

export const SPEECH_MODEL=speechModels["tiny.en"].model;
export const SPEECH_REVISION=speechModels["tiny.en"].revision;
export async function loadSpeechModel(cache:string,download=false,selection:keyof typeof speechModels="tiny.en"){
  const selected=speechModels[speechModel.parse(selection)];
  if(download)await installModelNotice(cache,selected.model,selected.revision);
  const {pipeline}=await modelRuntime(cache,download);
  return pipeline("automatic-speech-recognition",selected.model,{cache_dir:cache,revision:selected.revision,local_files_only:!download,dtype:"q8"});
}
export class SpeechAnalysis {
  readonly checkpoints:SpeechCheckpoints;
  private models=new Map<string,ReturnType<typeof loadSpeechModel>>();
  private tail:Promise<unknown>=Promise.resolve();
  private closing=false;
  private disposing:Promise<void>|undefined;
  constructor(private readonly config:ServerConfig){this.checkpoints=new SpeechCheckpoints(config);}
  private serialize<T>(fn:()=>Promise<T>){
    if(this.closing)return Promise.reject(new Error("Speech service is closing"));
    const operation=this.tail.then(fn);this.tail=operation.catch(()=>{});return operation;
  }
  dispose(){this.closing=true;return this.disposing??=(async()=>{await this.tail;const models=[...this.models.values()];this.models.clear();await Promise.all(models.map(async pending=>(await pending).dispose()));})();}
  detectLanguage(id:string,start:number,end:number){return this.serialize(()=>this.detect(id,start,end));}
  private async candidates(samples:Float32Array,selection:"tiny"|"base"="tiny"){
    if(samples.some(value=>!Number.isFinite(value)))throw new Error("Nonfinite audio sample");
    if(samples.every(value=>value===0))return [];
    if(!this.config.modelDirectory)throw new Error("Speech model directory missing");
    if(!this.models.has(selection))this.models.set(selection,loadSpeechModel(this.config.modelDirectory,false,selection).catch(error=>{this.models.delete(selection);throw error;}));
    const model=await this.models.get(selection)!,{Tensor}=await modelRuntime(this.config.modelDirectory),features=await model.processor(samples);
    const generation=model.model.generation_config as {decoder_start_token_id?:number;lang_to_id?:unknown};
    if(!Number.isSafeInteger(generation.decoder_start_token_id)||generation.decoder_start_token_id!<0)throw new Error("Missing language decoder start token");
    const output=await model.model({input_features:features.input_features,decoder_input_ids:new Tensor("int64",BigInt64Array.from([BigInt(generation.decoder_start_token_id!)]),[1,1])});
    return rankSpeechLanguages(output.logits,generation.lang_to_id);
  }
  private async detect(id:string,start:number,end:number){
    requireCapability(this.config.capabilities,"export");
    if(!this.config.modelDirectory)throw new Error("Download multilingual speech weights explicitly and set AVID_MCP_MODEL_DIR");
    const library=new MediaLibrary(this.config),entry=await library.validatedMetadata(id);
    if(!entry||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>Number(entry.metadata.format?.duration)||end-start>30)throw new Error("Language detection range must be within media and at most 30 seconds");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const directory=path.join(await library.directory(),randomUUID());await mkdir(directory);const audio=path.join(directory,"language.f32");
    const extracted=await runProcess(this.config.ffmpegExecutable??"ffmpeg",speechAudioArguments(source,audio,start,end),{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});
    if(extracted.exitCode!==0)throw new Error("Language audio extraction failed");
    const bytes=await readBoundedFile(audio,Math.ceil((end-start)*16000)*4);if(!bytes.length||bytes.length%4)throw new Error("Unexpected language audio buffer");
    const samples=new Float32Array(bytes.length/4);for(let i=0;i<samples.length;i++){samples[i]=bytes.readFloatLE(i*4);if(!Number.isFinite(samples[i]))throw new Error("Nonfinite audio sample");}
    const silent=samples.every(sample=>sample===0),candidates=await this.candidates(samples);
    if(await sha256File(source)!==id)throw new Error("Source changed during language detection");
    return {id,start,end,analyzedSeconds:samples.length/16000,model:speechModels.tiny.model,modelRevision:speechModels.tiny.revision,status:silent?"digital_silence":"candidate",language:candidates[0]?.language??null,candidates,reviewRequired:true,languageVerified:false,transcriptCreated:false,note:"Model probabilities are not calibrated confidence. Music, noise and mixed languages may produce misleading candidates. Only exact digital silence is excluded. Select an explicit language for transcription after review."};
  }
  transcribe(id:string,start:number,end:number,options:SpeechOptions={},parentRunId?:string){
    return this.serialize(()=>this.run(id,start,end,options,parentRunId));
  }
  resume(runId:string){return this.serialize(async()=>{const saved=await this.checkpoints.read(runId);if(saved.complete)throw new Error("Speech run is already completed");return this.run(saved.record.id,saved.record.start,saved.record.end,saved.record.options,runId);});}
  private async run(id:string,start:number,end:number,input:SpeechOptions,parentRunId?:string){
    const options=speechOptions.parse(input),selected=speechModels[options.model];
    requireCapability(this.config.capabilities,"export");
    requireCapability(this.config.capabilities,"project-write");
    if(!this.config.modelDirectory)throw new Error("Download speech models explicitly and set AVID_MCP_MODEL_DIR");
    const library=new MediaLibrary(this.config);
    const entry=await library.validatedMetadata(id);
    if(!entry)throw new Error("Media missing");
    const duration=Number(entry.metadata.format?.duration);
    if(!Number.isFinite(end)||!Number.isFinite(start)||end<=start||start<0||end>duration||end-start>600)throw new Error("Transcription range must be within media and at most 600 seconds");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");
    if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const previous=parentRunId?await this.checkpoints.read(parentRunId):undefined;
    if(previous&&previous.record.recipe!==3)throw new Error("Legacy speech audio timing recipe cannot resume; start a new transcription. Existing transcripts and checkpoints are retained.");
    const directory=path.join(await library.directory(),randomUUID());
    await mkdir(directory);
    const audio=path.join(directory,"speech.f32");
    const result=await runProcess(this.config.ffmpegExecutable??"ffmpeg",speechAudioArguments(source,audio,start,end),{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});
    if(result.exitCode!==0)throw new Error("Audio extraction failed");
    const bytes=await readBoundedFile(audio,Math.ceil((end-start)*16000)*4);
    if(!bytes.length||bytes.length>600*16000*4||bytes.length%4)throw new Error("Unexpected audio buffer");
    const samples=new Float32Array(bytes.length/4);
    for(let i=0;i<samples.length;i++){samples[i]=bytes.readFloatLE(i*4);if(!Number.isFinite(samples[i]))throw new Error("Nonfinite audio sample");}
    const audioHash=await sha256File(audio),plannedWindows=1+Math.ceil(Math.max(0,samples.length-480000)/320000);
    if(previous&&(previous.complete||previous.record.id!==id||previous.record.start!==start||previous.record.end!==end||JSON.stringify(previous.record.options)!==JSON.stringify(options)||previous.record.audioHash!==audioHash||previous.record.plannedWindows!==plannedWindows))throw new Error("Speech checkpoint source, options or audio plan changed");
    let decision=previous?.record.languageDecision;
    if(!decision){
      if(selected.multilingual&&options.language==="auto"&&!previous){
        const window=samples.slice(0,480000),candidates=await this.candidates(window,options.model==="base"?"base":"tiny");
        if(!candidates.length)throw new AvidMcpError("SPEECH_LANGUAGE_UNDETERMINED","The first language-detection window is digital silence; choose a speech range or an explicit language");
        decision=speechLanguageDecision.parse({language:candidates[0]!.language,selection:"model_candidate",candidates,analyzedSeconds:window.length/16000});
      }else decision=speechLanguageDecision.parse({language:options.language==="auto"?"en":options.language,selection:!selected.multilingual?"english_only_model":options.language==="auto"?"english_fallback":"explicit"});
    }
    const runId=await this.checkpoints.create({id,start,end,options,audioHash,plannedWindows,parentRunId,languageDecision:decision,recipe:3});
    try{
    if(!this.models.has(options.model))this.models.set(options.model,loadSpeechModel(this.config.modelDirectory,false,options.model).catch(error=>{this.models.delete(options.model);throw error;}));
    const model=await this.models.get(options.model)!;
    const language=decision.language,languageSelection=decision.selection;
    const {Tensor}=await modelRuntime(this.config.modelDirectory);
    // This boundary is qualified against the pinned runtime. Serialize callers
    // and always restore the model method, including checkpoint/inference errors.
    const generator=model.model as unknown as {generate:(input:Record<string,unknown>)=>Promise<unknown>},original=generator.generate;
    let completedWindows=0,reusedWindows=0;
    generator.generate=async input=>{
      if(completedWindows>=plannedWindows)throw new Error("Speech runtime exceeded planned windows");
      const inputHash=speechInputHash(input),saved=previous?.windows[completedWindows];
      if(saved&&saved.inputHash!==inputHash)throw new Error("Speech checkpoint feature or generation input changed");
      const output=saved?new Tensor("int64",BigInt64Array.from(saved.tokens,BigInt),[1,saved.tokens.length]):await original.call(generator,input);
      await this.checkpoints.append(runId,completedWindows,{inputHash,tokens:speechTokens(output)});completedWindows++;if(saved)reusedWindows++;return output;
    };
    let output;
    try{output=await model(samples,{return_timestamps:true,chunk_length_s:30,stride_length_s:5,...(selected.multilingual?{task:"transcribe",language}:{})});}
    finally{generator.generate=original;}
    if(completedWindows!==plannedWindows)throw new Error("Speech runtime did not complete planned windows");
    if(Array.isArray(output))throw new Error("Unexpected transcription batch");
    const segments=(output.chunks??[]).map(chunk=>({start:start+chunk.timestamp[0],end:Math.min(end,start+(chunk.timestamp[1]??end-start)),text:chunk.text})).filter(segment=>segment.end>segment.start);
    if(await sha256File(source)!==id)throw new Error("Source changed during transcription");
    const transcript=await library.importTranscript(id,segments);await this.checkpoints.finish(runId,transcript.revision);
    return {...transcript,runId,parentRunId,reusedWindows,completedWindows,model:selected.model,modelRevision:selected.revision,
      language,languageSelection,languageDecision:decision,languageRequested:options.language,languageDetectionSupported:selected.multilingual,languageDetectionPerformed:languageSelection==="model_candidate",languageDetectionVerified:false,task:"transcribe",start,end,segments,
      reviewRequired:true,note:`${languageSelection==="english_fallback"?"Legacy run's English fallback preserved for resume. ":languageSelection==="model_candidate"?"Language selected from the first 30 seconds or shorter available audio; candidate scores are not calibrated confidence. Mixed languages, music or noise can mislead selection. ":""}Machine transcript; music, silence and overlapping speech can produce errors. No speaker diarization.`};
    }catch(error){throw new AvidMcpError("SPEECH_INCOMPLETE",(error as Error).message,{runId,parentRunId,resumeTool:"avid_resume_speech"});}
  }
}
