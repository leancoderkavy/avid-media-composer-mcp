import path from "node:path";
import { access,mkdir,writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { resolveReadablePath } from "../security/path-policy.js";
import { requireCapability } from "../security/capabilities.js";
import { AvidMcpError } from "../errors.js";
import { sha256File } from "../analysis/file-inventory.js";
import { NativeClient, QUALIFIED_BUILD } from "./client.js";
import {renderContract,verifyNativeRender} from "./render-verifier.js";
import {NativeExportUncertain,NativeImportUncertain} from "./lock.js";
import {AafBuilder} from "../library/aaf-builder.js";
import {verifyNativeAafMaster} from "./aaf-verifier.js";

const name = z.string().min(1).max(120).regex(/^[\w -]+$/);
const clipName=z.string().min(1).max(120).refine(value=>value.trim().length>0,"Clip name cannot be blank").refine(value=>/^[\x20-\x7e]+$/.test(value),"Qualified native rename supports printable ASCII only; this host can replace other characters");
const id = z.string().min(1).max(256);
const color = z.enum(["Red", "Green", "Blue", "Cyan", "Magenta", "Yellow", "Black", "White"]);
const track = z.object({ type: z.enum(["TRACKTYPE_PICTURE", "TRACKTYPE_SOUND"]), number: z.number().int().min(1).max(64) }).strict();
export const nativeActionSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("export_aaf_master"),bin:z.string().min(1),mobId:id,preset:name,sourceFile:z.string().min(1),expectedSourceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({action:z.literal("import_aaf_selects"),bin:z.string().min(1),file:z.string().min(1),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),preset:name}).strict(),
  z.object({action:z.literal("export_mp4"),bin:z.string().min(1),mobId:id,preset:name,expected:renderContract}).strict().refine(value=>value.expected.videoCodec==="h264"&&value.expected.width===1920&&value.expected.height===1080&&value.expected.rate.num===30&&value.expected.rate.den===1,"Native MP4 qualification currently requires H.264 1080p30"),
  z.object({ action: z.literal("create_bin"), name }).strict(),
  z.object({ action: z.literal("open_bin"), bin: z.string().min(1) }).strict(),
  z.object({ action: z.literal("close_bin"), bin: z.string().min(1) }).strict(),
  z.object({ action: z.literal("link_media"), bin: z.string().min(1), media: z.string().min(1) }).strict(),
  z.object({ action: z.literal("add_marker"), bin: z.string().min(1), mobId: id, offset: z.number().int().min(0).max(2147483647), track,
    comment: z.string().max(4000), color, name: z.string().max(120) }).strict(),
  z.object({ action: z.literal("change_marker"), bin: z.string().min(1), mobId: id, guid: id, comment: z.string().max(4000), color }).strict(),
  z.object({ action: z.literal("delete_marker"), bin: z.string().min(1), mobId: id, guid: id }).strict(),
  z.object({ action: z.literal("show_clip"), bin: z.string().min(1), mobId: id }).strict(),
  z.object({action:z.literal("rename_clip"),bin:z.string().min(1),mobId:id,expectedName:z.string().min(1).max(1024),name:clipName}).strict(),
  z.object({action:z.literal("create_subclip"),bin:z.string().min(1),mobId:id,startFrame:z.number().int().nonnegative().max(2147483647),endFrame:z.number().int().positive().max(2147483647)}).strict().refine(value=>value.endFrame>value.startFrame,"Subclip end must follow start"),
]);
type Action = z.infer<typeof nativeActionSchema>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// One queue for all MCP sessions in this process. Cross-process writes are disabled
// until a host-wide lock is acquired below by the adapter's caller.
let queue: Promise<unknown> = Promise.resolve();

export class NativeAdapter {
  private readonly plans = new Map<string, { action: Action; state: string; expires: number }>();
  constructor(private readonly config: ServerConfig, private readonly client = new NativeClient(config.nativeBinary ?? "")) {}
  private enabled() {
    requireCapability(this.config.capabilities, "inspect");
    if (!this.config.nativeBinary) throw new AvidMcpError("NATIVE_DISABLED", "Set AVID_MCP_NATIVE_BINARY to enable the local native adapter");
  }
  async project():Promise<Record<string,any>&{path:string}> {
    this.enabled();
    const bodies = await this.client.call("GetOpenProjectInfo");
    if (bodies.length !== 1 || typeof bodies[0]?.path !== "string") throw new Error("Expected one open project");
    const project = await resolveReadablePath(bodies[0].path, this.config.allowedRoots, "directory");
    return { ...bodies[0], path: project };
  }
  async read(query: "app" | "project" | "bins" | "bin" | "clips" | "clip" | "markers" | "tracks" | "viewers" | "link_settings" | "export_settings" | "import_settings", bin?: string, mobId?: string) {
    this.enabled();
    if (query === "app") return { build: QUALIFIED_BUILD, app: await this.client.call("GetAppInfo") };
    const project = await this.project();
    if (query === "project") return project;
    if (query === "bins") return this.client.call("GetBins", { project_path: project.path, request_flag: ["AllTypes"] });
    if (query === "link_settings") return this.client.call("GetListOfLinkSettings");
    if (query === "export_settings") return this.client.call("GetListOfExportSettings");
    if (query === "import_settings") return this.client.call("GetListOfImportSettings");
    const target = await this.binPath(project.path, bin ?? "");
    const relative = path.relative(project.path, target);
    if (query === "bin") return this.client.call("GetBinInfo", { relative_bin_path: relative });
    const clips = await this.client.call("GetListOfBinItems", { bin_relative_path: relative, bin_flags: ["AllTypes"] });
    if (query === "clips") return clips;
    if(query==="viewers"){
      const bodies=z.array(z.object({mobs:z.array(z.object({mob_id:z.string().min(1).max(256),view_type:z.string().min(1),current_frame:z.number().int(),current_timecode:z.string().max(64)})).max(16)})).min(1).max(16).parse(await this.client.call("GetViewerMobs"));
      const all=bodies.flatMap(body=>body.mobs);if(all.length>16)throw new Error("Native viewer inventory exceeds 16 entries");
      const afterProject=await this.project();if(afterProject.path!==project.path)throw new Error("Native project changed during viewer inspection");
      const after=await this.client.call("GetListOfBinItems",{bin_relative_path:relative,bin_flags:["AllTypes"]});
      const identities=(items:Record<string,any>[])=>JSON.stringify([...new Set(items.map(item=>item.mob_id))].sort());
      if(identities(after)!==identities(clips))throw new Error("Native bin membership changed during viewer inspection; reload before using positions");
      const members=new Set(clips.map(clip=>clip.mob_id)),viewers=all.filter(viewer=>members.has(viewer.mob_id));
      return {viewers,outOfBinOmitted:all.length-viewers.length,scope:"Current viewer entries whose MOB IDs belong to the requested bin. Position is reported by Avid; no playback, source mapping or atomic editor snapshot is verified."};
    }
    if (!mobId || !clips.some(clip => clip.mob_id === mobId)) throw new Error("Clip is not in the specified bin");
    const response = await this.client.call(query === "tracks" ? "GetMobTrackInfo" : query === "clip" ? "GetMobInfo" : "GetMarkers", { mob_id: mobId });
    if(query==="tracks"){
      const bodies=z.array(z.object({track_info_list:z.object({track_info:z.array(z.object({label:z.object({type:z.string().min(1),number:z.number().int().nonnegative()}),num_segments:z.number().int().nonnegative()}).passthrough()).max(256)}).passthrough()}).passthrough()).min(1).max(256).parse(response);
      const labels=new Set<string>();let count=0;
      for(const body of bodies)for(const item of body.track_info_list.track_info){if(++count>256)throw new Error("Native track inventory exceeds 256 tracks");const key=JSON.stringify([item.label.type,item.label.number]);if(labels.has(key))throw new Error("Native track inventory contains duplicate labels");labels.add(key);}
    }
    return query === "markers" ? response.flatMap(body => Array.isArray(body.info) ? body.info : []) : response;
  }
  private async binPath(project: string, bin: string) {
    const target = await resolveReadablePath(path.resolve(project, bin), [project], "file");
    if (path.extname(target).toLowerCase() !== ".avb") throw new Error("Expected an AVB bin");
    return target;
  }
  private async state(action: Action) {
    const project = await this.project();
    const app = await this.client.call("GetAppInfo");
    if (app[0]?.app_busy_status && app[0].app_busy_status !== "Idle") throw new Error("Editor is busy");
    if (action.action === "create_bin") {
      const target = path.join(project.path, `${action.name}.avb`);
      let exists = true;
      try { await access(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false; else throw error; }
      if (exists) throw new Error("Destination bin already exists");
      return { project: project.path, owner:this.client.ownerIdentity, action };
    }
    const bin = await this.binPath(project.path, action.bin);
    if(action.action==="open_bin")return {project:project.path,owner:this.client.ownerIdentity,bin,binSha256:await sha256File(bin),action};
    const clips = await this.client.call("GetListOfBinItems", { bin_relative_path:path.relative(project.path,bin),bin_flags:["AllTypes"] });
    if ("mobId" in action && !clips.some(clip => clip.mob_id === action.mobId)) throw new Error("Target clip is not in bin");
    if(action.action==="rename_clip"){
      const info=await this.client.call("GetMobInfo",{mob_id:action.mobId}),names=info.filter(row=>row.column_name==="Name");
      if(names.length!==1||names[0]!.column_value!==action.expectedName)throw new Error("Native clip name differs from expectedName; inspect before renaming");
    }
    const markers = "mobId" in action ? (await this.client.call("GetMarkers",{mob_id:action.mobId})).flatMap(body=>Array.isArray(body.info)?body.info:[]) : [];
    if ("guid" in action && !(markers as Record<string, unknown>[]).some(marker => marker.guid === action.guid)) throw new Error("Target marker does not exist");
    const media = action.action === "link_media" ? await resolveReadablePath(action.media, this.config.allowedRoots, "file") : undefined;
    let subclipSource:unknown;
    let exportState:unknown;
    let aafExportState:{outputRoot:string;info:Record<string,any>[];presets:Record<string,any>[];sourceFile:string;sourceSha256:string;frames:number}|undefined;
    if(action.action==="export_aaf_master"){
      requireCapability(this.config.capabilities,"export");
      if(!this.config.outputRoot)throw new Error("AAF export output root required");
      const outputRoot=await resolveReadablePath(this.config.outputRoot,[this.config.outputRoot],"directory");
      const presets=await this.client.call("GetListOfExportSettings");
      if(!presets.some(value=>value.setting_names?.includes(action.preset)))throw new Error("Requested AAF export preset is missing");
      const info=await this.client.call("GetMobInfo",{mob_id:action.mobId}),columns=Object.fromEntries(info.map(row=>[row.column_name,row.column_value]));
      const frames=Number(columns["Frame Count Duration"]);
      if(project.frame_rate?.num!==30||project.frame_rate?.den!==1||Number(columns.FPS)!==30||!Number.isInteger(frames)||frames<1||frames>2147483647||typeof columns["Source File"]!=="string"||typeof columns["Source Path"]!=="string")throw new Error("AAF export requires a linked 30 fps source master with file/path metadata");
      const sourceFile=await resolveReadablePath(action.sourceFile,this.config.allowedRoots,"file");
      const hostSource=await resolveReadablePath(path.resolve(columns["Source Path"],columns["Source File"]),this.config.allowedRoots,"file");
      if(hostSource!==sourceFile)throw new Error("Native master source does not match the requested file");
      const sourceSha256=await sha256File(sourceFile);if(sourceSha256!==action.expectedSourceSha256)throw new Error("AAF source checksum changed; inspect again");
      aafExportState={outputRoot,info,presets,sourceFile,sourceSha256,frames};
    }
    let importState: {inspection:Awaited<ReturnType<AafBuilder["inspectSelects"]>>;presets:Record<string,any>[];outputRoot:string}|undefined;
    if(action.action==="import_aaf_selects"){
      requireCapability(this.config.capabilities,"edit");requireCapability(this.config.capabilities,"export");
      if(clips.length)throw new Error("AAF import requires an empty destination bin");
      if(project.frame_rate?.num!==30||project.frame_rate?.den!==1)throw new Error("Native AAF import qualification requires a 30 fps project");
      if(!this.config.outputRoot)throw new Error("Import evidence output root required");
      const outputRoot=await resolveReadablePath(this.config.outputRoot,[this.config.outputRoot],"directory");
      const presets=await this.client.call("GetListOfImportSettings");
      if(!presets.some(value=>value.setting_names?.includes(action.preset)))throw new Error("Requested import preset is missing");
      const inspection=await new AafBuilder(this.config).inspectSelects(action.file);
      if(inspection.sha256!==action.expectedSha256)throw new Error("AAF checksum changed; inspect again");
      if(inspection.composition.rate!=="30"||!inspection.composition.name.trim())throw new Error("Native AAF import requires a named 30 fps composition");
      importState={inspection,presets,outputRoot};
    }
    if(action.action==="export_mp4"){
      requireCapability(this.config.capabilities,"export");
      if(!this.config.outputRoot)throw new Error("Export output root required");
      const outputRoot=await resolveReadablePath(this.config.outputRoot,[this.config.outputRoot],"directory");
      const presets=await this.client.call("GetListOfExportSettings");
      if(!presets.some(value=>value.setting_names?.includes(action.preset)))throw new Error("Requested export preset is missing");
      const info=await this.client.call("GetMobInfo",{mob_id:action.mobId}),columns=Object.fromEntries(info.map(row=>[row.column_name,row.column_value]));
      const duration=String(columns.Duration??"");
      if(project.frame_rate?.num!==30||project.frame_rate?.den!==1||Number(columns.FPS)!==30||!/^\d+(?::\d{2}){1,3}$/.test(duration))throw new Error("Unqualified export source rate or duration");
      const parts=duration.split(":").map(Number),frames=parts.pop()!;
      if(frames>=30||parts.slice(1).some(value=>value>=60)||parts.reduce((total,value)=>total*60+value,0)*30+frames!==action.expected.frames)throw new Error("Export contract must cover the complete source duration");
      exportState={outputRoot,info,presets};
    }
    if(action.action==="create_subclip"){
      if(project.frame_rate?.num!==30||project.frame_rate?.den!==1)throw new Error("Subclip qualification currently requires a 30 fps project");
      const info=await this.client.call("GetMobInfo",{mob_id:action.mobId});
      const columns=Object.fromEntries(info.map(row=>[row.column_name,row.column_value]));
      if(Number(columns.FPS)!==30)throw new Error("Subclip source must be 30 fps");
      const duration=String(columns.Duration??"");
      if(!/^\d+(?::\d{2}){1,3}$/.test(duration))throw new Error("Unqualified source duration format");
      const parts=duration.split(":").map(Number),frames=parts.pop()!;
      if(frames>=30||parts.slice(1).some(value=>value>=60))throw new Error("Invalid source duration");
      const length=parts.reduce((total,value)=>total*60+value,0)*30+frames;
      if(action.endFrame>length)throw new Error("Subclip exceeds source duration");
      subclipSource=info;
    }
    return { project: project.path, owner:this.client.ownerIdentity, bin, binSha256:await sha256File(bin), clips, markers, media,
      ...(media?{mediaSha256:await sha256File(media)}:{}), ...(subclipSource?{subclipSource}:{}), ...(exportState?{exportState}:{}), ...(importState?{importState}:{}), ...(aafExportState?{aafExportState}:{}), action };
  }
  async preview(input: Action) {
    const action = nativeActionSchema.parse(input);
    const state = digest(await this.state(action));
    const token = randomUUID();
    const expires = Date.now() + 5 * 60_000;
    for (const [key, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(key);
    if (this.plans.size >= 100) throw new Error("Too many pending native plans");
    this.plans.set(token, { action, state, expires });
    return { token, expiresAt: new Date(expires).toISOString(), action, expectedState: state,
      warning: "One native operation; no atomic undo guarantee. Inspect state after an uncertain response before creating another plan." };
  }
  async apply(token: string) {
    const task = queue.catch(() => {}).then(async () => {
      const plan = this.plans.get(token);
      this.plans.delete(token); // consume before any write; never replay uncertain operations
      if (!plan || plan.expires < Date.now()) throw new Error("Native plan expired or already consumed");
      requireCapability(this.config.capabilities, ["export_mp4","export_aaf_master"].includes(plan.action.action) ? "export" : plan.action.action === "create_bin" ? "project-write" : "edit");
      const { withNativeLock } = await import("./lock.js");
      return withNativeLock(async () => {
        const observedState=await this.state(plan.action);
        if (digest(observedState) !== plan.state) throw new Error("Native state changed; preview again");
        const action = plan.action;
        const project = await this.project();
        let result;
        if(action.action==="export_aaf_master"){
          if(!("aafExportState" in observedState)||!observedState.aafExportState)throw new Error("Missing AAF export evidence");
          if(project.path!==observedState.project||this.client.ownerIdentity!==observedState.owner)throw new Error("AAF export host or project changed before dispatch");
          const state=observedState.aafExportState,directory=path.join(state.outputRoot,`native-export-${randomUUID()}`);await mkdir(directory);
          const output=path.join(directory,"export","reference.aaf"),owner=this.client.ownerIdentity;
          await writeFile(path.join(directory,"attempt.json"),JSON.stringify({action,project:project.path,owner,output,expectedState:plan.state,sourceFile:state.sourceFile,sourceSha256:state.sourceSha256,frames:state.frames}),{flag:"wx"});
          try{
            result=await this.client.call("ExportFile",{mob_id:action.mobId,file_name:"reference",export_settings_name:action.preset,destination_path:directory,in_directory:"export",option_flags:["Export_StopIf_OfflineMedia","Export_StopIf_UnknownFX"]},owner);
            const verification=await verifyNativeAafMaster(output,this.config,state,{assertOwner:async()=>{
              const current=await this.project();if(current.path!==project.path||this.client.ownerIdentity!==owner)throw new Error("AAF export host or project changed");
            }});
            const receipt={operationId:randomUUID(),action,result,applicationCompleted:true,outputVerified:true,verification,sourceFidelityVerified:false,limitations:["Reference-master metadata and source locators checked, not downstream descriptor semantics or media decoding","Preset contents are not fingerprinted"]};
            await writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});return receipt;
          }catch(error){throw new NativeExportUncertain(output,(error as Error).message);}
        }
        if(action.action==="import_aaf_selects"){
          if(!("importState" in observedState)||!observedState.importState)throw new Error("Missing AAF inspection state");
          if(project.path!==observedState.project||this.client.ownerIdentity!==observedState.owner)throw new Error("Import host or project changed before dispatch");
          const {inspection,outputRoot}=observedState.importState,owner=this.client.ownerIdentity;
          const directory=path.join(outputRoot,`native-import-${randomUUID()}`);await mkdir(directory);
          const attempt=path.join(directory,"attempt.json");
          await writeFile(attempt,JSON.stringify({action,project:project.path,owner,inspection,expectedState:plan.state}),{flag:"wx"});
          try{
            result=await this.client.call("ImportFile",{file_path:inspection.file,import_settings_name:action.preset,destination_bin:path.relative(project.path,await this.binPath(project.path,action.bin)),option_flags:["Import_StopIf_Media_No_in_DB"]},owner);
            const current=await this.project();
            if(current.path!==project.path||this.client.ownerIdentity!==owner)throw new Error("Import host or project changed");
            const items=await this.read("clips",action.bin) as Record<string,any>[];
            const matches=items.filter(item=>item.mob_name===inspection.composition.name);
            if(matches.length!==1||typeof matches[0]!.mob_id!=="string")throw new Error("Expected one imported composition; inspect bin before another attempt");
            const sequence=matches[0]!,info=await this.read("clip",action.bin,sequence.mob_id) as Record<string,any>[];
            const columns=Object.fromEntries(info.map(row=>[row.column_name,row.column_value]));
            if(columns.Name!==inspection.composition.name||Number(columns.FPS)!==30||Number(columns["Frame Count Duration"])!==inspection.composition.frames)throw new Error("Imported composition metadata mismatch");
            for(const item of [{file:inspection.file,sha256:inspection.sha256},...inspection.media]){
              if(await sha256File(await resolveReadablePath(item.file,this.config.allowedRoots,"file"))!==item.sha256)throw new Error("Import source changed during operation");
            }
            const finalProject=await this.project();
            if(finalProject.path!==project.path||this.client.ownerIdentity!==owner)throw new Error("Import host or project changed during verification");
            const receipt={operationId:randomUUID(),action,result,sequence,info,applicationCompleted:true,postStateRead:true,hostMetadataVerified:true,sourceFilesUnchanged:true,persistenceVerified:false,sourceFidelityVerified:false,limitations:["Save/reopen and saved source-graph conformance require separate verification","Import preset contents and downstream source descriptors are not qualified","No atomic undo or automatic replay"]};
            await writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});return {...receipt,evidenceDirectory:directory};
          }catch(error){throw new NativeImportUncertain(attempt,(error as Error).message);}
        }
        if(action.action==="export_mp4"){
          const root=await resolveReadablePath(this.config.outputRoot!,[this.config.outputRoot!],"directory");
          const directory=path.join(root,`native-export-${randomUUID()}`);await mkdir(directory);
          const output=path.join(directory,"export","render.mp4"),owner=this.client.ownerIdentity;
          await writeFile(path.join(directory,"attempt.json"),JSON.stringify({action,project:project.path,owner,output,expectedState:plan.state}),{flag:"wx"});
          try{
            result=await this.client.call("ExportFile",{mob_id:action.mobId,file_name:"render",export_settings_name:action.preset,destination_path:directory,in_directory:"export",option_flags:["Export_StopIf_OfflineMedia","Export_StopIf_UnknownFX"]},owner);
            const verification=await verifyNativeRender(output,this.config,action.expected,{assertOwner:async()=>{
              const current=await this.project();
              if(this.client.ownerIdentity!==owner||current.path!==project.path)throw new Error("Export host or project changed");
            }});
            const receipt={operationId:randomUUID(),action,result,applicationCompleted:true,outputVerified:true,verification,sourceFidelityVerified:false,limitations:["Preset content cannot be fingerprinted through this API","Unsaved timeline graph and source frame/color/audio conformance are not verified"]};
            await writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});return receipt;
          }catch(error){throw new NativeExportUncertain(output,(error as Error).message);}
        }
        switch (action.action) {
          case "create_bin": result = await this.client.call("CreateBin", { folder_path: "", bin_name: action.name, option: "LastActiveBinContainer" }); break;
          case "open_bin": case "close_bin": result = await this.client.call(action.action === "open_bin" ? "OpenBin" : "CloseBin", { bin_path: await this.binPath(project.path, action.bin) }); break;
          case "link_media": result = await this.client.call("LinkFile", { file_path: await resolveReadablePath(action.media, this.config.allowedRoots, "file"), destination_bin: path.relative(project.path, await this.binPath(project.path, action.bin)) }); break;
          case "add_marker": result = await this.client.call("AddMarker", { mob_id: action.mobId, track_label: action.track, offset: action.offset, length: 1, color: action.color, name: action.name, comment: action.comment, user: "Avid MCP" }); break;
          case "change_marker": {
            const markers=await this.read("markers",action.bin,action.mobId) as Record<string,any>[];
            const existing=markers.find(marker=>marker.guid===action.guid);
            if(!existing)throw new Error("Marker disappeared before update");
            result = await this.client.call("ChangeMarker", { mob_id: action.mobId, guid: action.guid, info: {
              name:existing.name??"",user:existing.user??"Avid MCP",track_label:existing.track_label,
              comment: action.comment, color: action.color } }); break;
          }
          case "delete_marker": result = await this.client.call("DeleteMarkers", { mob_id: action.mobId, guid: [action.guid] }); break;
          case "show_clip": result = await this.client.call("LoadMobsIntoViewer", { mob_ids: [action.mobId], view_type: "Source" }); break;
          case "rename_clip": result=await this.client.call("SetMobInfo",{mob_id:action.mobId,column:{column_name:"Name",column_value:action.name}});break;
          case "create_subclip": result=await this.client.call("CreateSubClip",{
            destination_bin_path:path.relative(project.path,await this.binPath(project.path,action.bin)),mob_id:action.mobId,
            head_frame:action.startFrame,end_frame:action.endFrame,create_new_sequence:true,
            // Omitted track_list selects all source tracks on the qualified build.
            // Despite its name, create_new_sequence=true produces a subclip here.
          });break;
        }
        let postState:unknown,verificationError:string|undefined;
        try {
          if(action.action==="create_subclip"){
            const after=await this.read("clips",action.bin) as Record<string,any>[];
            const before="clips" in observedState?observedState.clips:[];
            const created=after.filter(item=>!before.some((old:Record<string,any>)=>old.mob_id===item.mob_id));
            if(created.length!==1)throw new Error("Expected one new subclip; inspect bin before another attempt");
            postState={created,info:await this.read("clip",action.bin,created[0]!.mob_id)};
          }else if(action.action==="rename_clip"){
            postState=await this.read("clip",action.bin,action.mobId);
            const names=(postState as Record<string,any>[]).filter(row=>row.column_name==="Name");
            if(result.some(body=>Array.isArray(body.mob_failure)&&body.mob_failure.length)||names.length!==1||names[0]!.column_value!==action.name)throw new Error("Native rename was not verified; inspect clip before another attempt");
          }else if(action.action==="show_clip"){
            const viewers=await this.read("viewers",action.bin) as {viewers:{mob_id:string;view_type:string}[]};postState=viewers;
            if(!viewers.viewers.some(viewer=>viewer.mob_id===action.mobId&&viewer.view_type==="Source"))throw new Error("Requested clip was not observed in the Source viewer; inspect state before another attempt");
          }else postState=action.action==="close_bin" ? await this.client.call("GetBins",{project_path:project.path,request_flag:["OnlyOpen"]}) :
            await this.read(action.action === "create_bin" ? "bins" : "mobId" in action ? "markers" : "clips", "bin" in action ? action.bin : undefined, "mobId" in action ? action.mobId : undefined);
        } catch(error){verificationError=(error as Error).message;}
        return { operationId: randomUUID(), action, result, applicationCompleted: true,
          persistenceVerified: false, postState, verificationError, postStateRead:!verificationError,...(action.action==="show_clip"?{viewerVerified:!verificationError}:{}),...(action.action==="rename_clip"?{renameVerified:!verificationError}:{}) };
      });
    });
    queue = task;
    return task;
  }
}
