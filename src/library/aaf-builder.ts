import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import * as z from "zod/v4";
import type {ServerConfig} from "../config.js";
import {MediaLibrary} from "./media-library.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {requireCapability} from "../security/capabilities.js";
import {sha256File} from "../analysis/file-inventory.js";
import {runProcess} from "../process.js";
const mob=z.string().regex(/^urn:smpte:umid:[a-f0-9.]+$/i);
export const aafMergeSchema=z.object({sources:z.array(z.object({file:z.string().min(1),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(2).max(16)}).strict();
export const aafBuildSchema=z.object({
  template:z.string().min(1),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(1).max(120),rate:z.string().regex(/^\d+(?:\/\d+)?$/),
  tracks:z.array(z.object({name:z.string().min(1).max(40),kind:z.enum(["picture","sound"]),channels:z.literal(2).optional()}).strict().refine(t=>t.channels===undefined||t.kind==="sound",{message:"Stereo requires sound"})).min(1).max(16),
  selects:z.array(z.object({mobId:mob,start:z.number().int().nonnegative().max(2147483647),length:z.number().int().positive().max(2147483647),slotIds:z.array(z.union([z.number().int().positive(),z.tuple([z.number().int().positive(),z.number().int().positive()])])).min(1).max(16)}).strict()).min(1).max(500),
}).strict();
const infoSchema=z.object({masters:z.array(z.object({mobId:mob,name:z.string(),slots:z.array(z.object({slotId:z.number().int(),kind:z.string(),rate:z.string(),length:z.number().int().nonnegative()})).max(128)})).max(100),locators:z.array(z.string()).min(1).max(100)});
const selectsInfoSchema=infoSchema.extend({composition:z.object({mobId:mob,name:z.string(),rate:z.string(),frames:z.number().int().positive().max(2147483647),tracks:z.array(z.object({slotId:z.number().int(),name:z.string(),kind:z.enum(["picture","sound"]),channels:z.literal(2).optional(),cuts:z.array(z.object({mobId:mob,slotId:z.number().int(),start:z.number().int().nonnegative(),length:z.number().int().positive(),position:z.number().int().nonnegative(),channelIndex:z.union([z.literal(1),z.literal(2)]).optional()})).min(1).max(1000)})).min(1).max(16)})});
export class AafBuilder {
  private library:MediaLibrary;
  constructor(private config:ServerConfig){this.library=new MediaLibrary(config);}
  private async run(request:unknown,directory:string){
    const manifest=path.join(directory,`request-${randomUUID()}.json`);await writeFile(manifest,JSON.stringify(request),{flag:"wx"});
    const result=await runProcess(this.config.pythonExecutable,[fileURLToPath(new URL("../../python/avid_aaf_builder.py",import.meta.url)),manifest],{timeoutMs:this.config.commandTimeoutMs,maxOutputBytes:2*1024*1024});
    if(result.exitCode!==0)throw new Error(`AAF builder failed: ${result.stderr.slice(-1500)}`);return JSON.parse(result.stdout);
  }
  private async prepare(template:string,selects=false){
    requireCapability(this.config.capabilities,"export");
    const source=await resolveReadablePath(template,this.config.allowedRoots,"file");if(path.extname(source).toLowerCase()!==".aaf")throw new Error("Expected an AAF template");
    const sha256=await sha256File(source),directory=path.join(await this.library.directory(),`aaf-${randomUUID()}`);await mkdir(directory);
    const raw=await this.run({action:selects?"inspect_selects":"inspect",source},directory);
    const info=selects?selectsInfoSchema.parse(raw):infoSchema.parse(raw);
    const media=[];for(const locator of info.locators){
      const url=new URL(locator);if(url.protocol!=="file:"||url.hostname)throw new Error("Only local file locators are supported");
      const file=await resolveReadablePath(fileURLToPath(url),this.config.allowedRoots,"file");media.push({file,sha256:await sha256File(file)});
    }
    if(await sha256File(source)!==sha256)throw new Error("AAF template changed during inspection");
    return {source,sha256,directory,info,media};
  }
  async inspect(template:string){const {source,sha256,info,media}=await this.prepare(template);return {template:source,sha256,...info,media,scope:"Source-master templates only; inspection writes a local request manifest"};}
  async merge(input:z.infer<typeof aafMergeSchema>){
    requireCapability(this.config.capabilities,"export");
    const request=aafMergeSchema.parse(input),prepared:Awaited<ReturnType<AafBuilder["prepare"]>>[]=[];
    for(const item of request.sources){
      const entry=await this.prepare(item.file);
      if(entry.sha256!==item.expectedSha256)throw new Error("AAF source checksum changed");
      if(prepared.some(other=>other.source===entry.source))throw new Error("Duplicate AAF source");
      prepared.push(entry);
    }
    const directory=path.join(await this.library.directory(),`aaf-merge-${randomUUID()}`);await mkdir(directory);
    await resolveReadablePath(directory,[this.config.outputRoot!],"directory");
    const output=path.join(directory,"references.aaf");
    try{
      const result=z.object({output:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),graphVerified:z.literal(true),sourceHashesUnchanged:z.literal(true),hostImportVerified:z.literal(false),sources:z.array(z.object({file:z.string(),sha256:z.string(),remappedMobIds:z.record(mob,mob)})).min(2).max(16),limitations:z.array(z.string())}).parse(await this.run({action:"merge",output,sources:prepared.map(p=>({file:p.source,expectedSha256:p.sha256}))},directory));
      if(path.resolve(result.output)!==output||result.sources.length!==prepared.length||result.sources.some((s,i)=>s.file!==prepared[i]!.source||s.sha256!==prepared[i]!.sha256))throw new Error("Invalid merge source evidence");
      const canonical=await resolveReadablePath(output,[directory],"file");
      if(await sha256File(canonical)!==result.sha256)throw new Error("Merged AAF checksum changed");
      const info=infoSchema.parse(await this.run({action:"inspect",source:canonical},directory));
      const locators=[...new Set(prepared.flatMap(p=>p.info.locators))].sort();
      if(JSON.stringify([...info.locators].sort())!==JSON.stringify(locators))throw new Error("Merged AAF locators changed");
      const media=[...new Map(prepared.flatMap(p=>p.media).map(m=>[m.file,m])).values()];
      for(const item of [...prepared.map(p=>({file:p.source,sha256:p.sha256})),...media])if(await sha256File(await resolveReadablePath(item.file,this.config.allowedRoots,"file"))!==item.sha256)throw new Error("Merge source or media changed");
      if(await sha256File(await resolveReadablePath(output,[directory],"file"))!==result.sha256)throw new Error("Merged AAF changed during verification");
      const receipt={...result,template:canonical,...info,media};
      await writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});return receipt;
    }catch(error){await writeFile(path.join(directory,"failure.json"),JSON.stringify({verified:false,output,error:error instanceof Error?error.message:String(error)}),{flag:"wx"});throw error;}
  }
  async inspectSelects(file:string){
    const {source,sha256,info,media}=await this.prepare(file,true);
    for(const item of media)if(await sha256File(await resolveReadablePath(item.file,this.config.allowedRoots,"file"))!==item.sha256)throw new Error("Referenced media changed during inspection");
    if(await sha256File(source)!==sha256)throw new Error("AAF changed during inspection");
    return {file:source,sha256,...selectsInfoSchema.parse(info),media,hostImportVerified:false,scope:"One same-rate straight-cut composition with direct master references and explicit two-channel combiners; no host import, relink, arbitrary effects or playback qualification"};
  }
  async build(input:z.infer<typeof aafBuildSchema>){
    const request=aafBuildSchema.parse(input),prepared=await this.prepare(request.template);
    if(request.expectedSha256!==prepared.sha256)throw new Error("AAF template checksum changed; inspect again");
    const output=path.join(prepared.directory,"selects.aaf"),result=await this.run({action:"build",source:prepared.source,output,...request},prepared.directory);
    if(result.output!==output||result.conformanceVerified!==true)throw new Error("AAF output evidence invalid");
    for(const media of prepared.media)if(await sha256File(await resolveReadablePath(media.file,this.config.allowedRoots,"file"))!==media.sha256)throw new Error("Referenced media changed during build");
    const report={...result,sha256:await sha256File(await resolveReadablePath(output,[prepared.directory],"file")),templateSha256:prepared.sha256,media:prepared.media,sourceModified:false,limitations:["Straight cuts only","All selected source slots must match the composition edit rate","Only explicit stereo channel combiners; no other effects, transitions, retimes or embedded essence","Generating an AAF is not an Avid import, playback or render"]};
    await writeFile(path.join(prepared.directory,"receipt.json"),JSON.stringify(report,null,2),{flag:"wx"});return report;
  }
}
