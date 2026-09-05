import {mkdir,writeFile,rename,open,unlink,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedJson} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
import {MediaLibrary} from "./media-library.js";
import {faceRuntime,FACE_REVISION} from "./face-runtime.js";
import {cosine} from "./visual.js";

const faceId=z.string().regex(/^f\d{5}$/),clusterId=z.string().uuid();
const faceSchema=z.object({faceId,mediaId:z.string().regex(/^[a-f0-9]{64}$/),time:z.number().nonnegative(),box:z.array(z.number().finite()).length(4),confidence:z.number().min(0).max(1),crop:z.string().regex(/^f\d{5}\.jpg$/),embedding:z.array(z.number().finite()).length(128)});
type Face=z.infer<typeof faceSchema>;
const clusterSchema=z.object({clusterId,name:z.string().max(120).nullable(),faceIds:z.array(faceId).max(1000)});
type Cluster=z.infer<typeof clusterSchema>;
export const peopleRange=z.object({start:z.number().nonnegative(),end:z.number().positive()}).strict().refine(range=>range.end>range.start,"Range end must exceed start");
const coverageSchema=z.object({mediaId:z.string().regex(/^[a-f0-9]{64}$/),start:z.number().nonnegative(),end:z.number().positive(),samples:z.number().int().min(1).max(120)});
export const peopleSearchOptions=z.object({indexIds:z.array(z.string().uuid()).min(1).max(20).optional(),mediaIds:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100).optional(),range:peopleRange.optional(),threshold:z.number().min(-1).max(1).default(0.45),limit:z.number().int().min(1).max(100).default(50)}).strict();
const recordSchema=z.object({schema:z.literal(1),revision:z.string().uuid(),modelRevision:z.literal(FACE_REVISION),faces:z.array(faceSchema).max(1000),clusters:z.array(clusterSchema).max(1000),threshold:z.number().min(0).max(1),coverage:z.array(coverageSchema).min(1).max(20).optional()});
type RecordData=z.infer<typeof recordSchema>;
export const peopleEditSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("name"),clusterId,name:z.string().max(120)}).strict(),
  z.object({action:z.literal("merge"),from:clusterId,into:clusterId}).strict(),
  z.object({action:z.literal("move"),faceId,into:clusterId.nullable()}).strict(),
  z.object({action:z.literal("remove_face"),faceId}).strict(),
  z.object({action:z.literal("recluster"),threshold:z.number().min(0).max(1)}).strict(),
]);
export function peopleSampleTimes(duration:number,samples:number,range?:z.infer<typeof peopleRange>){
  if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(samples)||samples<1||samples>120)throw new Error("Invalid people duration or sample count");
  const selected=peopleRange.parse(range??{start:0,end:duration});if(selected.end>duration)throw new Error("People range exceeds source duration");
  return {start:selected.start,end:selected.end,times:Array.from({length:samples},(_,i)=>selected.start+(selected.end-selected.start)*(i+0.5)/samples)};
}

/** Greedy complete-link grouping avoids transitive similarity chains; names are user supplied. */
export function clusterFaces(faces:Face[],threshold:number):Cluster[]{
  if(faces.length>1000||!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Error("Invalid cluster limits");
  const groups:{cluster:Cluster;members:Face[]}[]=[];
  for(const face of faces){
    const group=groups.find(group=>group.members.every(member=>cosine(face.embedding,member.embedding)>=threshold));
    if(group){group.members.push(face);group.cluster.faceIds.push(face.faceId);}
    else groups.push({cluster:{clusterId:randomUUID(),name:null,faceIds:[face.faceId]},members:[face]});
  }
  return groups.map(group=>group.cluster);
}
export class People {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  private async directory(indexId:string){z.string().uuid().parse(indexId);const root=await this.library.directory();return resolveReadablePath(path.join(root,`people-${indexId}`),[root],"directory");}
  private async read(indexId:string){
    const directory=await this.directory(indexId),file=await resolveReadablePath(path.join(directory,"index.json"),[directory],"file");
    const record=recordSchema.parse(await readBoundedJson(file,8*1024*1024));
    if(new Set(record.faces.map(face=>face.faceId)).size!==record.faces.length||new Set(record.clusters.map(cluster=>cluster.clusterId)).size!==record.clusters.length)throw new Error("Duplicate face or cluster identifier");
    await this.library.metadata([...new Set([...record.faces.map(face=>face.mediaId),...(record.coverage??[]).map(row=>row.mediaId)])]);
    if(record.coverage){
      if(new Set(record.coverage.map(row=>row.mediaId)).size!==record.coverage.length||record.coverage.reduce((sum,row)=>sum+row.samples,0)>1200)throw new Error("Invalid people coverage");
      const plans=new Map(record.coverage.map(row=>[row.mediaId,peopleSampleTimes(row.end,row.samples,{start:row.start,end:row.end})]));
      if(record.faces.some(face=>!plans.get(face.mediaId)?.times.includes(face.time)))throw new Error("Face timestamp differs from sampled coverage");
    }
    const seen=new Set<string>();
    for(const cluster of record.clusters)for(const id of cluster.faceIds){if(seen.has(id)||!record.faces.some(face=>face.faceId===id))throw new Error("Invalid face membership");seen.add(id);}
    if(seen.size!==record.faces.length)throw new Error("Unassigned face in collection");
    return {directory,record};
  }
  async index(ids:string[],samples:number,threshold=0.45,range?:z.infer<typeof peopleRange>){
    z.number().min(0).max(1).parse(threshold);
    requireCapability(this.config.capabilities,"project-write");requireCapability(this.config.capabilities,"export");
    if(!this.config.modelDirectory)throw new Error("Install optional face models and set AVID_MCP_MODEL_DIR");
    if(!ids.length||ids.length>20||!Number.isInteger(samples)||samples<1||samples>120||new Set(ids).size*samples>1200)throw new Error("People indexing is limited to 20 media files, 120 samples each and 1200 total samples");
    if(range)peopleRange.parse(range);
    const entries=await this.library.metadata([...new Set(ids)]),coverage=entries.map(entry=>{const plan=peopleSampleTimes(Number(entry.metadata.format?.duration),samples,range);return {mediaId:entry.id,start:plan.start,end:plan.end,samples};});
    const runtime=await faceRuntime(this.config.modelDirectory,this.config.pythonExecutable);
    const indexId=randomUUID(),directory=path.join(await this.library.directory(),`people-${indexId}`);await mkdir(directory);
    const frames:{id:string;time:number;file:string}[]=[];
    for(const entry of entries){
      const source=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");
      if(await sha256File(source)!==entry.id)throw new Error("Source changed since indexing");
      const plan=peopleSampleTimes(Number(entry.metadata.format?.duration),samples,range);
      for(const time of plan.times){
        const file=path.join(directory,`frame-${frames.length}.jpg`);
        const result=await runProcess(this.config.ffmpegExecutable??"ffmpeg",["-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-ss",String(time),"-i",source,"-map","0:v:0","-frames:v","1","-vf","scale=640:-2",file],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:1048576});
        if(result.exitCode!==0)throw new Error("Face frame extraction failed; inspect partial index directory");
        frames.push({id:entry.id,time,file});
      }
      if(await sha256File(source)!==entry.id)throw new Error("Source changed during face frame extraction");
    }
    const manifest=path.join(directory,"request.json");await writeFile(manifest,JSON.stringify({root:directory,models:runtime.root,frames}),{flag:"wx"});
    const result=await runProcess(runtime.executable,[fileURLToPath(new URL("../../python/avid_faces.py",import.meta.url)),manifest],{timeoutMs:Math.max(this.config.commandTimeoutMs,120000),maxOutputBytes:8*1024*1024});
    if(result.exitCode!==0)throw new Error(`Face analysis failed: ${result.stderr.slice(-1000)}`);
    const faces=z.array(faceSchema).max(1000).parse(JSON.parse(result.stdout).faces),clusters=clusterFaces(faces,threshold);
    if(faces.some(face=>!frames.some(frame=>frame.id===face.mediaId&&frame.time===face.time)))throw new Error("Face result differs from requested source samples");
    for(const entry of entries)if(await sha256File(await resolveReadablePath(entry.file,this.config.allowedRoots,"file"))!==entry.id)throw new Error("Source changed during face analysis");
    const record:RecordData={schema:1,revision:randomUUID(),modelRevision:FACE_REVISION,faces,clusters,threshold,coverage};
    await writeFile(path.join(directory,"index.json"),JSON.stringify(record),{flag:"wx"});
    return {indexId,revision:record.revision,faces:faces.length,clusters:clusters.length,samples:frames.length,coverage,reviewRequired:true,meaning:"Visual similarity groups from requested seek times, not exact decoded PTS or exhaustive appearances; names are supplied by the user, not inferred"};
  }
  async list(indexId:string,after=-1,limit=50){
    const {record}=await this.read(indexId);
    const groups=record.clusters.map((cluster,index)=>({...cluster,index,count:cluster.faceIds.length,faceIds:undefined})).filter(cluster=>cluster.index>after);
    return {indexId,revision:record.revision,clusters:groups.slice(0,limit),nextAfter:groups.length>limit?groups[limit-1]?.index:null,faces:record.faces.length,coverage:record.coverage??null,reviewRequired:true};
  }
  async faces(indexId:string,cluster:string|undefined,after=-1,limit=50){
    const {directory,record}=await this.read(indexId);
    const group=cluster?record.clusters.find(item=>item.clusterId===cluster):undefined;if(cluster&&!group)throw new Error("Unknown cluster");
    const faces=record.faces.map((face,index)=>({...face,index})).filter(face=>face.index>after&&(!group||group.faceIds.includes(face.faceId)));
    const page=[];for(const {embedding,crop,...face} of faces.slice(0,limit))page.push({...face,crop:await resolveReadablePath(path.join(directory,crop),[directory],"file")});
    return {indexId,revision:record.revision,faces:page,nextAfter:faces.length>limit?page.at(-1)?.index:null};
  }
  async similar(referenceIndexId:string,referenceFaceId:string,input:z.input<typeof peopleSearchOptions>={}){
    faceId.parse(referenceFaceId);const options=peopleSearchOptions.parse(input),reference=await this.read(referenceIndexId),selected=reference.record.faces.find(face=>face.faceId===referenceFaceId);
    if(!selected)throw new Error("Unknown reference face");
    if(!selected.embedding.some(value=>value!==0))throw new Error("Reference face has no usable embedding");
    const targets=[...new Set(options.indexIds??[referenceIndexId])],matches=[],revisions=[];
    for(const indexId of targets){
      const {record,directory}=indexId===referenceIndexId?reference:await this.read(indexId);revisions.push({indexId,revision:record.revision});
      const groups=new Map(record.clusters.flatMap(cluster=>cluster.faceIds.map(id=>[id,cluster] as const)));
      for(const face of record.faces){
        if(indexId===referenceIndexId&&face.faceId===referenceFaceId)continue;
        if(options.mediaIds&&!options.mediaIds.includes(face.mediaId))continue;
        if(options.range&&(face.time<options.range.start||face.time>=options.range.end))continue;
        const score=cosine(selected.embedding,face.embedding);if(!Number.isFinite(score)||score<options.threshold)continue;
        const cluster=groups.get(face.faceId)!;
        matches.push({indexId,revision:record.revision,faceId:face.faceId,mediaId:face.mediaId,time:face.time,score,clusterId:cluster.clusterId,name:cluster.name,crop:path.join(directory,face.crop),directory});
      }
    }
    matches.sort((a,b)=>b.score-a.score||a.indexId.localeCompare(b.indexId)||a.faceId.localeCompare(b.faceId));
    const results=[];for(const {directory,crop,...match} of matches.slice(0,options.limit))results.push({...match,crop:await resolveReadablePath(crop,[directory],"file")});
    return {reference:{indexId:referenceIndexId,revision:reference.record.revision,faceId:referenceFaceId},indices:revisions,matches:results,matchingFaces:matches.length,hasMore:matches.length>options.limit,reviewRequired:true,identityVerified:false,note:"Cosine similarity between sampled face features, not identity verification or exhaustive appearances. Names are user supplied. The selected reference occurrence is excluded."};
  }
  async edit(indexId:string,expectedRevision:string,input:z.infer<typeof peopleEditSchema>){
    requireCapability(this.config.capabilities,"project-write");const operation=peopleEditSchema.parse(input),directory=await this.directory(indexId),lock=path.join(directory,"write.lock");
    const handle=await open(lock,"wx");
    try{
      const {record}=await this.read(indexId);if(record.revision!==expectedRevision)throw new Error("People collection changed; reload before editing");
      const cluster=(id:string)=>{const value=record.clusters.find(group=>group.clusterId===id);if(!value)throw new Error("Unknown cluster");return value;};
      let removed:Face|undefined;
      if(operation.action==="name")cluster(operation.clusterId).name=operation.name||null;
      if(operation.action==="merge"){
        if(operation.from===operation.into)throw new Error("Merge requires two different clusters");
        const from=cluster(operation.from),into=cluster(operation.into);into.faceIds.push(...from.faceIds);from.faceIds=[];
      }
      if(operation.action==="move"||operation.action==="remove_face"){
        const face=record.faces.find(face=>face.faceId===operation.faceId);if(!face)throw new Error("Unknown face");
        const target=operation.action==="move"&&operation.into?cluster(operation.into):undefined;
        for(const group of record.clusters)group.faceIds=group.faceIds.filter(id=>id!==face.faceId);
        if(operation.action==="move"){
          if(target)target.faceIds.push(face.faceId);else record.clusters.push({clusterId:randomUUID(),name:null,faceIds:[face.faceId]});
        }else{removed=face;record.faces=record.faces.filter(value=>value.faceId!==face.faceId);}
      }
      if(operation.action==="recluster"){record.threshold=operation.threshold;record.clusters=clusterFaces(record.faces,record.threshold);}
      record.clusters=record.clusters.filter(group=>group.faceIds.length);record.revision=randomUUID();
      const temporary=path.join(directory,`index-${record.revision}.tmp`);await writeFile(temporary,JSON.stringify(record),{flag:"wx"});await rename(temporary,path.join(directory,"index.json"));
      if(removed)await unlink(await resolveReadablePath(path.join(directory,removed.crop),[directory],"file"));
      return {indexId,revision:record.revision,faces:record.faces.length,clusters:record.clusters.length,namesReset:operation.action==="recluster",note:removed?"Face crop and embedding removed; sampled source frames remain until index deletion":undefined};
    }finally{await handle.close();await unlink(lock);}
  }
  async remove(indexId:string,expectedRevision:string){
    requireCapability(this.config.capabilities,"project-write");const directory=await this.directory(indexId),lock=path.join(directory,"write.lock"),handle=await open(lock,"wx");
    try{
      const {record}=await this.read(indexId);if(record.revision!==expectedRevision)throw new Error("People collection changed");
      const files=await readdir(directory);
      if(files.length>2500)throw new Error("Index directory exceeds removal limit");
      // Validate every target first; only this index's generated leaf files can be removed.
      const targets=[];for(const file of files){if(file==="write.lock")continue;if(!/^(index\.json|request\.json|frame-\d+\.jpg|f\d{5}\.jpg)$/.test(file))throw new Error("Unexpected file in people directory; inspect before removal");targets.push(await resolveReadablePath(path.join(directory,file),[directory],"file"));}
      for(const target of targets)await unlink(target);
      return {indexId,deleted:true,filesRemoved:targets.length,sourceMediaDeleted:false};
    }finally{await handle.close();await unlink(lock);}
  }
}
