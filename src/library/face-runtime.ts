import {mkdir,readFile,writeFile,access,realpath} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {runProcess} from "../process.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile} from "../security/bounded-read.js";

async function downloadBytes(response:Response,limit:number){
  if(!response.ok||!response.body)throw new Error("Face runtime download failed");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw new Error("Download exceeds expected size");chunks.push(value);}
    return Buffer.concat(chunks,total);
  }finally{await reader.cancel();reader.releaseLock();}
}

export const FACE_REVISION="47534e27c9851bb1128ccc0102f1145e27f23f98";
export const FACE_MODELS=[
  {folder:"face_detection_yunet",name:"face_detection_yunet_2023mar.onnx",sha256:"8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",bytes:232589,license:"MIT"},
  {folder:"face_recognition_sface",name:"face_recognition_sface_2021dec.onnx",sha256:"0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",bytes:38696353,license:"Apache-2.0"},
] as const;
export async function faceRuntime(cache:string,python:string,install=false){
  const root=path.resolve(cache,"faces"),runtime=path.join(root,"runtime");
  const executable=path.join(runtime,process.platform==="win32"?"Scripts/python.exe":"bin/python");
  if(install){
    await mkdir(root,{recursive:true});await resolveReadablePath(root,[await realpath(cache)],"directory");
    const manifest={schema:1,revision:FACE_REVISION,opencv:"4.12.0.88",numpy:"2.2.6",models:FACE_MODELS};
    const manifestFile=path.join(root,"manifest.json");
    try{if(JSON.stringify(JSON.parse(await readFile(manifestFile,"utf8")))!==JSON.stringify(manifest))throw new Error("Existing face runtime differs; choose a fresh model directory");}
    catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;await writeFile(manifestFile,JSON.stringify(manifest),{flag:"wx"});}
    try{await access(executable);}catch{
      const created=await runProcess(python,["-m","venv",runtime],{timeoutMs:120000,maxOutputBytes:1048576});
      if(created.exitCode!==0)throw new Error("Could not create optional face Python runtime");
    }
    await resolveReadablePath(executable,[root],"file");
    const installed=await runProcess(executable,["-m","pip","install","--disable-pip-version-check","--only-binary=:all:","opencv-python-headless==4.12.0.88","numpy==2.2.6"],{timeoutMs:180000,maxOutputBytes:1048576});
    if(installed.exitCode!==0)throw new Error("Face runtime dependency installation failed");
    for(const model of FACE_MODELS){
      const target=path.join(root,model.name);
      try{await access(target);}catch{
        const response=await fetch(`https://media.githubusercontent.com/media/opencv/opencv_zoo/${FACE_REVISION}/models/${model.folder}/${model.name}`,{signal:AbortSignal.timeout(120000)});
        if(!response.ok)throw new Error("Face model download failed");
        const bytes=await downloadBytes(response,model.bytes);
        if(bytes.length!==model.bytes||createHash("sha256").update(bytes).digest("hex")!==model.sha256)throw new Error("Face model checksum mismatch");
        await writeFile(target,bytes,{flag:"wx"});
      }
      const license=path.join(root,`${model.folder}.LICENSE`);
      try{await access(license);}catch{
        const response=await fetch(`https://raw.githubusercontent.com/opencv/opencv_zoo/${FACE_REVISION}/models/${model.folder}/LICENSE`,{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error("Could not download model license");
        await writeFile(license,await downloadBytes(response,65536),{flag:"wx"});
      }
    }
  }
  await resolveReadablePath(executable,[root],"file");
  for(const model of FACE_MODELS){
    const target=await resolveReadablePath(path.join(root,model.name),[root],"file"),bytes=await readBoundedFile(target,model.bytes);
    if(bytes.length!==model.bytes||createHash("sha256").update(bytes).digest("hex")!==model.sha256)throw new Error("Installed face model failed checksum verification");
  }
  return {root,executable,models:FACE_MODELS,revision:FACE_REVISION};
}
