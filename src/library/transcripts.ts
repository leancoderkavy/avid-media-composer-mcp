import {open,unlink,opendir} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary,transcriptSchema} from "./media-library.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";

const segment=transcriptSchema.element;
export const transcriptEdits=z.array(z.discriminatedUnion("action",[
  z.object({action:z.literal("replace"),index:z.number().int().nonnegative(),segment}).strict(),
  z.object({action:z.literal("remove"),index:z.number().int().nonnegative()}).strict(),
  z.object({action:z.literal("add"),segment}).strict(),
])).min(1).max(1000);

export class TranscriptRevisions {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  private async read(id:string,revision:string){
    z.string().uuid().parse(revision);await this.library.metadata([id]);
    const root=await this.library.directory(),file=await resolveReadablePath(path.join(root,`${id}.transcript-${revision}.json`),[root],"file");
    const bytes=await readBoundedFile(file,20*1024*1024);
    const record=z.object({id:z.literal(id),segments:transcriptSchema,parentRevision:z.string().uuid().optional()}).parse(JSON.parse(bytes.toString("utf8")));
    return {file,record,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  async list(id:string,after="",limit=50){
    await this.library.metadata([id]);z.number().int().min(1).max(100).parse(limit);
    if(after)z.string().uuid().parse(after);
    const root=await this.library.directory(),revisions:string[]=[];let scanned=0;
    const directory=await opendir(root);
    for await(const entry of directory){
      if(++scanned>50000)throw new Error("Library directory exceeds revision discovery limit");
      if(!entry.name.startsWith(`${id}.transcript-`))continue;
      const revision=entry.name.slice(id.length+12,-5);
      if(!entry.name.endsWith(".json")||!z.string().uuid().safeParse(revision).success)continue;
      if(revision>after)revisions.push(revision);
    }
    revisions.sort();const page=[];
    for(const revision of revisions.slice(0,limit)){const {record,sha256}=await this.read(id,revision);page.push({revision,sha256,segmentCount:record.segments.length,parentRevision:record.parentRevision});}
    return {id,revisions:page,nextAfter:revisions.length>limit?page.at(-1)?.revision:null,order:"revision-id"};
  }
  private async locked<T>(id:string,operation:()=>Promise<T>){
    requireCapability(this.config.capabilities,"project-write");await this.library.metadata([id]);
    const lock=path.join(await this.library.directory(),`${id}.transcripts.lock`),handle=await open(lock,"wx");
    try{return await operation();}finally{await handle.close();await unlink(lock);}
  }
  async correct(id:string,revision:string,expectedSha256:string,input:z.infer<typeof transcriptEdits>){
    const edits=transcriptEdits.parse(input);
    return this.locked(id,async()=>{
      const {record,sha256}=await this.read(id,revision);if(sha256!==expectedSha256)throw new Error("Transcript changed; reload its checksum");
      const changes=new Map<number,typeof edits[number]>();
      for(const edit of edits)if(edit.action!=="add"){
        if(edit.index>=record.segments.length||changes.has(edit.index))throw new Error("Invalid or duplicate original segment index");changes.set(edit.index,edit);
      }
      const segments=record.segments.flatMap((item,index)=>{const edit=changes.get(index);return !edit?[item]:edit.action==="replace"?[edit.segment]:[];});
      for(const edit of edits)if(edit.action==="add")segments.push(edit.segment);
      const result=await this.library.importTranscript(id,segments,revision);
      return {...result,parentRevision:revision,sourceModified:false,previousRevisionRetained:true};
    });
  }
  async remove(id:string,revision:string,expectedSha256:string){
    return this.locked(id,async()=>{
      const {file,sha256}=await this.read(id,revision);if(sha256!==expectedSha256)throw new Error("Transcript changed; reload its checksum");
      await unlink(file);
      return {id,revision,deleted:true,sourceModified:false,note:"Only this revision was removed. Other revisions, exported documents and derived artifacts remain."};
    });
  }
}
