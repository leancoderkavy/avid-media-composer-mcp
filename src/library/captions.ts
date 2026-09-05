import {mkdir,writeFile,rename,unlink,readdir,rmdir,opendir} from "node:fs/promises";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {modelRuntime} from "./model-runtime.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
export const CAPTION_MODEL="onnx-community/Florence-2-base-ft",CAPTION_REVISION="e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f",CAPTION_TASK="<MORE_DETAILED_CAPTION>";
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1).max(4000);
const recordSchema=z.object({schema:z.literal(1),captionId:uuid,revision:uuid,id:sha,time:z.number().nonnegative(),imageSha256:sha,model:z.literal(CAPTION_MODEL),modelRevision:z.literal(CAPTION_REVISION),task:z.literal(CAPTION_TASK),runtime:z.literal("4.2.0"),dtype:z.literal("q4"),machineText:text,text,edited:z.boolean(),mayBeTruncated:z.boolean(),createdAt:z.string()}).strict();
export async function loadCaptionModel(cache:string,download=false){const runtime=await modelRuntime(cache,download),options={cache_dir:cache,revision:CAPTION_REVISION,local_files_only:!download};const processor=await runtime.AutoProcessor.from_pretrained(CAPTION_MODEL,options) as import("@huggingface/transformers").Florence2Processor,model=await runtime.Florence2ForConditionalGeneration.from_pretrained(CAPTION_MODEL,{...options,dtype:"q4"});return {processor,model,RawImage:runtime.RawImage,Tensor:runtime.Tensor};}
export class FrameCaptions{
  private model:ReturnType<typeof loadCaptionModel>|undefined;
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private config:ServerConfig){}
  private serialize<T>(fn:()=>Promise<T>){const operation=this.tail.then(fn);this.tail=operation.catch(()=>{});return operation;}
  async dispose(){await this.tail;if(this.model)await(await this.model).model.dispose();}
  private async source(id:string){sha.parse(id);const [entry]=await new MediaLibrary(this.config).metadata([id]);if(!entry)throw new Error("Unknown caption media");const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");if(await sha256File(source)!==id)throw new Error("Caption source changed; reindex");return {source,entry};}
  private async directory(captionId:string){uuid.parse(captionId);const root=await new MediaLibrary(this.config).directory();return resolveReadablePath(path.join(root,`caption-${captionId}`),[root],"directory");}
  async read(captionId:string){
    const directory=await this.directory(captionId),file=await resolveReadablePath(path.join(directory,"caption.json"),[directory],"file"),bytes=await readBoundedFile(file,32768),record=recordSchema.parse(JSON.parse(bytes.toString("utf8")));if(record.captionId!==captionId)throw new Error("Caption identity mismatch");await this.source(record.id);
    const image=await resolveReadablePath(path.join(directory,"frame.jpg"),[directory],"file");if(await sha256File(image)!==record.imageSha256)throw new Error("Caption image changed");
    return {...record,sha256:createHash("sha256").update(bytes).digest("hex"),image,output:file,reviewRequired:true,meaning:"Caption of one requested seek time, not an exact decoded PTS or a video summary. Text may omit or invent details; edited does not establish factual verification."};
  }
  async withImage(captionId:string){const data=await this.read(captionId),bytes=await readBoundedFile(data.image,4*1024*1024);if(createHash("sha256").update(bytes).digest("hex")!==data.imageSha256)throw new Error("Caption image changed before review");return {data,image:bytes.toString("base64")};}
  generate(id:string,time:number){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"export");requireCapability(this.config.capabilities,"project-write");
    if(!this.config.modelDirectory)throw new Error("Download caption models explicitly and set AVID_MCP_MODEL_DIR");
    const {source,entry}=await this.source(id),duration=Number(entry.metadata.format?.duration);if(!Number.isFinite(time)||time<0||!Number.isFinite(duration)||time>=duration)throw new Error("Caption time must be within source duration");if(!entry.metadata.streams?.some((s:{codec_type?:string})=>s.codec_type==="video"))throw new Error("Caption requires video");
    const captionId=randomUUID(),directory=path.join(await new MediaLibrary(this.config).directory(),`caption-${captionId}`);await mkdir(directory);const image=path.join(directory,"frame.jpg");
    const result=await runProcess(this.config.ffmpegExecutable??"ffmpeg",["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-ss",String(time),"-i",source,"-map","0:v:0","-frames:v","1","-vf","scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",image],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1024*1024});if(result.exitCode!==0)throw new Error("Caption frame extraction failed");
    const imageBytes=await readBoundedFile(image,4*1024*1024),imageSha256=createHash("sha256").update(imageBytes).digest("hex");
    if(!this.model)this.model=loadCaptionModel(this.config.modelDirectory).catch(error=>{this.model=undefined;throw error;});const {model,processor,RawImage,Tensor}=await this.model;
    const frame=await RawImage.read(image),inputs=await processor(frame,processor.construct_prompts(CAPTION_TASK)),output=await model.generate({...inputs,max_new_tokens:128,do_sample:false});
    if(!(output instanceof Tensor))throw new Error("Unexpected caption generation output");
    const machineText=text.parse(processor.post_process_generation(processor.batch_decode(output,{skip_special_tokens:false})[0]!,CAPTION_TASK,frame.size)[CAPTION_TASK]);
    if(await sha256File(source)!==id||await sha256File(image)!==imageSha256)throw new Error("Caption source or image changed during generation");
    const record=recordSchema.parse({schema:1,captionId,revision:randomUUID(),id,time,imageSha256,model:CAPTION_MODEL,modelRevision:CAPTION_REVISION,task:CAPTION_TASK,runtime:"4.2.0",dtype:"q4",machineText,text:machineText,edited:false,mayBeTruncated:output.dims[1]!>=128,createdAt:new Date().toISOString()});
    await writeFile(path.join(directory,"caption.json"),JSON.stringify(record),{flag:"wx",mode:0o600});return this.read(captionId);
  });}
  async list(id:string,after?:string,limit=20){sha.parse(id);if(after)uuid.parse(after);z.number().int().min(1).max(100).parse(limit);await this.source(id);const root=await new MediaLibrary(this.config).directory(),matching=[];let scanned=0;
    for await(const entry of await opendir(root)){if(++scanned>10000)throw new Error("Caption discovery limit exceeded");if(!entry.isDirectory()||!/^caption-[a-f0-9-]{36}$/.test(entry.name))continue;const captionId=entry.name.slice(8);if(after&&captionId<=after)continue;
      let record;try{const directory=await this.directory(captionId),file=await resolveReadablePath(path.join(directory,"caption.json"),[directory],"file");record=recordSchema.parse(JSON.parse((await readBoundedFile(file,32768)).toString("utf8")));}catch(error){if((error as {code?:string}).code==="PATH_NOT_FOUND")continue;throw error;}if(record.id===id)matching.push(captionId);
    }
    matching.sort();const captions=[];for(const captionId of matching.slice(0,limit)){try{captions.push(await this.read(captionId));}catch(error){captions.push({captionId,state:"unavailable",message:(error as Error).message});}}
    return {captions,nextAfter:matching.length>limit?matching[limit-1]:null};
  }
  correct(captionId:string,expectedSha256:string,correctedText:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const current=await this.read(captionId);if(current.sha256!==expectedSha256)throw new Error("Caption changed");
    const record=recordSchema.parse({...recordSchema.strip().parse(current),revision:randomUUID(),text:text.parse(correctedText),edited:true}),temporary=current.output+`.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(record),{flag:"wx",mode:0o600});
    try{if(await sha256File(current.output)!==expectedSha256)throw new Error("Caption changed before save");await rename(temporary,current.output);}finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}return this.read(captionId);
  });}
  remove(captionId:string,expectedSha256:string){return this.serialize(async()=>{
    requireCapability(this.config.capabilities,"project-write");sha.parse(expectedSha256);const current=await this.read(captionId);if(current.sha256!==expectedSha256)throw new Error("Caption changed");const directory=await this.directory(captionId),files=await readdir(directory);if(files.length!==2||!files.includes("caption.json")||!files.includes("frame.jpg"))throw new Error("Unexpected caption files; removal refused");
    await unlink(current.output);await unlink(current.image);await rmdir(directory);return {captionId,removed:true,sourceModified:false};
  });}
}
