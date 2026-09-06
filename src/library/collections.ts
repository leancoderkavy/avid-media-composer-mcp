import {readFile, writeFile, stat} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {requireCapability} from "../security/capabilities.js";
import {resolveReadablePath} from "../security/path-policy.js";

import {MediaLibrary} from "./media-library.js";
import {readBoundedJson} from "../security/bounded-read.js";

export const selectSchema=z.object({
  id:z.string().regex(/^[a-f0-9]{64}$/),start:z.number().nonnegative(),end:z.number().positive(),
  label:z.string().max(500).default(""),tags:z.array(z.string().min(1).max(100)).max(30).default([]),
  note:z.string().max(4000).default(""),
}).strict().refine(value=>value.end>value.start,"Select end must follow start");
export const collectionSchema=z.object({name:z.string().min(1).max(120),selects:z.array(selectSchema).min(1).max(500)}).strict();
type Collection=z.infer<typeof collectionSchema>;

/** Immutable user-curated selects. Timeline positions are seconds from the stringout start. */
export class Collections {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  private async validate(input:Collection,verifyContent=false){
    const ids=[...new Set(input.selects.map(select=>select.id))];
    const entries=verifyContent?await Promise.all(ids.map(id=>this.library.validatedMetadata(id))):await this.library.metadata(ids);
    for(const select of input.selects){
      const entry=entries.find(entry=>entry.id===select.id)!;
      const duration=Number(entry.metadata.format?.duration);
      if(!Number.isFinite(duration)||select.end>duration)throw new Error("Select exceeds indexed media duration");
    }
    return entries;
  }
  async save(input:Collection){
    requireCapability(this.config.capabilities,"project-write");
    const collection=collectionSchema.parse(input);
    await this.validate(collection);
    const revision=randomUUID();
    await writeFile(path.join(await this.library.directory(),`collection-${revision}.json`),JSON.stringify(collection),{flag:"wx"});
    return {revision,name:collection.name,selects:collection.selects.length,immutable:true};
  }
  async read(revision:string){
    z.string().uuid().parse(revision);
    const directory=await this.library.directory();
    const file=await resolveReadablePath(path.join(directory,`collection-${revision}.json`),[directory],"file");
    const collection=collectionSchema.parse(await readBoundedJson(file,8*1024*1024));
    await this.validate(collection);
    return {revision,...collection};
  }
  async range(revision:string,start:number,end:number,after=-1,limit=50){
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error("Invalid timeline range");
    const collection=await this.read(revision);
    let position=0;
    const timeline=collection.selects.map((select,index)=>{
      const timelineStart=position;position+=select.end-select.start;
      return {...select,index,timelineStart,timelineEnd:position};
    });
    const matches=timeline.filter(select=>select.index>after&&select.timelineStart<end&&select.timelineEnd>start);
    const results=matches.slice(0,limit).map(select=>({...select,
      overlapSourceStart:select.start+Math.max(0,start-select.timelineStart),
      overlapSourceEnd:select.end-Math.max(0,select.timelineEnd-end),
    }));
    return {revision,duration:position,results,nextAfter:matches.length>limit?results.at(-1)?.index:null,rangeConvention:"half-open",origin:"local collection; not the live Avid timeline"};
  }
  async exportOtio(revision:string,rate:number){
    requireCapability(this.config.capabilities,"export");
    if(!Number.isFinite(rate)||rate<=0||rate>240)throw new Error("Invalid edit rate");
    const collection=await this.read(revision);
    const entries=await this.validate(collection,true);

    const rational=(value:number)=>({OTIO_SCHEMA:"RationalTime.1",value,rate});
    const range=(start:number,duration:number)=>({OTIO_SCHEMA:"TimeRange.1",start_time:rational(start),duration:rational(duration)});
    const clips=collection.selects.map(select=>{
      const entry=entries.find(entry=>entry.id===select.id)!;
      const start=Math.round(select.start*rate),end=Math.round(select.end*rate);
      if(end<=start)throw new Error("Select becomes empty at this edit rate");
      return {OTIO_SCHEMA:"Clip.2",name:select.label||path.basename(entry.file),source_range:range(start,end-start),
        effects:[],markers:[],enabled:true,metadata:{avid_mcp:{sourceSha256:select.id,tags:select.tags,note:select.note,requestedStart:select.start,requestedEnd:select.end}},
        media_references:{DEFAULT_MEDIA:{OTIO_SCHEMA:"ExternalReference.1",target_url:pathToFileURL(entry.file).href,
          available_range:range(0,Math.floor(Number(entry.metadata.format.duration)*rate)),metadata:{}}},active_media_reference_key:"DEFAULT_MEDIA"};
    });
    const document={OTIO_SCHEMA:"Timeline.1",name:collection.name,global_start_time:rational(0),metadata:{avid_mcp:{collectionRevision:revision}},
      tracks:{OTIO_SCHEMA:"Stack.1",name:"Tracks",source_range:null,effects:[],markers:[],metadata:{},children:[
        {OTIO_SCHEMA:"Track.1",name:"V1",kind:"Video",source_range:null,effects:[],markers:[],metadata:{},children:clips}
      ]}};
    const output=path.join(await this.library.directory(),`selects-${randomUUID()}.otio`);
    await writeFile(output,JSON.stringify(document,null,2),{flag:"wx"});
    return {output,revision,clips:clips.length,rate,quantization:"Nearest edit frame; exclusive end",avidImportVerified:false,
      limitations:["One video track; audio routing, transitions, effects and retimes are not authored", "References local source files; media is not embedded"]};
  }
}
