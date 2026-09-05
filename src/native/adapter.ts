import path from "node:path";
import { access } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { resolveReadablePath } from "../security/path-policy.js";
import { requireCapability } from "../security/capabilities.js";
import { AvidMcpError } from "../errors.js";
import { sha256File } from "../analysis/file-inventory.js";
import { NativeClient, QUALIFIED_BUILD } from "./client.js";

const name = z.string().min(1).max(120).regex(/^[\w -]+$/);
const id = z.string().min(1).max(256);
const color = z.enum(["Red", "Green", "Blue", "Cyan", "Magenta", "Yellow", "Black", "White"]);
const track = z.object({ type: z.enum(["TRACKTYPE_PICTURE", "TRACKTYPE_SOUND"]), number: z.number().int().min(1).max(64) }).strict();
export const nativeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_bin"), name }).strict(),
  z.object({ action: z.literal("open_bin"), bin: z.string().min(1) }).strict(),
  z.object({ action: z.literal("close_bin"), bin: z.string().min(1) }).strict(),
  z.object({ action: z.literal("link_media"), bin: z.string().min(1), media: z.string().min(1) }).strict(),
  z.object({ action: z.literal("add_marker"), bin: z.string().min(1), mobId: id, offset: z.number().int().min(0).max(2147483647), track,
    comment: z.string().max(4000), color, name: z.string().max(120) }).strict(),
  z.object({ action: z.literal("change_marker"), bin: z.string().min(1), mobId: id, guid: id, comment: z.string().max(4000), color }).strict(),
  z.object({ action: z.literal("delete_marker"), bin: z.string().min(1), mobId: id, guid: id }).strict(),
  z.object({ action: z.literal("show_clip"), bin: z.string().min(1), mobId: id }).strict(),
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
  async read(query: "app" | "project" | "bins" | "bin" | "clips" | "clip" | "markers" | "link_settings", bin?: string, mobId?: string) {
    this.enabled();
    if (query === "app") return { build: QUALIFIED_BUILD, app: await this.client.call("GetAppInfo") };
    const project = await this.project();
    if (query === "project") return project;
    if (query === "bins") return this.client.call("GetBins", { project_path: project.path, request_flag: ["AllTypes"] });
    if (query === "link_settings") return this.client.call("GetListOfLinkSettings");
    const target = await this.binPath(project.path, bin ?? "");
    const relative = path.relative(project.path, target);
    if (query === "bin") return this.client.call("GetBinInfo", { relative_bin_path: relative });
    const clips = await this.client.call("GetListOfBinItems", { bin_relative_path: relative, bin_flags: ["AllTypes"] });
    if (query === "clips") return clips;
    if (!mobId || !clips.some(clip => clip.mob_id === mobId)) throw new Error("Clip is not in the specified bin");
    const response = await this.client.call(query === "clip" ? "GetMobInfo" : "GetMarkers", { mob_id: mobId });
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
    const markers = "mobId" in action ? (await this.client.call("GetMarkers",{mob_id:action.mobId})).flatMap(body=>Array.isArray(body.info)?body.info:[]) : [];
    if ("guid" in action && !(markers as Record<string, unknown>[]).some(marker => marker.guid === action.guid)) throw new Error("Target marker does not exist");
    const media = action.action === "link_media" ? await resolveReadablePath(action.media, this.config.allowedRoots, "file") : undefined;
    let subclipSource:unknown;
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
      ...(media?{mediaSha256:await sha256File(media)}:{}), ...(subclipSource?{subclipSource}:{}), action };
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
      requireCapability(this.config.capabilities, plan.action.action === "create_bin" ? "project-write" : "edit");
      const { withNativeLock } = await import("./lock.js");
      return withNativeLock(async () => {
        const observedState=await this.state(plan.action);
        if (digest(observedState) !== plan.state) throw new Error("Native state changed; preview again");
        const action = plan.action;
        const project = await this.project();
        let result;
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
          }else postState=action.action==="close_bin" ? await this.client.call("GetBins",{project_path:project.path,request_flag:["OnlyOpen"]}) :
            await this.read(action.action === "create_bin" ? "bins" : "mobId" in action ? "markers" : "clips", "bin" in action ? action.bin : undefined, "mobId" in action ? action.mobId : undefined);
        } catch(error){verificationError=(error as Error).message;}
        return { operationId: randomUUID(), action, result, applicationCompleted: true,
          persistenceVerified: false, postState, verificationError, postStateRead:!verificationError };
      });
    });
    queue = task;
    return task;
  }
}
