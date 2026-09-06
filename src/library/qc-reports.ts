import {opendir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {qcOptions} from "./qc.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {sha256File} from "../analysis/file-inventory.js";

const digest=z.string().regex(/^[a-f0-9]{64}$/),revisionSchema=z.string().uuid();
const coverageSchema=z.object({samplesPerChannel:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sampleRate:z.number().int().positive().max(768000),decodedSeconds:z.number().positive(),requestedSeconds:z.number().positive().max(600),amountMatchesRequestedDuration:z.boolean(),meaning:z.string().max(10000)}).strict();
const reportSchema=z.object({schema:z.literal(1),id:digest,range:z.object({start:z.number().nonnegative(),end:z.number().positive()}).refine(r=>r.end>r.start),options:qcOptions,streams:z.object({video:z.number().int().nonnegative().nullable(),audio:z.number().int().nonnegative().nullable()}),findings:z.record(z.string(),z.unknown()),streamDetails:z.unknown().optional(),timing:z.unknown().optional(),audioCoverage:coverageSchema.nullable().optional(),reviewRequired:z.literal(true),limitations:z.array(z.string().max(10000)).max(100),sourceModified:z.literal(false)})
  .refine(value=>value.range.start===value.options.start&&value.range.end===value.options.end,"QC range and options disagree")
  .superRefine((value,ctx)=>{
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
    digest.parse(id);const [entry]=await new MediaLibrary(this.config).metadata([id]);
    if(!entry)throw new Error("Unknown QC media");
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
    return {...result,sourceCurrent:true,audioCoverageStatus:result.report.audioCoverage===undefined?"not_recorded":result.report.audioCoverage===null?"audio_not_selected":"recorded",meaning:"Stored JSON findings, not a new decode or authenticated delivery verdict"};
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
