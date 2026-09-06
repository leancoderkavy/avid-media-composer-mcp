import {traceSavedSources} from "./source-trace.js";
import {verifySavedDualRollerTrim} from "../native/trim-verifier.js";
import {readFile,writeFile,stat,access,opendir,link,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID,createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {runProcess} from "../process.js";
import {MediaLibrary} from "./media-library.js";
import {readBoundedJson} from "../security/bounded-read.js";

const unit=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const descriptor=z.object({classId:z.string().length(4),values:z.partialRecord(z.enum(['edit_rate','length','sample_rate','channels','quantization_bits','stored_width','stored_height','mob_kind']),z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)),locator:z.object({classId:z.string().length(4),paths:z.array(z.object({field:z.enum(['path','path_posix','path_utf8','path2_utf8','last_known_volume','last_known_volume_utf8']),value:z.string().max(4096)}).strict()).max(6),mobId:z.string().max(256).optional()}).strict().nullable(),physicalMediaClassId:z.string().length(4).optional()}).strict();
const node=z.object({kind:z.string(),timelineStart:unit,timelineEnd:unit,sourceMobId:z.string().optional(),sourceTrackId:z.number().int().optional(),sourceStart:z.number().int().optional(),channelCombiner:z.object({channelIndex:z.union([z.literal(1),z.literal(2)]),channelCount:z.literal(2)}).strict().optional(),opaque:z.boolean().optional(),timecode:z.object({start:z.number().int(),fps:z.number().int().positive(),flags:z.number().int()}).optional()});
const track=z.object({ordinal:unit,index:z.number().int(),mediaKind:z.string(),nodes:z.array(node).max(10000)});
const mob=z.object({mobId:z.string(),name:z.string(),mobType:z.string(),usageCode:z.number().int(),rate:z.number().positive(),duration:unit,sourceBounds:z.object({start:unit,end:unit}),tracks:z.array(track).max(128),descriptor:descriptor.nullable().optional()}).superRefine((value,ctx)=>{
  if(value.sourceBounds.end-value.sourceBounds.start!==value.duration)ctx.addIssue({code:"custom",message:"Snapshot source bounds disagree with duration"});
  const ordinals=new Set<number>();
  for(const track of value.tracks){
    if(ordinals.has(track.ordinal))ctx.addIssue({code:"custom",message:"Snapshot track ordinals are duplicated"});
    ordinals.add(track.ordinal);
    for(const node of track.nodes){
      if(node.timelineEnd<=node.timelineStart||node.timelineEnd>value.duration)ctx.addIssue({code:"custom",message:"Snapshot node range is outside mob duration"});
    }
  }
});
const bin=z.object({schema:z.literal(1),file:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mobs:z.array(mob).max(1000),warnings:z.array(z.record(z.string(),z.unknown())).max(1000),complete:z.boolean(),nodeCount:unit,stateOrigin:z.string()});
const snapshotSchema=z.object({revision:z.string().uuid(),createdAt:z.string(),bins:z.array(bin).max(100)});
function sourceReferenceCoverage(value:z.infer<typeof bin>,candidates:z.infer<typeof bin>[]=[value]){
  const identities=new Map<string,number>();for(const candidate of candidates)for(const mob of candidate.mobs)identities.set(mob.mobId,(identities.get(mob.mobId)??0)+1);
  const referenced=new Set<string>();let references=0;
  for(const mob of value.mobs)for(const track of mob.tracks)for(const node of track.nodes)if(node.sourceMobId!==undefined){references++;referenced.add(node.sourceMobId);}
  const unresolved=[...referenced].filter(id=>!identities.has(id)).sort(),ambiguous=[...referenced].filter(id=>(identities.get(id)??0)>1).sort();
  return {references,distinctSourceIds:referenced.size,resolvedSourceIds:referenced.size-unresolved.length-ambiguous.length,unresolvedCount:unresolved.length,ambiguousCount:ambiguous.length,unresolvedIds:unresolved.slice(0,10),ambiguousIds:ambiguous.slice(0,10),truncated:unresolved.length>10||ambiguous.length>10,allReferencesResolve:unresolved.length===0&&ambiguous.length===0,scope:candidates.length===1?"Direct references matched within one saved bin; no media availability, cycle or source-range validation.":"References from this bin matched across all captured bins. Repeated matching identities remain ambiguous even when names agree; unresolved IDs may be external or terminal. No media availability, cycle or source-range validation."};
}
const snapshotCoverage=(snapshot:z.infer<typeof snapshotSchema>)=>snapshot.bins.map(bin=>({bin:bin.file,complete:bin.complete,sourceReferences:sourceReferenceCoverage(bin),snapshotSourceReferences:sourceReferenceCoverage(bin,snapshot.bins),warningCount:bin.warnings.length,warnings:bin.warnings.slice(0,10),warningsTruncated:bin.warnings.length>10}));
function selectSnapshotBins(bins:z.infer<typeof bin>[],file?:string){
  if(file===undefined)return bins;
  if(!path.isAbsolute(file))throw new Error("Snapshot bin must be an absolute path returned by mob discovery");
  const key=(value:string)=>process.platform==="win32"?path.resolve(value).toLowerCase():path.resolve(value);
  const selected=bins.filter(bin=>key(bin.file)===key(file));
  if(selected.length!==1)throw new Error("Expected one matching bin in the authorized snapshot");
  return selected;
}
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Publish only fully written bytes, without replacing an existing revision. */
export async function publishSnapshot(file:string,serialized:string){
  if(Buffer.byteLength(serialized)>32*1024*1024)throw new Error("Snapshot exceeds size limit");
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,serialized,{flag:"wx",mode:0o600});await link(temporary,file);}
  finally{await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}

export class ProjectSnapshots {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  async verifyTrim(baseline:string,candidate:string,binFile:string,candidateBin:string,mobId:string,cut:number,delta:1|-1,trackOrdinals:number[]){
    const before=await this.read(baseline),after=await this.read(candidate);
    const a=selectSnapshotBins(before.bins,binFile),b=selectSnapshotBins(after.bins,candidateBin);
    if(a.length!==1||b.length!==1)throw new Error("Expected one selected bin in each snapshot");
    const verification=verifySavedDualRollerTrim(a[0],b[0],{mobId,cut,delta,trackOrdinals});
    return {...verification,baseline,candidate,baselineBin:a[0]!.file,candidateBin:b[0]!.file,baselineSha256:a[0]!.sha256,candidateSha256:b[0]!.sha256,scope:"Normalized captured mob fields in the two selected bins only; other bins, current editor state, opaque parameters, binary fields, media handles and playback are not verified"};
  }
  async traceSources(revision:string,mobId:string,start:number,end:number,binFile?:string,maxDepth=8){
    const snapshot=await this.read(revision);
    const matches=selectSnapshotBins(snapshot.bins,binFile).flatMap(bin=>bin.mobs.filter(mob=>mob.mobId===mobId).map(mob=>({bin,mob})));
    if(matches.length!==1)throw new Error("Expected one matching mob; provide its captured bin path");
    return {revision,mobId,bin:matches[0]!.bin.file,...traceSavedSources(snapshot.bins,matches[0]!,start,end,maxDepth)};
  }
  async sourceResolution(revision:string,after=-1,limit=100){
    if(!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>200)throw new Error("Invalid source resolution page");
    const snapshot=await this.read(revision),counts=new Map<string,number>(),matches=new Map<string,{bin:string;name:string}[]>();
    for(const bin of snapshot.bins)for(const mob of bin.mobs){
      const found=matches.get(mob.mobId)??[];found.push({bin:bin.file,name:mob.name});matches.set(mob.mobId,found);
      for(const track of mob.tracks)for(const node of track.nodes)if(node.sourceMobId!==undefined)counts.set(node.sourceMobId,(counts.get(node.sourceMobId)??0)+1);
    }
    const ids=[...counts.keys()].sort(),page=ids.slice(after+1,after+1+limit).map((sourceMobId,offset)=>{
      const candidates=matches.get(sourceMobId)??[];
      return {index:after+1+offset,sourceMobId,references:counts.get(sourceMobId)!,status:candidates.length===0?"unresolved":candidates.length===1?"resolved":"ambiguous",candidateCount:candidates.length,candidates:candidates.slice(0,10),candidatesTruncated:candidates.length>10};
    });
    return {revision,sources:page,totalSourceIds:ids.length,nextAfter:after+1+page.length<ids.length?page.at(-1)?.index??null:null,complete:snapshot.bins.every(bin=>bin.complete),scope:"Direct source identities across captured saved bins, sorted by ID. Unresolved does not mean missing media; resolved does not validate cycles, source ranges or playback. Candidate samples are bounded; snapshot mob discovery enumerates all matching records."};
  }
  async mobs(revision:string,after=-1,limit=100){
    if(!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Invalid snapshot mob page");
    const snapshot=await this.read(revision),mobs=[];let index=0;
    for(const bin of snapshot.bins)for(const mob of bin.mobs){
      const current=index++;
      if(current>after&&mobs.length<=limit)mobs.push({index:current,bin:bin.file,binPresent:!snapshot.missingBins.includes(bin.file),binSha256:bin.sha256,mobId:mob.mobId,name:mob.name,mobType:mob.mobType,usageCode:mob.usageCode,rate:mob.rate,duration:mob.duration,trackCount:mob.tracks.length,complete:bin.complete});
    }
    const page=mobs.slice(0,limit);
    return {revision,mobs:page,totalMobs:index,nextAfter:mobs.length>limit?page.at(-1)!.index:null,origin:"historical saved snapshot; repeated mob IDs in different bins remain distinct entries"};
  }
  async list(after?:string,limit=20){
    if(after!==undefined)z.string().uuid().parse(after);
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error("Invalid snapshot discovery page");
    const directory=await this.library.directory(),names:string[]=[];let scanned=0;
    for await(const entry of await opendir(directory)){
      if(++scanned>10000)throw new Error("Snapshot directory exceeds discovery limit");
      if(entry.isFile()&&/^snapshot-[a-f0-9-]{36}\.json$/.test(entry.name)){
        const revision=entry.name.slice(9,-5);if(z.string().uuid().safeParse(revision).success)names.push(revision);
      }
    }
    const candidates=names.sort().filter(id=>!after||id>after),page=candidates.slice(0,limit),snapshots=[];let unavailable=0;
    for(const revision of page){
      try{const record=await this.read(revision);snapshots.push({revision,createdAt:record.createdAt,bins:record.bins.length,missingBins:record.missingBins.length,mobs:record.bins.reduce((sum,bin)=>sum+bin.mobs.length,0),complete:record.bins.every(bin=>bin.complete)});}
      catch{unavailable++;}
    }
    return {snapshots,nextAfter:candidates.length>page.length?page.at(-1)!:null,scanned:page.length,unavailable,meaning:"Historical saved snapshots. Follow nextAfter even for empty pages; damaged or inaccessible entries are counted without exposing their contents."};
  }
  async create(files:string[]){
    if(!files.length||files.length>Math.min(this.config.maxBins,100))throw new Error("Snapshot bin count exceeds limit");
    await this.library.directory();
    const sidecar=fileURLToPath(new URL("../../python/avid_timeline.py",import.meta.url));
    // src/library and dist/library have the same relative depth below the package root.
    await access(sidecar);
    const bins=[],capturedFiles=new Set<string>();let accumulatedBytes=0;
    for(const input of [...new Set(files)]){
      const file=await resolveReadablePath(input,this.config.allowedRoots,"file");
      if(capturedFiles.has(file))continue;
      capturedFiles.add(file);
      if(path.extname(file).toLowerCase()!==".avb")throw new Error("Expected AVB bin");
      if((await stat(file)).size>512*1024*1024)throw new Error("Bin exceeds snapshot size limit");
      const response=await runProcess(this.config.pythonExecutable,[sidecar,file,"--max-nodes","10000"],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:8*1024*1024});
      if(response.exitCode!==0)throw new Error(`Saved-bin index failed: ${response.stderr.slice(-2000)}`);
      const inspected=bin.parse(JSON.parse(response.stdout));
      accumulatedBytes+=Buffer.byteLength(JSON.stringify(inspected))+1;
      if(accumulatedBytes>32*1024*1024)throw new Error("Snapshot exceeds size limit while collecting bins");
      bins.push(inspected);
    }
    const revision=randomUUID(),record={revision,createdAt:new Date().toISOString(),bins};
    const serialized=JSON.stringify(record);
    if(Buffer.byteLength(serialized)>32*1024*1024)throw new Error("Snapshot exceeds size limit");
    await publishSnapshot(path.join(await this.library.directory(),`snapshot-${revision}.json`),serialized);
    return {revision,complete:bins.every(bin=>bin.complete),bins:bins.map(bin=>({file:bin.file,sha256:bin.sha256,mobs:bin.mobs.map(mob=>({mobId:mob.mobId,name:mob.name,mobType:mob.mobType,usageCode:mob.usageCode,rate:mob.rate,duration:mob.duration})),warnings:bin.warnings})),origin:"saved-bin; excludes unsaved editor changes"};
  }
  private async read(revision:string){
    z.string().uuid().parse(revision);const directory=await this.library.directory();
    const file=await resolveReadablePath(path.join(directory,`snapshot-${revision}.json`),[directory],"file");
    const record=snapshotSchema.parse(await readBoundedJson(file,32*1024*1024));
    if(record.revision!==revision)throw new Error("Snapshot identity mismatch");
    const missingBins:string[]=[];
    for(const bin of record.bins){
      try{await resolveReadablePath(bin.file,this.config.allowedRoots,"file");}
      catch(error){
        if((error as {code?:string}).code!=="PATH_NOT_FOUND")throw error;
        // Deleted bins may still be compared if their parent remains in scope.
        await resolveReadablePath(path.dirname(bin.file),this.config.allowedRoots,"directory");
        missingBins.push(bin.file);
      }
    }
    return {...record,missingBins};
  }
  async diff(baseline:string,candidate:string,after=-1,limit=200){
    if(!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>200)throw new Error("Invalid snapshot diff page");
    const before=await this.read(baseline),candidateRecord=await this.read(candidate);
    const index=(value:z.infer<typeof snapshotSchema>)=>{
      const entries=new Map<string,{bin:string}&z.infer<typeof mob>>(),bins=new Set<string>();
      for(const bin of value.bins){
        if(bins.has(bin.file))throw new Error("Duplicate bin identity in snapshot comparison");
        bins.add(bin.file);
        for(const mob of bin.mobs){
          const key=JSON.stringify([bin.file,mob.mobId]);
          if(entries.has(key))throw new Error("Duplicate mob identity within snapshot bin");
          entries.set(key,{bin:bin.file,...mob});
        }
      }
      return entries;
    };
    const a=index(before),b=index(candidateRecord),changes=[];
    for(const [key,value] of a){const next=b.get(key);if(!next)changes.push({change:"removed",bin:value.bin,mobId:value.mobId,name:value.name});else if(digest(value)!==digest(next))changes.push({change:"changed",bin:value.bin,mobId:value.mobId,before:value,after:next});}
    for(const [key,value] of b)if(!a.has(key))changes.push({change:"added",bin:value.bin,mobId:value.mobId,name:value.name});
    const page=changes.slice(after+1,after+1+limit).map((change,offset)=>({index:after+1+offset,...change}));
    const more=after+1+page.length<changes.length;
    return {baseline,candidate,changes:page,totalChanges:changes.length,nextAfter:more?page.at(-1)!.index:null,truncated:more,complete:[...before.bins,...candidateRecord.bins].every(bin=>bin.complete),coverage:{baseline:snapshotCoverage(before),candidate:snapshotCoverage(candidateRecord)},comparison:"Semantic mob/track/source fields; excludes volatile save metadata and opaque effect parameters. Zero changes do not establish equivalence when coverage is incomplete."};
  }
  async range(revision:string,mobId:string,start:number,end:number,ordinal?:number,after=-1,limit=100,binFile?:string){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start)throw new Error("Invalid edit-unit range");
    if(!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>200||(ordinal!==undefined&&(!Number.isSafeInteger(ordinal)||ordinal<0)))throw new Error("Invalid timeline range page");
    const snapshot=await this.read(revision);
    const matches=selectSnapshotBins(snapshot.bins,binFile).flatMap(bin=>bin.mobs.filter(mob=>mob.mobId===mobId).map(mob=>({bin,mob})));
    if(matches.length!==1)throw new Error("Expected one matching mob; provide its bin path from snapshot mob discovery when IDs repeat");
    const target=matches[0]!,results=[];let cursor=0;
    tracks:for(const track of target.mob.tracks){
      for(const node of track.nodes){
        const index=cursor++;
        if(index<=after||(ordinal!==undefined&&track.ordinal!==ordinal)||node.timelineStart>=end||node.timelineEnd<=start)continue;
        const overlapStart=Math.max(start,node.timelineStart),overlapEnd=Math.min(end,node.timelineEnd);
        results.push({index,track:track.ordinal,trackIndex:track.index,mediaKind:track.mediaKind,...node,overlapStart,overlapEnd,
          ...(node.sourceStart===undefined?{}:{overlapSourceStart:node.sourceStart+overlapStart-node.timelineStart,overlapSourceEnd:node.sourceStart+overlapEnd-node.timelineStart})});
        if(results.length>limit)break tracks;
      }
    }
    const page=results.slice(0,limit);
    return {revision,mobId,bin:target.bin.file,rate:target.mob.rate,duration:target.mob.duration,results:page,nextAfter:results.length>limit?page.at(-1)?.index:null,complete:target.bin.complete,warnings:target.bin.warnings,sourceReferenceCoverage:sourceReferenceCoverage(target.bin),snapshotSourceReferenceCoverage:sourceReferenceCoverage(target.bin,snapshot.bins),rangeConvention:"half-open edit units",origin:"saved-bin"};
  }
  async usage(revision:string,sourceMobId:string,after=-1,limit=500){
    if(!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>500)throw new Error("Invalid source usage page");
    const snapshot=await this.read(revision),usages=[];
    let index=0;
    for(const bin of snapshot.bins)for(const mob of bin.mobs)for(const track of mob.tracks)for(const node of track.nodes){
      if(node.sourceMobId===sourceMobId){const current=index++;if(current>after&&usages.length<=limit)usages.push({index:current,bin:bin.file,mobId:mob.mobId,name:mob.name,track:track.ordinal,mediaKind:track.mediaKind,rate:mob.rate,...node});}
    }
    const page=usages.slice(0,limit);
    const coverage=snapshotCoverage(snapshot);
    return {revision,sourceMobId,usages:page,totalReferences:index,nextAfter:usages.length>limit?page.at(-1)!.index:null,truncated:usages.length>limit,complete:snapshot.bins.every(bin=>bin.complete),coverage,scope:"Direct saved-bin source references; opaque effects, mixed rates and retimes may hide references. Zero matches in incomplete coverage do not prove the source is unused."};
  }
  async complexity(revision:string,mobId:string,binFile?:string){
    const snapshot=await this.read(revision);
    const matches=selectSnapshotBins(snapshot.bins,binFile).flatMap(bin=>bin.mobs.filter(mob=>mob.mobId===mobId).map(mob=>({bin,mob})));
    if(matches.length!==1)throw new Error("Expected one matching mob; provide its bin path from snapshot mob discovery when IDs repeat");
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
    return {revision,mobId,name:mob.name,bin:bin.file,binSha256:bin.sha256,rate:mob.rate,duration:mob.duration,durationSeconds:mob.duration/mob.rate,trackCount:tracks.length,nodes,opaqueNodes,sourceReferences,distinctSourceMobs:sources.size,tracks,complete:bin.complete&&opaqueNodes===0,warnings:bin.warnings,sourceReferenceCoverage:sourceReferenceCoverage(bin),origin:"saved snapshot; source bin may have changed since capture",limitations:["Counts describe stored direct nodes, not recursively expanded source graphs","Stereo channel-combiner references are counted per channel, not as editorial cuts","Opaque nodes are not classified as specific effects; no render-cost estimate","Excludes unsaved editor changes and does not verify media availability"]};
  }
}
