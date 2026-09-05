import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { errorDetails } from "../errors.js";
import { MediaLibrary, transcriptSchema } from "./media-library.js";
import { VisualSearch } from "./visual.js";
import { SpeechAnalysis } from "./speech.js";
import { AnalysisJobs, jobSchema } from "./jobs.js";
import {Collections, collectionSchema} from "./collections.js";
import {WatchFolders,watchOptions} from "./watch-folders.js";
import {ProjectSnapshots} from "./project-snapshots.js";

export function registerLibraryTools(server: McpServer, config: ServerConfig) {
  const library = new MediaLibrary(config);
  const visual = new VisualSearch(config);
  const speech = new SpeechAnalysis(config);
  const jobs = new AnalysisJobs(config);
  const collections = new Collections(config);
  const watches = new WatchFolders(config);
  const snapshots = new ProjectSnapshots(config);
  const previousClose=server.server.onclose;
  server.server.onclose=()=>{jobs.close();watches.stop();void Promise.allSettled([visual.dispose(),speech.dispose()]);previousClose?.();};
  const id = z.string().regex(/^[a-f0-9]{64}$/);
  const ids = z.array(id).min(1).max(100);
  const read = {readOnlyHint:true, destructiveHint:false, openWorldHint:false, idempotentHint:true};
  const write = {readOnlyHint:false, destructiveHint:false, openWorldHint:false, idempotentHint:false};
  const result = async (name: string, fn: () => Promise<unknown>) => {
    try { const data = {ok:true,tool:name,data:await fn()}; return {content:[{type:"text" as const,text:JSON.stringify(data)}],structuredContent:data}; }
    catch(error) { const data={ok:false,tool:name,error:errorDetails(error)}; return {content:[{type:"text" as const,text:JSON.stringify(data)}],structuredContent:data,isError:true}; }
  };
  server.registerTool("avid_index_media", {description:"Index up to 100 local media files by SHA-256 into the configured output directory. No media upload.", inputSchema:{files:z.array(z.string()).min(1).max(100)},annotations:write},
    ({files})=>result("avid_index_media",()=>library.index(files)));
  server.registerTool("avid_library_metadata", {description:"Read indexed technical media metadata.",inputSchema:{ids},annotations:read},
    ({ids})=>result("avid_library_metadata",()=>library.metadata(ids)));
  server.registerTool("avid_search_media", {description:"Search indexed metadata and selected transcript revisions with case-insensitive substring matching. This is not visual or semantic search.",inputSchema:{ids,query:z.string().min(1).max(500),limit:z.number().int().min(1).max(200).default(50),revisions:z.record(id,z.string().uuid()).default({})},annotations:read},
    ({ids,query,limit,revisions})=>result("avid_search_media",()=>library.search(ids,query,limit,revisions)));
  server.registerTool("avid_import_transcript", {description:"Save an immutable local transcript revision for indexed media. Requires project-write. Returns a revision ID for search/range queries.",inputSchema:{id,segments:transcriptSchema},annotations:write},
    ({id,segments})=>result("avid_import_transcript",()=>library.importTranscript(id,segments)));
  server.registerTool("avid_transcript_range", {description:"Read a bounded half-open transcript range with a continuation cursor.",inputSchema:{id,start:z.number().nonnegative(),end:z.number().positive(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(200).default(50),revision:z.string().uuid().optional()},annotations:read},
    ({id,start,end,after,limit,revision})=>result("avid_transcript_range",()=>library.transcriptRange(id,start,end,after,limit,revision)));
  server.registerTool("avid_media_artifact", {description:"Create a thumbnail, trimmed MP4 or checksum-verified copy in a unique output folder. Requires export. Validates indexed source identity and never overwrites.",inputSchema:{id,kind:z.enum(["thumbnail","clip","copy"]),start:z.number().nonnegative().default(0),end:z.number().positive().optional()},annotations:write},
    ({id,kind,start,end})=>result("avid_media_artifact",()=>library.artifact(id,kind,start,end)));
  server.registerTool("avid_media_report", {description:"Write a local HTML media inventory. Requires export.",inputSchema:{ids},annotations:write},
    ({ids})=>result("avid_media_report",()=>library.report(ids)));
  server.registerTool("avid_index_visual", {description:"Compute local CLIP embeddings for sparse sampled video frames. Requires separately downloaded models and export authority for cached thumbnails.",inputSchema:{ids,samplesPerFile:z.number().int().min(1).max(12).default(6)},annotations:write},
    ({ids,samplesPerFile})=>result("avid_index_visual",()=>visual.index(ids,samplesPerFile)));
  server.registerTool("avid_search_visual", {description:"Search a local visual index by text or a reference image; returns sampled source timestamps and CLIP similarity, not identity or probability.",inputSchema:{indexId:z.string().uuid(),query:z.union([z.object({text:z.string().min(1).max(500)}).strict(),z.object({image:z.string().min(1)}).strict()]),limit:z.number().int().min(1).max(100).default(20)},annotations:read},
    ({indexId,query,limit})=>result("avid_search_visual",()=>visual.search(indexId,query,limit)));
  server.registerTool("avid_transcribe_media", {description:"Transcribe up to ten minutes of local English audio using downloaded Whisper weights. Requires export and project-write. Returns a reviewable transcript revision.",inputSchema:{id,start:z.number().nonnegative(),end:z.number().positive()},annotations:write},
    ({id,start,end})=>result("avid_transcribe_media",()=>speech.transcribe(id,start,end)));
  server.registerTool("avid_start_analysis_job", {description:"Run indexing, visual analysis, transcription or export in a bounded local worker; returns immediately. Jobs belong to this MCP session.",inputSchema:{job:jobSchema},annotations:write},
    ({job})=>result("avid_start_analysis_job",async()=>jobs.start(job)));
  server.registerTool("avid_analysis_job_status", {description:"Read local analysis job status and completed result.",inputSchema:{jobId:z.string().uuid()},annotations:read},
    ({jobId})=>result("avid_analysis_job_status",async()=>jobs.status(jobId)));
  server.registerTool("avid_cancel_analysis_job", {description:"Cancel a queued or running local analysis job. Partial artifacts are retained for inspection; this does not undo completed output.",inputSchema:{jobId:z.string().uuid()},annotations:write},
    ({jobId})=>result("avid_cancel_analysis_job",async()=>jobs.cancel(jobId)));
  server.registerTool("avid_media_facets", {description:"Get observed codec, resolution, nominal frame-rate and channel-count facets for a selected library scope.",inputSchema:{ids},annotations:read},
    ({ids})=>result("avid_media_facets",()=>library.facets(ids)));
  server.registerTool("avid_export_transcript", {description:"Export a selected transcript revision as TXT, JSON, CSV, SRT or VTT. Requires export.",inputSchema:{id,revision:z.string().uuid(),format:z.enum(["txt","json","csv","srt","vtt"])},annotations:write},
    ({id,revision,format})=>result("avid_export_transcript",()=>library.exportTranscript(id,revision,format)));
  server.registerTool("avid_transcript_outline", {description:"Build a bounded extractive transcript outline with source-range references. This does not generate a narrative summary.",inputSchema:{id,revision:z.string().uuid(),windowSeconds:z.number().min(10).max(3600).default(60)},annotations:read},
    ({id,revision,windowSeconds})=>result("avid_transcript_outline",()=>library.outline(id,revision,windowSeconds)));
  server.registerTool("avid_contact_sheet", {description:"Create a local HTML contact sheet with midpoint thumbnails for up to forty files. Requires export.",inputSchema:{ids:z.array(id).min(1).max(40)},annotations:write},
    ({ids})=>result("avid_contact_sheet",()=>library.contactSheet(ids)));
  server.registerTool("avid_save_collection", {description:"Save immutable curated source ranges, labels, notes and tags. Requires project-write. No editor mutation.",inputSchema:{collection:collectionSchema},annotations:write},
    ({collection})=>result("avid_save_collection",()=>collections.save(collection)));
  server.registerTool("avid_read_collection", {description:"Read a saved selects collection after validating current media scope.",inputSchema:{revision:z.string().uuid()},annotations:read},
    ({revision})=>result("avid_read_collection",()=>collections.read(revision)));
  server.registerTool("avid_collection_range", {description:"Query a local selects stringout by timeline range, returning overlap source ranges. This does not read the live editor timeline.",inputSchema:{revision:z.string().uuid(),start:z.number().nonnegative(),end:z.number().positive(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(200).default(50)},annotations:read},
    ({revision,start,end,after,limit})=>result("avid_collection_range",()=>collections.range(revision,start,end,after,limit)));
  server.registerTool("avid_export_collection_otio", {description:"Export frame-quantized single-video-track OTIO selects with local media references. Requires export. Avid import is not verified; audio routing/effects are not authored.",inputSchema:{revision:z.string().uuid(),rate:z.number().positive().max(240)},annotations:write},
    ({revision,rate})=>result("avid_export_collection_otio",()=>collections.exportOtio(revision,rate)));
  server.registerTool("avid_configure_watch_folder", {description:"Create or replace a persistent bounded local watch folder. Requires project-write. Two stable observations precede indexing; service starts separately.",inputSchema:{options:watchOptions,watchId:z.string().uuid().optional()},annotations:write},
    ({options,watchId})=>result("avid_configure_watch_folder",()=>watches.configure(options,watchId)));
  server.registerTool("avid_list_watch_folders", {description:"List configured watch folders within current path scope and their checkpoints.",inputSchema:{},annotations:read},
    ()=>result("avid_list_watch_folders",()=>watches.list()));
  server.registerTool("avid_remove_watch_folder", {description:"Remove a watch configuration; source media and cached analysis remain. Requires project-write.",inputSchema:{watchId:z.string().uuid()},annotations:write},
    ({watchId})=>result("avid_remove_watch_folder",()=>watches.remove(watchId)));
  server.registerTool("avid_scan_watch_folder", {description:"Run one bounded watch-folder observation/indexing pass with per-file checkpoints. Does not upload or edit source media.",inputSchema:{watchId:z.string().uuid()},annotations:write},
    ({watchId})=>result("avid_scan_watch_folder",()=>watches.scan(watchId)));
  server.registerTool("avid_watch_service", {description:"Start/stop local polling or read its status. Service belongs to this MCP session, stops at disconnect, and does not restart automatically. Stop lets the current file finish.",inputSchema:{action:z.enum(["start","stop","status"]),intervalSeconds:z.number().int().min(10).max(3600).default(30)},annotations:write},
    ({action,intervalSeconds})=>result("avid_watch_service",async()=>action==="start"?watches.start(intervalSeconds):action==="stop"?watches.stop():watches.status()));
  server.registerTool("avid_snapshot_saved_bins", {description:"Capture bounded semantic mob/track/source indexes from saved AVB files. Requires Python/pyavb. Excludes unsaved editor changes and reports unsupported effects/rates.",inputSchema:{bins:z.array(z.string()).min(1).max(100)},annotations:write},
    ({bins})=>result("avid_snapshot_saved_bins",()=>snapshots.create(bins)));
  server.registerTool("avid_diff_saved_snapshots", {description:"Compare semantic mob/track/source fields between saved-bin snapshots, excluding volatile save metadata.",inputSchema:{baseline:z.string().uuid(),candidate:z.string().uuid()},annotations:read},
    ({baseline,candidate})=>result("avid_diff_saved_snapshots",()=>snapshots.diff(baseline,candidate)));
  server.registerTool("avid_saved_timeline_range", {description:"Read a half-open edit-unit range and source overlaps from a saved-bin snapshot, with track ordinal and continuation. Does not read unsaved/live editor state.",inputSchema:{revision:z.string().uuid(),mobId:z.string().min(1),start:z.number().int().nonnegative(),end:z.number().int().positive(),trackOrdinal:z.number().int().nonnegative().optional(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(200).default(100)},annotations:read},
    ({revision,mobId,start,end,trackOrdinal,after,limit})=>result("avid_saved_timeline_range",()=>snapshots.range(revision,mobId,start,end,trackOrdinal,after,limit)));
  server.registerTool("avid_saved_source_usage", {description:"Find direct source-mob uses across snapshot bins and tracks. Opaque effects/retimes are explicitly incomplete.",inputSchema:{revision:z.string().uuid(),sourceMobId:z.string().min(1)},annotations:read},
    ({revision,sourceMobId})=>result("avid_saved_source_usage",()=>snapshots.usage(revision,sourceMobId)));
}
