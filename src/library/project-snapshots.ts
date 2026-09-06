import {readFile,writeFile,stat,access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {runProcess} from "../process.js";
import {MediaLibrary} from "./media-library.js";
import {readBoundedJson} from "../security/bounded-read.js";

const unit=z.number().int().nonnegative();
const node=z.object({kind:z.string(),timelineStart:unit,timelineEnd:unit,sourceMobId:z.string().optional(),sourceTrackId:z.number().int().optional(),sourceStart:z.number().int().optional(),channelCombiner:z.object({channelIndex:z.union([z.literal(1),z.literal(2)]),channelCount:z.literal(2)}).strict().optional(),opaque:z.boolean().optional(),timecode:z.object({start:z.number().int(),fps:z.number().int().positive(),flags:z.number().int()}).optional()});
const track=z.object({ordinal:unit,index:z.number().int(),mediaKind:z.string(),nodes:z.array(node).max(10000)});
const mob=z.object({mobId:z.string(),name:z.string(),mobType:z.string(),usageCode:z.number().int(),rate:z.number().positive(),duration:unit,sourceBounds:z.object({start:unit,end:unit}),tracks:z.array(track).max(128)});
const bin=z.object({schema:z.literal(1),file:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mobs:z.array(mob).max(1000),warnings:z.array(z.record(z.string(),z.unknown())).max(1000),complete:z.boolean(),nodeCount:unit,stateOrigin:z.string()});
const snapshotSchema=z.object({revision:z.string().uuid(),createdAt:z.string(),bins:z.array(bin).max(100)});
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class ProjectSnapshots {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  async create(files:string[]){
    if(!files.length||files.length>Math.min(this.config.maxBins,100))throw new Error("Snapshot bin count exceeds limit");
    await this.library.directory();
    const sidecar=fileURLToPath(new URL("../../python/avid_timeline.py",import.meta.url));
    // src/library and dist/library have the same relative depth below the package root.
    await access(sidecar);
    const bins=[];
    for(const input of [...new Set(files)]){
      const file=await resolveReadablePath(input,this.config.allowedRoots,"file");
      if(path.extname(file).toLowerCase()!==".avb")throw new Error("Expected AVB bin");
      if((await stat(file)).size>512*1024*1024)throw new Error("Bin exceeds snapshot size limit");
      const response=await runProcess(this.config.pythonExecutable,[sidecar,file,"--max-nodes","10000"],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:8*1024*1024});
      if(response.exitCode!==0)throw new Error(`Saved-bin index failed: ${response.stderr.slice(-2000)}`);
      bins.push(bin.parse(JSON.parse(response.stdout)));
    }
    const revision=randomUUID(),record={revision,createdAt:new Date().toISOString(),bins};
    const serialized=JSON.stringify(record);
    if(Buffer.byteLength(serialized)>32*1024*1024)throw new Error("Snapshot exceeds size limit");
    await writeFile(path.join(await this.library.directory(),`snapshot-${revision}.json`),serialized,{flag:"wx"});
    return {revision,complete:bins.every(bin=>bin.complete),bins:bins.map(bin=>({file:bin.file,sha256:bin.sha256,mobs:bin.mobs.map(mob=>({mobId:mob.mobId,name:mob.name,mobType:mob.mobType,usageCode:mob.usageCode,rate:mob.rate,duration:mob.duration})),warnings:bin.warnings})),origin:"saved-bin; excludes unsaved editor changes"};
  }
  private async read(revision:string){
    z.string().uuid().parse(revision);const directory=await this.library.directory();
    const file=await resolveReadablePath(path.join(directory,`snapshot-${revision}.json`),[directory],"file");
    const record=snapshotSchema.parse(await readBoundedJson(file,32*1024*1024));
    if(record.revision!==revision)throw new Error("Snapshot identity mismatch");
    for(const bin of record.bins){
      try{await resolveReadablePath(bin.file,this.config.allowedRoots,"file");}
      catch(error){
        if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;
        // Deleted bins may still be compared if their parent remains in scope.
        await resolveReadablePath(path.dirname(bin.file),this.config.allowedRoots,"directory");
      }
    }
    return record;
  }
  async diff(baseline:string,candidate:string){
    const before=await this.read(baseline),after=await this.read(candidate);
    const index=(value:z.infer<typeof snapshotSchema>)=>new Map(value.bins.flatMap(bin=>bin.mobs.map(mob=>[`${bin.file}\0${mob.mobId}`,{bin:bin.file,...mob}] as const)));
    const a=index(before),b=index(after),changes=[];
    for(const [key,value] of a){const next=b.get(key);if(!next)changes.push({change:"removed",bin:value.bin,mobId:value.mobId,name:value.name});else if(digest(value)!==digest(next))changes.push({change:"changed",bin:value.bin,mobId:value.mobId,before:value,after:next});}
    for(const [key,value] of b)if(!a.has(key))changes.push({change:"added",bin:value.bin,mobId:value.mobId,name:value.name});
    return {baseline,candidate,changes:changes.slice(0,200),truncated:changes.length>200,complete:[...before.bins,...after.bins].every(bin=>bin.complete),comparison:"Semantic mob/track/source fields; excludes volatile save metadata and opaque effect parameters"};
  }
  async range(revision:string,mobId:string,start:number,end:number,ordinal?:number,after=-1,limit=100){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start)throw new Error("Invalid edit-unit range");
    const snapshot=await this.read(revision);
    const matches=snapshot.bins.flatMap(bin=>bin.mobs.filter(mob=>mob.mobId===mobId).map(mob=>({bin,mob})));
    if(matches.length!==1)throw new Error("Expected one matching mob; snapshot only the target bin when IDs occur in multiple bins");
    const target=matches[0]!,results=[];let cursor=0;
    for(const track of target.mob.tracks){
      for(const node of track.nodes){
        const index=cursor++;
        if(index<=after||(ordinal!==undefined&&track.ordinal!==ordinal)||node.timelineStart>=end||node.timelineEnd<=start)continue;
        const overlapStart=Math.max(start,node.timelineStart),overlapEnd=Math.min(end,node.timelineEnd);
        results.push({index,track:track.ordinal,trackIndex:track.index,mediaKind:track.mediaKind,...node,overlapStart,overlapEnd,
          ...(node.sourceStart===undefined?{}:{overlapSourceStart:node.sourceStart+overlapStart-node.timelineStart,overlapSourceEnd:node.sourceStart+overlapEnd-node.timelineStart})});
      }
    }
    const page=results.slice(0,limit);
    return {revision,mobId,rate:target.mob.rate,duration:target.mob.duration,results:page,nextAfter:results.length>limit?page.at(-1)?.index:null,complete:target.bin.complete,warnings:target.bin.warnings,rangeConvention:"half-open edit units",origin:"saved-bin"};
  }
  async usage(revision:string,sourceMobId:string){
    const snapshot=await this.read(revision),usages=[];
    for(const bin of snapshot.bins)for(const mob of bin.mobs)for(const track of mob.tracks)for(const node of track.nodes){
      if(node.sourceMobId===sourceMobId)usages.push({bin:bin.file,mobId:mob.mobId,name:mob.name,track:track.ordinal,mediaKind:track.mediaKind,rate:mob.rate,...node});
    }
    return {revision,sourceMobId,usages:usages.slice(0,500),truncated:usages.length>500,complete:snapshot.bins.every(bin=>bin.complete),scope:"Direct saved-bin source references; opaque effects and retimes may hide references"};
  }
  async complexity(revision:string,mobId:string){
    const snapshot=await this.read(revision);
    const matches=snapshot.bins.flatMap(bin=>bin.mobs.filter(mob=>mob.mobId===mobId).map(mob=>({bin,mob})));
    if(matches.length!==1)throw new Error("Expected one matching mob; snapshot only the target bin when IDs occur in multiple bins");
    const {bin,mob}=matches[0]!;
    const sources=new Set<string>();let nodes=0,opaqueNodes=0,sourceReferences=0;
    const tracks=mob.tracks.map(track=>{
      const kinds=new Map<string,number>();let opaque=0,references=0;
      for(const node of track.nodes){
        nodes++;kinds.set(node.kind,(kinds.get(node.kind)??0)+1);
        if(node.opaque){opaque++;opaqueNodes++;}
        if(node.sourceMobId){sources.add(node.sourceMobId);references++;sourceReferences++;}
      }
      return {ordinal:track.ordinal,index:track.index,mediaKind:track.mediaKind,nodes:track.nodes.length,opaqueNodes:opaque,sourceReferences:references,kinds:Object.fromEntries(kinds)};
    });
    return {revision,mobId,name:mob.name,bin:bin.file,binSha256:bin.sha256,rate:mob.rate,duration:mob.duration,durationSeconds:mob.duration/mob.rate,trackCount:tracks.length,nodes,opaqueNodes,sourceReferences,distinctSourceMobs:sources.size,tracks,complete:bin.complete&&opaqueNodes===0,warnings:bin.warnings,origin:"saved snapshot; source bin may have changed since capture",limitations:["Counts describe stored direct nodes, not recursively expanded source graphs","Stereo channel-combiner references are counted per channel, not as editorial cuts","Opaque nodes are not classified as specific effects; no render-cost estimate","Excludes unsaved editor changes and does not verify media availability"]};
  }
}
