import {mkdir,lstat,realpath,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as z from "zod/v4";
import {runProcess} from "./process.js";
import {packageTreeHash} from "./package-lifecycle.js";
import {preparePipWheel,PIP_VERSION} from "./library/python-bootstrap.js";
import {readBoundedJson} from "./security/bounded-read.js";
import {resolveReadablePath} from "./security/path-policy.js";

export const CORE_PYTHON_PACKAGES={pyavb:"1.4.0",pyaaf2:"1.7.1"} as const;
const versions=z.object({pip:z.string(),pyavb:z.literal("1.4.0"),pyaaf2:z.literal("1.7.1")}).strict();
const receiptSchema=z.object({schema:z.literal(1),kind:z.literal("avid-core-python"),directory:z.string(),basePython:z.string(),versions,treeSha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().datetime()}).strict();
const attemptSchema=z.object({schema:z.literal(1),kind:z.literal("avid-core-python-attempt"),directory:z.string(),basePython:z.string(),versions,createdAt:z.string().datetime()}).strict();
const pythonAt=(directory:string)=>path.join(directory,"runtime",process.platform==="win32"?"Scripts/python.exe":"bin/python");
async function direct(directory:string){
 if(!path.isAbsolute(directory))throw new Error("Python runtime path must be absolute");
 const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Python runtime must be a direct directory");
 return realpath(directory);
}
/** Read-only consistency check; never executes Python or accesses the network. */
export async function pythonRuntimeStatus(directory:string){
 directory=await direct(directory);
 const file=path.join(directory,"installation.json");
 let receiptExists=true;
 try{if((await lstat(file)).isSymbolicLink())throw new Error("Python runtime receipt cannot be a link");}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;receiptExists=false;}
 if(!receiptExists){
  const attemptFile=path.join(directory,"attempt.json");
  if((await lstat(attemptFile)).isSymbolicLink())throw new Error("Python runtime attempt cannot be a link");
  const attempt=attemptSchema.parse(await readBoundedJson(attemptFile,16384));
  if(attempt.directory!==directory)throw new Error("Python runtime attempt location mismatch");
  return {state:"incomplete" as const,directory,attempt,executable:null,unchanged:null,bootstrapCurrent:null,workerState:"unknown" as const,
   note:"No successful installation receipt. This may be active or interrupted setup; no termination, retry or cleanup is inferred. Retain this directory and inspect the installer process."};
 }
 const receipt=receiptSchema.parse(await readBoundedJson(file,16384));
 if(receipt.directory!==directory)throw new Error("Python runtime receipt location mismatch");
 const executable=await resolveReadablePath(pythonAt(directory),[directory],"file");
 const treeSha256=await packageTreeHash(directory);
 return {state:"receipt_checked" as const,directory,executable,receipt,treeSha256,unchanged:treeSha256===receipt.treeSha256,bootstrapCurrent:receipt.versions.pip===PIP_VERSION,
  note:"Recorded dependency checks and local file consistency. Base Python/OS libraries remain external; not a current vulnerability audit or clean-machine qualification."};
}
/** Explicit install only. Existing destinations and interrupted attempts are retained. */
export async function installPythonRuntime(directory:string,basePython:string){
 if(!path.isAbsolute(directory)||!path.isAbsolute(basePython))throw new Error("Python runtime and base interpreter paths must be absolute");
 const base=await realpath(basePython);if(!(await lstat(base)).isFile())throw new Error("Base Python must be an executable file");
 const requirements=await readFile(fileURLToPath(new URL("../python/requirements.txt",import.meta.url)),"utf8");
 if(requirements.trim().split(/\r?\n/).join("\n")!==Object.entries(CORE_PYTHON_PACKAGES).map(([name,version])=>`${name}==${version}`).join("\n"))throw new Error("Core Python requirement pins changed; installer requires review");
 directory=path.join(await realpath(path.dirname(directory)),path.basename(directory));
 await mkdir(directory); // Exclusive claim before executing or downloading anything.
 try{
  const attempt=attemptSchema.parse({schema:1,kind:"avid-core-python-attempt",directory,basePython:base,versions:{pip:PIP_VERSION,...CORE_PYTHON_PACKAGES},createdAt:new Date().toISOString()});
  await writeFile(path.join(directory,"attempt.json"),JSON.stringify(attempt,null,2),{flag:"wx",mode:0o600});
  const execute=async(executable:string,args:string[])=>{
   const result=await runProcess(executable,args,{timeoutMs:180000,maxOutputBytes:2*1024*1024});
   if(result.exitCode!==0)throw new Error(`Python runtime command failed: ${result.stderr.slice(-1500)}`);return result.stdout;
  };
  await execute(base,["-I","-B","-m","venv","--copies","--without-pip",path.join(directory,"runtime")]);
  const executable=await resolveReadablePath(pythonAt(directory),[directory],"file"),wheel=await preparePipWheel(directory);
  await execute(executable,["-I","-B","-c","import sys,runpy; sys.path.insert(0,sys.argv.pop(1)); runpy.run_module('pip',run_name='__main__')",wheel,"--isolated","install","--no-index","--no-deps","--no-compile","--disable-pip-version-check",wheel]);
  await execute(executable,["-I","-B","-m","pip","--isolated","install","--index-url","https://pypi.org/simple","--only-binary=:all:","--no-deps","--no-compile","--disable-pip-version-check",...Object.entries(CORE_PYTHON_PACKAGES).map(([name,version])=>`${name}==${version}`)]);
  await execute(executable,["-I","-B","-m","pip","--isolated","check"]);
  const checked=versions.parse(JSON.parse(await execute(executable,["-I","-B","-c","import importlib.metadata as m,json,avb,aaf2; print(json.dumps({n:m.version(n) for n in ['pip','pyavb','pyaaf2']}))"])));
  if(checked.pip!==PIP_VERSION)throw new Error("Python runtime bootstrap version mismatch");
  const receipt=receiptSchema.parse({schema:1,kind:"avid-core-python",directory,basePython:base,versions:checked,treeSha256:await packageTreeHash(directory),createdAt:new Date().toISOString()});
  await writeFile(path.join(directory,"installation.json"),JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});
  const status=await pythonRuntimeStatus(directory);
  if(status.state!=="receipt_checked")throw new Error("Python runtime success receipt disappeared");
  return status;
 }catch(error){throw new Error(`${(error as Error).message}; incomplete runtime retained at ${directory}. Choose a fresh directory; no automatic retry or cleanup.`);}
}
