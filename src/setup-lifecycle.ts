import {realpath,lstat,writeFile,rename,unlink,open} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {readBoundedFile} from "./security/bounded-read.js";

type JsonObject=Record<string,any>;
const name="avid-media-composer";
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
function object(value:unknown):JsonObject{
  if(!value||Array.isArray(value)||typeof value!=="object")throw new Error("Expected a JSON object");return value as JsonObject;
}
async function targetPath(file:string){const resolved=path.resolve(file);return path.join(await realpath(path.dirname(resolved)),path.basename(resolved));}
async function read(file:string){
  try{
    const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile())throw new Error("Client configuration must be a regular file, not a symlink");
    const bytes=await readBoundedFile(file,1024*1024);return {bytes,json:object(JSON.parse(bytes.toString("utf8"))),sha256:digest(bytes)};
  }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;return {bytes:undefined,json:{} as JsonObject,sha256:"missing"};}
}
export async function configurationStatus(file:string){
  const target=await targetPath(file),current=await read(target);
  return {target,exists:!!current.bytes,sha256:current.sha256,configuredIn:["servers","mcpServers"].filter(key=>Object.hasOwn(current.json[key]??{},name))};
}
export type ConfigurationOperation=
  | {action:"install"|"update";key:"servers"|"mcpServers";entry:JsonObject;expectedSha256?:string}
  | {action:"remove";key:"servers"|"mcpServers";expectedSha256:string}
  | {action:"restore";key:"servers"|"mcpServers";expectedSha256:string;backup:string};
export async function changeConfiguration(file:string,operation:ConfigurationOperation){
  const target=await targetPath(file),lock=`${target}.avid-lock`,handle=await open(lock,"wx",0o600);
  let temporary:string|undefined;
  try{
    const current=await read(target),key=operation.key;
    if(operation.action!=="install"&&!operation.expectedSha256)throw new Error("A current configuration checksum is required");
    if(operation.expectedSha256&&current.sha256!==operation.expectedSha256)throw new Error("Client configuration changed; read its current checksum before retrying");
    const servers=current.json[key]===undefined?{}:object(current.json[key]);
    const exists=Object.hasOwn(servers,name);
    let next:JsonObject|undefined;
    if(operation.action==="install"||operation.action==="update"){
      if(operation.action==="install"&&exists)throw new Error("Avid configuration already exists; use checksum-checked update");
      if(operation.action==="update"&&!exists)throw new Error("Avid configuration is missing; use install");
      next=object(operation.entry);
    }else if(operation.action==="remove"){
      if(!exists)throw new Error("Avid configuration is missing");
    }else if(operation.action==="restore"){
      const backup=await targetPath(operation.backup),prefix=`${target}.avid-backup-`;
      if(!backup.startsWith(prefix)||!/^[a-f0-9-]{36}$/.test(backup.slice(prefix.length)))throw new Error("Restore requires a backup created for this exact configuration file");
      const previous=await read(backup);if(!previous.bytes)throw new Error("Backup is missing");
      const priorServers=previous.json[key]===undefined?{}:object(previous.json[key]);
      if(Object.hasOwn(priorServers,name))next=object(priorServers[name]);
    }
    const mergedServers={...servers};if(next)mergedServers[name]=next;else delete mergedServers[name];
    const merged={...current.json,[key]:mergedServers},bytes=Buffer.from(JSON.stringify(merged,null,2)+"\n");
    if(bytes.length>1024*1024)throw new Error("Client configuration exceeds 1 MiB limit");
    const backup=current.bytes?`${target}.avid-backup-${randomUUID()}`:undefined;
    if(backup)await writeFile(backup,current.bytes!,{flag:"wx",mode:0o600});
    temporary=`${target}.avid-pending-${randomUUID()}`;await writeFile(temporary,bytes,{flag:"wx",mode:0o600});
    if((await read(target)).sha256!==current.sha256)throw new Error("Client configuration changed during preparation; no replacement made");
    if(!current.bytes){await writeFile(target,bytes,{flag:"wx",mode:0o600});await unlink(temporary);}
    else await rename(temporary,target);
    temporary=undefined;
    return {target,backup,sha256:digest(bytes),action:operation.action,restartClient:true,scope:"Only the selected Avid server entry changes; package, models, media and unrelated configuration remain"};
  }finally{
    if(temporary)await unlink(temporary).catch(()=>{});
    await handle.close();await unlink(lock);
  }
}
