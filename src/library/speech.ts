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

export const SPEECH_MODEL="onnx-community/whisper-tiny.en";
export const SPEECH_REVISION="2575352d61be1bf7225cf8f8b268a4678025fc58";
export async function loadSpeechModel(cache:string,download=false){
  const {pipeline}=await modelRuntime(cache,download);
  return pipeline("automatic-speech-recognition",SPEECH_MODEL,{cache_dir:cache,revision:SPEECH_REVISION,local_files_only:!download,dtype:"q8"});
}
export class SpeechAnalysis {
  private model:ReturnType<typeof loadSpeechModel>|undefined;
  constructor(private readonly config:ServerConfig){}
  async dispose(){const pending=this.model;this.model=undefined;if(pending)await(await pending).dispose();}
  async transcribe(id:string,start:number,end:number){
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
    this.model??=loadSpeechModel(this.config.modelDirectory).catch(error=>{this.model=undefined;throw error;});
    const model=await this.model;
    const output=await model(samples,{return_timestamps:true,chunk_length_s:30,stride_length_s:5});
    if(Array.isArray(output))throw new Error("Unexpected transcription batch");
    const segments=(output.chunks??[]).map(chunk=>({start:start+chunk.timestamp[0],end:Math.min(end,start+(chunk.timestamp[1]??end-start)),text:chunk.text})).filter(segment=>segment.end>segment.start);
    if(await sha256File(source)!==id)throw new Error("Source changed during transcription");
    return {...await library.importTranscript(id,segments),model:SPEECH_MODEL,language:"English",start,end,segments,
      reviewRequired:true,note:"Machine transcript; music, silence and overlapping speech can produce errors. No speaker diarization."};
  }
}
