import {opendir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {qcOptions} from "./qc.js";
import {audioTimingSchema} from "./audio-timing.js";
import {videoTimingSchema} from "./video-timing.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";

const digest=z.string().regex(/^[a-f0-9]{64}$/),revisionSchema=z.string().uuid();
const blackTailSchema=z.object({start:z.number().finite().nonnegative(),end:z.null(),minimumDurationVerified:z.literal(false),meaning:z.string().max(10000)}).strict();
const openIntervalSchema=z.object({start:z.number().finite().nonnegative(),end:z.null(),openAtProcessingEnd:z.literal(true)}).strict();
const closedIntervalSchema=z.object({start:z.number().finite().nonnegative(),end:z.number().finite().positive()}).strict().refine(value=>value.end>value.start);
const legacyIntervalSchema=z.object({start:z.number().finite().nonnegative(),end:z.number().finite().positive(),openAtRangeEnd:z.literal(true)}).strict().refine(value=>value.end>value.start);
const videoCoverageSchema=z.object({decodedFrames:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),requestedSeconds:z.number().positive().max(600),meaning:z.string().max(10000)}).strict();
const coverageSchema=z.object({samplesPerChannel:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sampleRate:z.number().int().positive().max(768000),decodedSeconds:z.number().positive(),requestedSeconds:z.number().positive().max(600),amountMatchesRequestedDuration:z.boolean(),meaning:z.string().max(10000)}).strict();
const reportSchema=z.object({schema:z.literal(1),id:digest,range:z.object({start:z.number().nonnegative(),end:z.number().positive()}).refine(r=>r.end>r.start),options:qcOptions,streams:z.object({video:z.number().int().nonnegative().nullable(),audio:z.number().int().nonnegative().nullable()}),findings:z.record(z.string(),z.unknown()),streamDetails:z.unknown().optional(),timing:z.unknown().optional(),audioCoverage:coverageSchema.nullable().optional(),reviewRequired:z.literal(true),limitations:z.array(z.string().max(10000)).max(100),sourceModified:z.literal(false)})
  .extend({videoTiming:videoTimingSchema.nullable().optional(),videoTimingMeaning:z.string().max(10000).optional(),videoCoverage:videoCoverageSchema.nullable().optional(),audioTiming:audioTimingSchema.nullable().optional(),audioTimingMeaning:z.string().max(10000).optional()})
  .refine(value=>value.range.start===value.options.start&&value.range.end===value.options.end,"QC range and options disagree")
  .superRefine((value,ctx)=>{
    const {video,audio}=value.streams;
    if(value.videoTiming!==undefined){const timing=value.videoTiming;if(timing===null?video!==null:video===null||timing.frames!==value.videoCoverage?.decodedFrames)ctx.addIssue({code:"custom",message:"QC video timing is inconsistent"});}
    for(const [kind,stream] of [["black",video],["freeze",video],["silence",audio]] as const){
      const intervals=value.findings[kind];if(intervals===undefined)continue;
      if(!Array.isArray(intervals)||intervals.length>10000){ctx.addIssue({code:"custom",message:"QC event collection is invalid"});continue;}
      for(const interval of intervals){
        const open=interval&&typeof interval==="object"&&("openAtProcessingEnd" in interval||interval.end===null);
        if(open&&kind!=="black")continue; // Validated below with the open-interval schema.
        const parsed=(kind==="black"?closedIntervalSchema:z.union([closedIntervalSchema,legacyIntervalSchema])).safeParse(interval);
        if(!parsed.success||stream===null||parsed.data.start<value.range.start||parsed.data.end>value.range.end)ctx.addIssue({code:"custom",message:"QC closed interval is inconsistent"});
      }
    }
    for(const [kind,stream] of [["freeze",video],["silence",audio]] as const){
      const intervals=value.findings[kind];
      if(Array.isArray(intervals))for(const interval of intervals){
        if(interval&&typeof interval==="object"&&("openAtProcessingEnd" in interval||interval.end===null)){
          const parsed=openIntervalSchema.safeParse(interval);if(!parsed.success||stream===null||parsed.data.start<value.range.start||parsed.data.start>=value.range.end)ctx.addIssue({code:"custom",message:"QC open interval is inconsistent"});
        }
      }
    }
    const blackTail=value.findings.blackOpenAtProcessingEnd;
    if(blackTail!==undefined&&blackTail!==null){const parsed=blackTailSchema.safeParse(blackTail);if(!parsed.success||video===null||parsed.data.start<value.range.start||parsed.data.start>=value.range.end)ctx.addIssue({code:"custom",message:"QC open black detection is inconsistent"});}
    if(value.audioTiming!==undefined){const t=value.audioTiming;if(t===null?audio!==null:audio===null||t.sampleRate!==value.audioCoverage?.sampleRate||t.samples!==value.findings.audioSamplesPerChannel)ctx.addIssue({code:"custom",message:"QC audio timing is inconsistent"});}
    if((video===null&&audio===null)||(video!==null&&video===audio)||
      (value.options.videoStream!==undefined&&value.options.videoStream!==video)||
      (value.options.audioStream!==undefined&&value.options.audioStream!==audio)){
      ctx.addIssue({code:"custom",message:"QC stream selection is inconsistent"});
    }
    const videoCoverage=value.videoCoverage;
    if(videoCoverage!==undefined&&(videoCoverage===null?video!==null:video===null||videoCoverage.requestedSeconds!==value.range.end-value.range.start))ctx.addIssue({code:"custom",message:"QC video coverage is inconsistent"});
    const coverage=value.audioCoverage;
    if(coverage===undefined)return; // Legacy reports predate measured sample counts.
    const invalid=()=>ctx.addIssue({code:"custom",message:"QC audio coverage is inconsistent"});
    if(coverage===null){if(value.streams.audio!==null)invalid();return;}
    if(value.streams.audio===null||coverage.requestedSeconds!==value.range.end-value.range.start||coverage.decodedSeconds!==coverage.samplesPerChannel/coverage.sampleRate||coverage.samplesPerChannel!==value.findings.audioSamplesPerChannel||coverage.amountMatchesRequestedDuration!==(Math.abs(coverage.samplesPerChannel-coverage.requestedSeconds*coverage.sampleRate)<=1))invalid();
  });
const checksum=(data:Buffer)=>createHash("sha256").update(data).digest("hex");

export class QcReports {
  constructor(private readonly config:ServerConfig){}
  private async source(id:string){
    digest.parse(id);const entry=await new MediaLibrary(this.config).validatedMetadata(id);
    const file=await resolveReadablePath(entry.file,this.config.allowedRoots,"file");
    if(await sha256File(file)!==id)throw new Error("QC source changed; reindex before reading reports");
    return file;
  }
  private async artifact(root:string,revision:string){
    revisionSchema.parse(revision);
    const file=await resolveReadablePath(path.join(root,`qc-${revision}.json`),[root],"file");
    const bytes=await readBoundedFile(file,4*1024*1024),sha256=checksum(bytes);
    const report=reportSchema.parse(JSON.parse(bytes.toString("utf8")));
    if(checksum(await readBoundedFile(file,4*1024*1024))!==sha256)throw new Error("QC report changed while reading");
    return {revision,file,sha256,report};
  }
  async read(id:string,revision:string,expectedSha256?:string){
    if(expectedSha256!==undefined)digest.parse(expectedSha256);
    const source=await this.source(id),root=await new MediaLibrary(this.config).directory();
    const result=await this.artifact(root,revision);
    if(result.report.id!==id)throw new Error("QC report belongs to another media ID");
    if(expectedSha256!==undefined&&result.sha256!==expectedSha256)throw new Error("QC report checksum mismatch");
    if(await sha256File(source)!==id)throw new Error("QC source changed while reading");
    return {...result,sourceCurrent:true,videoCoverageStatus:result.report.videoCoverage===undefined?"not_recorded":result.report.videoCoverage===null?"video_not_selected":"recorded",audioCoverageStatus:result.report.audioCoverage===undefined?"not_recorded":result.report.audioCoverage===null?"audio_not_selected":"recorded",meaning:"Stored JSON findings, not a new decode or authenticated delivery verdict"};
  }
  async list(id:string,after?:string,limit=20){
    if(after!==undefined)revisionSchema.parse(after);
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error("Report page size must be 1 to 50");
    const source=await this.source(id),root=await new MediaLibrary(this.config).directory();
    const names:string[]=[];let scanned=0;
    const directory=await opendir(root);
    for await(const entry of directory){
      if(++scanned>10000)throw new Error("Library directory exceeds QC discovery limit");
      if(entry.isFile()&&/^qc-[a-f0-9-]{36}\.json$/.test(entry.name)){
        const revision=entry.name.slice(3,-5);
        if(revisionSchema.safeParse(revision).success)names.push(revision);
      }
    }
    const candidates=names.sort().filter(name=>!after||name>after),page=candidates.slice(0,limit),reports=[];
    let unreadable=0;
    for(const revision of page){
      try{const item=await this.artifact(root,revision);if(item.report.id===id)reports.push({revision,sha256:item.sha256,range:item.report.range,streams:item.report.streams});}
      catch{unreadable++;}
    }
    if(await sha256File(source)!==id)throw new Error("QC source changed during discovery");
    return {id,reports,next:candidates.length>page.length?page.at(-1):null,scanned:page.length,unreadable,meaning:"Pages scan stored report files; a page may have no matching media reports. Unreadable files are counted, never treated as successful reports."};
  }
}
