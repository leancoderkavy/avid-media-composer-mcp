import {mkdir, open, readFile, readdir, rename, stat, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {AvidMcpError} from "../errors.js";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {MediaLibrary} from "./media-library.js";
import {readBoundedJson} from "../security/bounded-read.js";
import {directoryPage} from "./directory-page.js";

export const watchOptions=z.object({folder:z.string().min(1),depth:z.number().int().min(0).max(8).default(2),maxFiles:z.number().int().min(1).max(1000).default(100),enabled:z.boolean().default(true)}).strict();
const observation=z.object({signature:z.string(),stable:z.boolean(),mediaId:z.string().optional(),error:z.string().optional(),cycle:z.string().uuid().optional()});
const watchRecord=z.object({id:z.string().uuid(),options:watchOptions,observations:z.record(z.string(),observation),scannedAt:z.string().optional(),scope:z.string().regex(/^[a-f0-9]{64}$/).optional(),cursor:z.array(z.string().min(1).max(255)).max(9).optional(),cycle:z.string().uuid().optional()});
type Watch=z.infer<typeof watchRecord>;
const extensions=new Set([".mp4",".mov",".mxf",".wav",".mp3",".mkv",".avi",".aiff",".flac"]);

/** Persistent polling manifests; no file is indexed before two matching stat observations. */
export class WatchFolders {
  private timer:ReturnType<typeof setInterval>|undefined;
  private pending:Promise<unknown>|undefined;
  private pollingAbort:AbortController|undefined;
  private lastError:string|undefined;
  private watchErrors:{id:string;error:string}[]=[];
  private library:MediaLibrary;
  private readonly scope:string;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);this.scope=createHash("sha256").update(JSON.stringify([...new Set(config.allowedRoots.map(root=>{const resolved=path.resolve(root);return process.platform==="win32"?resolved.toLowerCase():resolved;}))].sort())).digest("hex");}
  private async directory(){const library=await this.library.directory();const directory=path.join(library,"watches");await mkdir(directory,{recursive:true});return resolveReadablePath(directory,[library],"directory");}
  private async read(id:string,allowUnavailable=false){
    z.string().uuid().parse(id);const directory=await this.directory();
    const file=await resolveReadablePath(path.join(directory,`${id}.json`),[directory],"file");
    const record=watchRecord.parse(await readBoundedJson(file,4*1024*1024));
    if(record.id!==id)throw new Error("Watch identity mismatch");
    try{await resolveReadablePath(record.options.folder,this.config.allowedRoots,"directory");}
    catch(error){if(!allowUnavailable||record.scope!==this.scope||!(error instanceof AvidMcpError)||error.code!=="PATH_NOT_FOUND")throw error;}
    return record;
  }
  private async locked<T>(id:string,fn:()=>Promise<T>){
    z.string().uuid().parse(id);
    const lock=path.join(await this.directory(),`${id}.lock`);
    const handle=await open(lock,"wx");
    try{await handle.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return await fn();}
    finally{await handle.close();await unlink(lock);}
  }
  private async save(record:Watch){
    const directory=await this.directory(),temporary=path.join(directory,`${record.id}.${randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify(record),{flag:"wx"});
    await rename(temporary,path.join(directory,`${record.id}.json`));
  }
  async configure(options:z.input<typeof watchOptions>,id?:string){
    requireCapability(this.config.capabilities,"project-write");
    const parsed=watchOptions.parse(options);
    parsed.folder=await resolveReadablePath(parsed.folder,this.config.allowedRoots,"directory");
    const watchId=id??randomUUID();
    return this.locked(watchId,async()=>{
      if(id)await this.read(id,true);
      const record={id:watchId,options:parsed,observations:{},scope:this.scope};
      await this.save(record);return record;
    });
  }
  async list(){
    const directory=await this.directory();
    const files=(await readdir(directory)).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name));
    if(files.length>100)throw new Error("Watch count exceeds limit");
    const records=[];
    for(const file of files){
      try{const record=await this.read(file.slice(0,-5));records.push({id:record.id,options:record.options,scannedAt:record.scannedAt,files:Object.keys(record.observations).length});}
      catch(error){records.push({id:file.slice(0,-5),unavailable:true,error:(error as Error).message});}
    }
    return records;
  }
  async remove(id:string){
    requireCapability(this.config.capabilities,"project-write");
    return this.locked(id,async()=>{await this.read(id,true);await unlink(path.join(await this.directory(),`${id}.json`));return {id,removed:true,mediaDeleted:false};});
  }
  async scan(id:string,signal?:AbortSignal){
    requireCapability(this.config.capabilities,"project-write");
    signal?.throwIfAborted();
    return this.locked(id,async()=>{
      const record=await this.read(id);
      if(!record.options.enabled)return {id,skipped:"disabled"};
      const files:string[]=[];let directories=0,entries=0,truncated=false;
      const cursor=record.cursor;let nextCursor=cursor;
      record.cycle??=randomUUID();
      const compare=(a:string[],b:string[])=>{
        for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])return a[i]!<b[i]!?-1:1;}
        return a.length-b.length;
      };
      const walk=async(folder:string,parts:string[])=>{
        if(++directories>1000){truncated=true;return;}
        const children=await directoryPage(folder,10001-entries,entry=>{
          const location=[...parts,entry.name],ancestor=cursor&&location.length<=cursor.length&&location.every((part,index)=>part===cursor[index]);
          return !cursor||compare(location,cursor)>0||Boolean(entry.isDirectory()&&ancestor);
        },signal);
        for(const entry of children){
          const location=[...parts,entry.name],ancestor=cursor&&location.length<=cursor.length&&location.every((part,index)=>part===cursor[index]);
          if(cursor&&compare(location,cursor)<=0&&!(entry.isDirectory()&&ancestor))continue;
          if(files.length>=record.options.maxFiles||entries>=10000){truncated=true;return;}
          entries++;nextCursor=location;
          if(entry.isSymbolicLink())continue;
          const target=path.join(folder,entry.name);
          if(entry.isDirectory()&&parts.length<record.options.depth){
            await resolveReadablePath(target,[record.options.folder],"directory");await walk(target,location);
            if(truncated)return;
          }else if(entry.isFile()&&extensions.has(path.extname(entry.name).toLowerCase()))files.push(target);
        }
      };
      await walk(record.options.folder,[]);
      const next:Watch["observations"]={};const indexed=[];
      for(const file of files){
        signal?.throwIfAborted();
        try{
          await resolveReadablePath(file,this.config.allowedRoots,"file");
          const before=await stat(file),signature=`${before.size}:${before.mtimeMs}:${before.ctimeMs}`;
          const previous=record.observations[file];
          if(previous?.signature===signature&&previous.mediaId){next[file]={...previous,cycle:record.cycle};continue;}
          if(previous?.signature!==signature){next[file]={signature,stable:false,cycle:record.cycle};continue;}
          const result=await this.library.index([file]);
          const after=await stat(file);
          if(`${after.size}:${after.mtimeMs}:${after.ctimeMs}`!==signature){next[file]={signature:"changed-during-index",stable:false,cycle:record.cycle};continue;}
          next[file]={signature,stable:true,mediaId:result.entries[0]!.id,cycle:record.cycle};indexed.push({file,id:result.entries[0]!.id});
        }catch(error){next[file]={signature:record.observations[file]?.signature??"",stable:false,error:(error as Error).message,cycle:record.cycle};}
        // Persist after each file so a later failure does not discard successful checkpoints.
        record.observations={...record.observations,...next};await this.save(record);
      }
      signal?.throwIfAborted();
      record.observations={...record.observations,...next};
      if(!truncated)record.observations=Object.fromEntries(Object.entries(record.observations).filter(([,value])=>value.cycle===record.cycle));
      record.cursor=truncated?nextCursor:undefined;
      if(!truncated)record.cycle=undefined;
      record.scannedAt=new Date().toISOString();await this.save(record);
      return {id,files:files.length,indexed,truncated,errors:Object.entries(record.observations).filter(([,value])=>value.error).map(([file,value])=>({file,error:value.error})),pending:Object.values(next).filter(value=>!value.stable).length};
    });
  }
  start(intervalSeconds=30){
    requireCapability(this.config.capabilities,"project-write");
    if(!Number.isInteger(intervalSeconds)||intervalSeconds<10||intervalSeconds>3600)throw new Error("Watch polling interval must be 10–3600 seconds");
    if(this.timer)return this.status();
    this.timer=setInterval(()=>{
      if(this.pending)return;
      const controller=new AbortController();this.pollingAbort=controller;
      this.pending=this.list().then(async records=>{
        const errors:{id:string;error:string}[]=[];
        const recordError=(id:string,error:unknown)=>errors.push({id,error:(error instanceof Error?error.message:String(error)).slice(0,1024)});
        for(const record of records){
          if(controller.signal.aborted)return;
          if("unavailable" in record){recordError(record.id,record.error);continue;}
          if(!record.options?.enabled)continue;
          try{
            const result=await this.scan(record.id,controller.signal);
            if(result.errors?.length)recordError(record.id,`${result.errors.length} media file(s) failed indexing: ${result.errors[0]!.error}`);
          }catch(error){if(controller.signal.aborted)return;recordError(record.id,error);}
        }
        if(controller.signal.aborted)return;
        this.watchErrors=errors;
        this.lastError=errors.length?`${errors.length} watch folder(s) reported errors`:undefined;
      }).catch(error=>{if(!controller.signal.aborted)this.lastError=(error instanceof Error?error.message:String(error)).slice(0,1024);}).finally(()=>{this.pending=undefined;if(this.pollingAbort===controller)this.pollingAbort=undefined;});
    },intervalSeconds*1000);
    this.timer.unref();return this.status();
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.pollingAbort?.abort();return this.status();}
  status(){return {running:Boolean(this.timer),scanInProgress:Boolean(this.pending),lastError:this.lastError??null,watchErrors:this.watchErrors.map(error=>({...error})),automaticRestart:false,staleLockPolicy:"Inspect PID and operation state before manually removing a stale watch lock"};}
}
