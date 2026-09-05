import {mkdir,writeFile,lstat,realpath,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import {runProcess} from "../process.js";
import {packageTreeHash} from "../package-lifecycle.js";
import {sha256File} from "../analysis/file-inventory.js";
import {readBoundedFile,readBoundedJson} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";

export const DIARIZATION_VERSIONS={"sherpa-onnx":"1.13.7","sherpa-onnx-core":"1.13.7",numpy:"2.2.6"} as const;
export const DIARIZATION_WORKER=fileURLToPath(new URL("../../python/avid_diarization.py",import.meta.url));
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema=z.object({schema:z.literal(1),kind:z.literal("avid-diarization-runtime"),installationId:z.string().uuid(),treeSha256:hash,workerSha256:hash,versions:z.object({"sherpa-onnx":z.literal("1.13.7"),"sherpa-onnx-core":z.literal("1.13.7"),numpy:z.literal("2.2.6")}).strict(),checkedAt:z.string(),checks:z.object({binaryOnly:z.literal(true),dependencyCheckPassed:z.literal(true),silenceInferencePassed:z.literal(true)}).strict()}).strict();
async function exists(file:string){try{await lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}}
async function direct(directory:string){const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error("Diarization installation must be a direct directory");}
const pythonAt=(directory:string)=>path.join(directory,"runtime",process.platform==="win32"?"Scripts/python.exe":"bin/python");

/** Read-only tree verification. Never installs, imports Python or uses the network. */
export async function diarizationRuntimeStatus(cache:string){
  const root=path.join(await realpath(path.resolve(cache)),"diarization");await direct(root);
  const file=path.join(root,"installation.json");if((await lstat(file)).isSymbolicLink())throw new Error("Diarization receipt cannot be a link");
  const receipt=receiptSchema.parse(await readBoundedJson(file,16384));
  const directory=path.join(root,receipt.installationId);await direct(directory);
  const executable=await resolveReadablePath(pythonAt(directory),[directory],"file");
  const treeSha256=await packageTreeHash(directory),workerSha256=await sha256File(DIARIZATION_WORKER);
  return {root,directory,executable,receipt,treeSha256,unchanged:treeSha256===receipt.treeSha256&&workerSha256===receipt.workerSha256,note:"Local tree consistency and prior dependency/inference checks; not a current vulnerability audit, publisher authentication or accuracy acceptance."};
}

/** Explicit setup only. Unique venv paths never move, preserving Python launchers. */
export async function installDiarizationRuntime(cache:string,python:string){
  await mkdir(path.resolve(cache),{recursive:true});const root=path.join(await realpath(path.resolve(cache)),"diarization");await mkdir(root,{recursive:true});await direct(root);
  const lock=path.join(root,".install.lock"),owner=JSON.stringify({pid:process.pid,operation:randomUUID(),createdAt:new Date().toISOString()});
  try{await writeFile(lock,owner,{flag:"wx",mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Diarization setup lock exists; do not infer worker termination from its age. Finish that setup or choose another cache.");throw error;}
  let directory:string|undefined;
  try{
    if(await exists(path.join(root,"installation.json"))){const status=await diarizationRuntimeStatus(cache);if(!status.unchanged)throw new Error("Diarization runtime tree or worker changed; choose a fresh model directory");return {...status,reused:true};}
    const installationId=randomUUID();directory=path.join(root,installationId);await mkdir(directory);
    const execute=async(executable:string,args:string[],timeoutMs=180000)=>{const result=await runProcess(executable,args,{timeoutMs,maxOutputBytes:1024*1024});if(result.exitCode!==0)throw new Error("Diarization setup command failed: "+args.slice(0,3).join(" "));return result;};
    await execute(python,["-B","-m","venv","--copies",path.join(directory,"runtime")]);
    const executable=await resolveReadablePath(pythonAt(directory),[directory],"file");
    await execute(executable,["-B","-m","pip","install","--disable-pip-version-check","--only-binary=:all:","--no-compile","--no-deps",...Object.entries(DIARIZATION_VERSIONS).map(([name,version])=>`${name}==${version}`)],300000);
    await execute(executable,["-B","-m","pip","check"]);
    await execute(executable,["-B",DIARIZATION_WORKER,"--root",directory,"--prepare"],300000);
    const before=await packageTreeHash(directory),workerSha256=await sha256File(DIARIZATION_WORKER);
    const qualified=JSON.parse((await execute(executable,["-B",DIARIZATION_WORKER,"--root",directory,"--check"])).stdout);
    if(qualified.schema!==1||qualified.recipe!==1||qualified.duration!==1||qualified.speakerCount!==0||!Array.isArray(qualified.spans)||qualified.spans.length!==0||JSON.stringify(qualified.versions)!==JSON.stringify(DIARIZATION_VERSIONS))throw new Error("Diarization silence qualification failed");
    if(await packageTreeHash(directory)!==before||await sha256File(DIARIZATION_WORKER)!==workerSha256)throw new Error("Diarization files changed during qualification");
    const receipt=receiptSchema.parse({schema:1,kind:"avid-diarization-runtime",installationId,treeSha256:before,workerSha256,versions:DIARIZATION_VERSIONS,checkedAt:new Date().toISOString(),checks:{binaryOnly:true,dependencyCheckPassed:true,silenceInferencePassed:true}});
    await writeFile(path.join(root,"installation.json"),JSON.stringify(receipt),{flag:"wx",mode:0o600});
    return {...await diarizationRuntimeStatus(cache),reused:false};
  }catch(error){throw new Error(`${(error as Error).message}${directory?"; unselected installation retained at "+directory:""}`);}
  finally{if((await readBoundedFile(lock,16384)).toString("utf8")!==owner)throw new Error("Diarization setup lock changed; replacement retained");await unlink(lock);}
}
