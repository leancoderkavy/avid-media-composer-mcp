import {open,unlink,opendir,lstat} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary,transcriptSchema} from "./media-library.js";
import {readBoundedFile} from "../security/bounded-read.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {speakerAssignmentProvenance} from "./speaker-assignments.js";

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
    const record=z.object({id:z.literal(id),segments:transcriptSchema,parentRevision:z.string().uuid().optional(),speakerAssignment:speakerAssignmentProvenance.optional()}).refine(value=>!value.speakerAssignment||value.speakerAssignment.transcriptRevision===value.parentRevision,"Speaker assignment parent mismatch").parse(JSON.parse(bytes.toString("utf8")));
    return {file,record,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  async snapshot(id:string,revision:string){return this.read(id,revision);}
  async speakerAssignmentPage(id:string,revision:string,expectedSha256:string,offset=0,limit=100){
    z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSha256);z.number().int().min(0).max(1000).parse(offset);z.number().int().min(1).max(500).parse(limit);
    const {record,sha256}=await this.read(id,revision);if(sha256!==expectedSha256)throw new Error("Transcript changed; reload its checksum");
    if(!record.speakerAssignment)return {id,revision,sha256,speakerAssignment:null,assignments:[],totalAssignments:0,nextOffset:null};
    const {assignments,...provenance}=record.speakerAssignment;
    return {id,revision,sha256,parentRevision:record.parentRevision,speakerAssignment:provenance,assignments:assignments.slice(offset,offset+limit),totalAssignments:assignments.length,nextOffset:offset+limit<assignments.length?offset+limit:null,reviewRequired:true};
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
  private async locked<T>(id:string,operation:(assertOwner:()=>Promise<void>)=>Promise<T>){
    requireCapability(this.config.capabilities,"project-write");await this.library.metadata([id]);
    const lock=path.join(await this.library.directory(),`${id}.transcripts.lock`),handle=await open(lock,"wx",0o600);
    const owner=JSON.stringify({pid:process.pid,operation:randomUUID(),createdAt:new Date().toISOString()}),identity=await handle.stat();
    const assertOwner=async()=>{
      try{
        const current=await lstat(lock);
        if(!current.isFile()||current.dev!==identity.dev||current.ino!==identity.ino||(await readBoundedFile(lock,16384)).toString("utf8")!==owner)throw new Error("ownership mismatch");
      }catch{throw new Error("Transcript lock changed or unavailable; replacement retained. Inspect revisions before retrying: an operation may already have completed.");}
    };
    try{await handle.writeFile(owner);return await operation(assertOwner);}
    finally{await handle.close();await assertOwner();await unlink(lock);}
  }
  async correct(id:string,revision:string,expectedSha256:string,input:z.infer<typeof transcriptEdits>,speakerAssignment?:z.infer<typeof speakerAssignmentProvenance>){
    const edits=transcriptEdits.parse(input);
    return this.locked(id,async(assertOwner)=>{
      const {record,sha256}=await this.read(id,revision);if(sha256!==expectedSha256)throw new Error("Transcript changed; reload its checksum");
      const changes=new Map<number,typeof edits[number]>();
      for(const edit of edits)if(edit.action!=="add"){
        if(edit.index>=record.segments.length||changes.has(edit.index))throw new Error("Invalid or duplicate original segment index");changes.set(edit.index,edit);
      }
      const segments=record.segments.flatMap((item,index)=>{const edit=changes.get(index);return !edit?[item]:edit.action==="replace"?[edit.segment]:[];});
      for(const edit of edits)if(edit.action==="add")segments.push(edit.segment);
      if(speakerAssignment&&(speakerAssignment.transcriptRevision!==revision||speakerAssignment.transcriptSha256!==sha256))throw new Error("Speaker assignment transcript reference mismatch");
      await assertOwner();
      const result=await this.library.importTranscript(id,segments,revision,speakerAssignment);
      return {...result,parentRevision:revision,sourceModified:false,previousRevisionRetained:true};
    });
  }
  async remove(id:string,revision:string,expectedSha256:string){
    return this.locked(id,async(assertOwner)=>{
      const {file,sha256}=await this.read(id,revision);if(sha256!==expectedSha256)throw new Error("Transcript changed; reload its checksum");
      await assertOwner();await unlink(file);
      return {id,revision,deleted:true,sourceModified:false,note:"Only this revision was removed. Other revisions, exported documents and derived artifacts remain."};
    });
  }
}
