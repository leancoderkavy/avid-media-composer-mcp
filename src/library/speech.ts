import {readFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {modelRuntime} from "./model-runtime.js";
import {speechModels,speechOptions,speechModel,type SpeechOptions} from "./speech-options.js";

export const SPEECH_MODEL=speechModels["tiny.en"].model;
export const SPEECH_REVISION=speechModels["tiny.en"].revision;
export async function loadSpeechModel(cache:string,download=false,selection: "tiny.en"|"tiny"="tiny.en"){
  const selected=speechModels[speechModel.parse(selection)];
  const {pipeline}=await modelRuntime(cache,download);
  return pipeline("automatic-speech-recognition",selected.model,{cache_dir:cache,revision:selected.revision,local_files_only:!download,dtype:"q8"});
}
export class SpeechAnalysis {
  private models=new Map<string,ReturnType<typeof loadSpeechModel>>();
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly config:ServerConfig){}
  async dispose(){await this.tail;await Promise.all([...this.models.values()].map(async pending=>(await pending).dispose()));this.models.clear();}
  transcribe(id:string,start:number,end:number,options:SpeechOptions={}){
    const operation=this.tail.then(()=>this.run(id,start,end,options));
    this.tail=operation.catch(()=>{});return operation;
  }
  private async run(id:string,start:number,end:number,input:SpeechOptions){
    const options=speechOptions.parse(input),selected=speechModels[options.model];
    requireCapability(this.config.capabilities,"export");
    requireCapability(this.config.capabilities,"project-write");
    if(!this.config.modelDirectory)throw new Error("Download speech models explicitly and set AVID_MCP_MODEL_DIR");
    const library=new MediaLibrary(this.config);
    const [entry]=await library.metadata([id]);
    if(!entry)throw new Error("Media missing");
    const duration=Number(entry.metadata.format?.duration);
    if(!Number.isFinite(end)||!Number.isFinite(start)||end<=start||start<0||end>duration||end-start>600)throw new Error("Transcription range must be within media and at most 600 seconds");
    const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");
    if(await sha256File(source)!==id)throw new Error("Source changed; reindex");
    const directory=path.join(await library.directory(),randomUUID());
    await mkdir(directory);
    const audio=path.join(directory,"speech.f32");
    const result=await runProcess(this.config.ffmpegExecutable??"ffmpeg",["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-ss",String(start),"-i",source,"-t",String(end-start),"-vn","-ac","1","-ar","16000","-f","f32le",audio],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});
    if(result.exitCode!==0)throw new Error("Audio extraction failed");
    const bytes=await readFile(audio);
    if(bytes.length>600*16000*4||bytes.length%4)throw new Error("Unexpected audio buffer");
    const samples=new Float32Array(bytes.length/4);
    for(let i=0;i<samples.length;i++)samples[i]=bytes.readFloatLE(i*4);
    if(!this.models.has(options.model))this.models.set(options.model,loadSpeechModel(this.config.modelDirectory,false,options.model).catch(error=>{this.models.delete(options.model);throw error;}));
    const model=await this.models.get(options.model)!;
    const output=await model(samples,{return_timestamps:true,chunk_length_s:30,stride_length_s:5,
      ...(selected.multilingual?{task:"transcribe",...(options.language!=="auto"?{language:options.language}:{})}:{})});
    if(Array.isArray(output))throw new Error("Unexpected transcription batch");
    const segments=(output.chunks??[]).map(chunk=>({start:start+chunk.timestamp[0],end:Math.min(end,start+(chunk.timestamp[1]??end-start)),text:chunk.text})).filter(segment=>segment.end>segment.start);
    if(await sha256File(source)!==id)throw new Error("Source changed during transcription");
    return {...await library.importTranscript(id,segments),model:selected.model,modelRevision:selected.revision,
      language:selected.multilingual?(options.language==="auto"?null:options.language):"en",languageRequested:options.language,languageDetectionVerified:false,task:"transcribe",start,end,segments,
      reviewRequired:true,note:"Machine transcript; music, silence and overlapping speech can produce errors. No speaker diarization."};
  }
}
