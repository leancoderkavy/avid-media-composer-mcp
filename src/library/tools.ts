import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { errorDetails } from "../errors.js";
import { MediaLibrary, transcriptSchema } from "./media-library.js";
import { VisualSearch, visualRange, visualScope } from "./visual.js";
import { SpeechAnalysis } from "./speech.js";
import {speechOptions} from "./speech-options.js";
import { AnalysisJobs, jobSchema } from "./jobs.js";
import {Collections, collectionSchema} from "./collections.js";
import {WatchFolders,watchOptions} from "./watch-folders.js";
import {ProjectSnapshots} from "./project-snapshots.js";
import {AafBuilder,aafBuildSchema} from "./aaf-builder.js";
import {MediaSummaries} from "./summaries.js";
import {MediaQc,qcOptions} from "./qc.js";
import {ShotDetection,shotOptions} from "./shots.js";
import {People,peopleEditSchema} from "./people.js";
import {TranscriptRevisions,transcriptEdits} from "./transcripts.js";

export function registerLibraryTools(server: McpServer, config: ServerConfig) {
  const library = new MediaLibrary(config);
  const visual = new VisualSearch(config);
  const speech = new SpeechAnalysis(config);
  const jobs = new AnalysisJobs(config);
  const collections = new Collections(config);
  const watches = new WatchFolders(config);
  const snapshots = new ProjectSnapshots(config);
  const people = new People(config);
  const qc = new MediaQc(config);
  const shots = new ShotDetection(config);
  const summaries = new MediaSummaries(config);
  const aafBuilder = new AafBuilder(config);
  const transcripts = new TranscriptRevisions(config);
  const previousClose=server.server.onclose;
  server.server.onclose=()=>{jobs.close();watches.stop();void Promise.allSettled([visual.dispose(),speech.dispose(),summaries.dispose()]);previousClose?.();};
  const id = z.string().regex(/^[a-f0-9]{64}$/);
  const ids = z.array(id).min(1).max(100);
  const read = {readOnlyHint:true, destructiveHint:false, openWorldHint:false, idempotentHint:true};
  const write = {readOnlyHint:false, destructiveHint:false, openWorldHint:false, idempotentHint:false};
  const result = async (name: string, fn: () => Promise<unknown>) => {
    try { const data = {ok:true,tool:name,data:await fn()}; return {content:[{type:"text" as const,text:JSON.stringify(data)}],structuredContent:data}; }
    catch(error) { const data={ok:false,tool:name,error:errorDetails(error)}; return {content:[{type:"text" as const,text:JSON.stringify(data)}],structuredContent:data,isError:true}; }
  };
  server.registerTool("avid_summary_runs",{description:"Discover persisted summary computation runs for a media ID. Partial does not prove worker termination. Runs with invalid or missing provenance are returned as unavailable with an error.",inputSchema:{id,after:z.string().uuid().optional(),limit:z.number().int().min(1).max(100).default(20)},annotations:read},
    ({id,after,limit})=>result("avid_summary_runs",()=>summaries.runs(id,after,limit)));
  server.registerTool("avid_summary_run",{description:"Read persisted summary node counts and verify transcript provenance and completed output.",inputSchema:{runId:z.string().uuid()},annotations:read},
    ({runId})=>result("avid_summary_run",()=>summaries.runStatus(runId)));
  server.registerTool("avid_resume_summary",{description:"Resume a partial summary in a new run after verifying transcript checksum, pinned model and node input/structure. Reuses completed nodes. Requires project-write and cached summary models; use a summary_resume job for cancellable execution.",inputSchema:{runId:z.string().uuid()},annotations:write},
    ({runId})=>result("avid_resume_summary",()=>summaries.resume(runId)));
  server.registerTool("avid_visual_index_runs",{description:"Discover persisted visual indexing runs and completed sample counts. Partial does not prove the original worker stopped. Checkpoints survive cancellation or server restart.",inputSchema:{after:z.string().uuid().optional(),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({after,limit})=>result("avid_visual_index_runs",()=>visual.checkpoints.list(after,limit)));
  server.registerTool("avid_visual_index_run",{description:"Read a visual indexing run's persisted progress without loading a model.",inputSchema:{runId:z.string().uuid()},annotations:read},
    ({runId})=>result("avid_visual_index_run",()=>visual.checkpoints.status(runId)));
  server.registerTool("avid_resume_visual_index",{description:"Resume a partial visual index in a new run, reusing its verified contiguous sample prefix. Checks model revision, source hashes and cached image hashes; computes missing samples. Requires export and cached models. Original run is preserved. Use a visual_resume job for cancellable execution.",inputSchema:{runId:z.string().uuid()},annotations:write},
    ({runId})=>result("avid_resume_visual_index",()=>visual.resume(runId)));
  server.registerTool("avid_inspect_aaf_template", {description:"Inspect a master-only Avid-exported AAF and validate/hash local media locators. Requires export for a request manifest. Does not import into Avid.",inputSchema:{template:z.string().min(1)},annotations:write},
    ({template})=>result("avid_inspect_aaf_template",()=>aafBuilder.inspect(template)));
  server.registerTool("avid_build_aaf_selects", {description:"Build a new straight-cut AAF composition preserving exported source descriptors. Requires export, current template checksum and explicit master/slot mappings. Verifies output ranges; host import/playback is separate.",inputSchema:{request:aafBuildSchema},annotations:write},
    ({request})=>result("avid_build_aaf_selects",()=>aafBuilder.build(request)));
  server.registerTool("avid_generate_summary", {description:"Generate a local English transcript summary hierarchy with pinned DistilBART. Requires project-write and explicitly downloaded models. Source references are checked; factual accuracy requires review. Use a summary job for longer transcripts.",inputSchema:{id,transcriptRevision:z.string().uuid()},annotations:write},
    ({id,transcriptRevision})=>result("avid_generate_summary",()=>summaries.generate(id,transcriptRevision)));
  server.registerTool("avid_summary_node", {description:"Read a generated summary overview or drill into a node, with children and leaf transcript references. Refuses changed/missing transcript provenance.",inputSchema:{revision:z.string().uuid(),nodeId:z.string().optional()},annotations:read},
    ({revision,nodeId})=>result("avid_summary_node",()=>summaries.node(revision,nodeId)));
  server.registerTool("avid_list_summaries", {description:"Discover generated summary hierarchies for indexed media with pagination.",inputSchema:{id,after:z.string().uuid().optional(),limit:z.number().int().min(1).max(100).default(20)},annotations:read},
    ({id,after,limit})=>result("avid_list_summaries",()=>summaries.list(id,after,limit)));
  server.registerTool("avid_delete_summary", {description:"Delete a selected generated summary document with checksum validation. Transcript and source media remain. Requires project-write.",inputSchema:{revision:z.string().uuid(),expectedSha256:id},annotations:{...write,destructiveHint:true}},
    ({revision,expectedSha256})=>result("avid_delete_summary",()=>summaries.remove(revision,expectedSha256)));
  server.registerTool("avid_media_qc", {description:"Decode up to ten minutes of the first video/audio streams for black, freeze, silence, input loudness and timestamp-variation findings. Writes JSON/HTML reports; requires export. Findings need review and are not delivery certification or perceptual sync analysis.",inputSchema:{id,options:qcOptions},annotations:write},
    ({id,options})=>result("avid_media_qc",()=>qc.analyze(id,options)));
  server.registerTool("avid_detect_shots", {description:"Decode a source range up to one hour for threshold-based visual cuts and half-open shot intervals with representative timestamps. Requires export and FFmpeg scdet. Flashes/motion may create false cuts; use a shots job for long ranges.",inputSchema:{id,options:shotOptions},annotations:write},
    ({id,options})=>result("avid_detect_shots",()=>shots.detect(id,options)));
  server.registerTool("avid_index_visual_shots", {description:"Detect cuts and index one local CLIP midpoint per detected shot, retaining source ranges in search results. Requires export, cached models and FFmpeg; rejects over 1200 shots instead of dropping coverage. Use a visual_shots job for long ranges.",inputSchema:{id,options:shotOptions},annotations:write},
    ({id,options})=>result("avid_index_visual_shots",()=>visual.indexShots(id,options)));
  server.registerTool("avid_index_media", {description:"Index up to 100 local media files by SHA-256 into the configured output directory. No media upload.", inputSchema:{files:z.array(z.string()).min(1).max(100)},annotations:write},
    ({files})=>result("avid_index_media",()=>library.index(files)));
  server.registerTool("avid_library_metadata", {description:"Read indexed technical media metadata.",inputSchema:{ids},annotations:read},
    ({ids})=>result("avid_library_metadata",()=>library.metadata(ids)));
  server.registerTool("avid_search_media", {description:"Search indexed metadata and selected transcript revisions with case-insensitive substring matching. This is not visual or semantic search.",inputSchema:{ids,query:z.string().min(1).max(500),limit:z.number().int().min(1).max(200).default(50),revisions:z.record(id,z.string().uuid()).default({})},annotations:read},
    ({ids,query,limit,revisions})=>result("avid_search_media",()=>library.search(ids,query,limit,revisions)));
  server.registerTool("avid_import_transcript", {description:"Save an immutable local transcript revision for indexed media. Requires project-write. Returns a revision ID for search/range queries.",inputSchema:{id,segments:transcriptSchema},annotations:write},
    ({id,segments})=>result("avid_import_transcript",()=>library.importTranscript(id,segments)));
  server.registerTool("avid_transcript_revisions", {description:"Discover paginated transcript revisions, checksums and correction ancestry for indexed media.",inputSchema:{id,after:z.string().uuid().optional(),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({id,after,limit})=>result("avid_transcript_revisions",()=>transcripts.list(id,after,limit)));
  server.registerTool("avid_correct_transcript", {description:"Create a corrected revision by replacing/removing original segment indices or adding segments. Supports text, timing and user-supplied speaker labels. Retains the original; requires project-write and its checksum.",inputSchema:{id,revision:z.string().uuid(),expectedSha256:id,edits:transcriptEdits},annotations:write},
    ({id,revision,expectedSha256,edits})=>result("avid_correct_transcript",()=>transcripts.correct(id,revision,expectedSha256,edits)));
  server.registerTool("avid_delete_transcript_revision", {description:"Delete exactly one transcript revision with checksum checking. Other revisions and exports remain. Requires project-write.",inputSchema:{id,revision:z.string().uuid(),expectedSha256:id},annotations:{...write,destructiveHint:true}},
    ({id,revision,expectedSha256})=>result("avid_delete_transcript_revision",()=>transcripts.remove(id,revision,expectedSha256)));
  server.registerTool("avid_transcript_range", {description:"Read a bounded half-open transcript range with a continuation cursor.",inputSchema:{id,start:z.number().nonnegative(),end:z.number().positive(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(200).default(50),revision:z.string().uuid().optional()},annotations:read},
    ({id,start,end,after,limit,revision})=>result("avid_transcript_range",()=>library.transcriptRange(id,start,end,after,limit,revision)));
  server.registerTool("avid_media_artifact", {description:"Create a thumbnail, trimmed MP4 or checksum-verified copy in a unique output folder. Requires export. Validates indexed source identity and never overwrites.",inputSchema:{id,kind:z.enum(["thumbnail","clip","copy"]),start:z.number().nonnegative().default(0),end:z.number().positive().optional()},annotations:write},
    ({id,kind,start,end})=>result("avid_media_artifact",()=>library.artifact(id,kind,start,end)));
  server.registerTool("avid_media_report", {description:"Write a local HTML media inventory. Requires export.",inputSchema:{ids},annotations:write},
    ({ids})=>result("avid_media_report",()=>library.report(ids)));
  server.registerTool("avid_index_visual", {description:"Compute local CLIP embeddings for uniform frame samples, optionally in a source-time range. Maximum 120 samples per file and 1200 total; does not detect every shot. Requires separately downloaded models and export authority for cached thumbnails.",inputSchema:{ids,samplesPerFile:z.number().int().min(1).max(120).default(6),range:visualRange.optional()},annotations:write},
    ({ids,samplesPerFile,range})=>result("avid_index_visual",()=>visual.index(ids,samplesPerFile,range)));
  server.registerTool("avid_search_visual", {description:"Search a local visual index by text or a reference image; returns sampled source timestamps and CLIP similarity, not identity or probability.",inputSchema:{indexId:z.string().uuid(),query:z.union([z.object({text:z.string().min(1).max(500)}).strict(),z.object({image:z.string().min(1)}).strict()]),limit:z.number().int().min(1).max(100).default(20),scope:visualScope.default({})},annotations:read},
    ({indexId,query,limit,scope})=>result("avid_search_visual",()=>visual.search(indexId,query,limit,scope)));
  server.registerTool("avid_visual_samples", {description:"Inspect paginated visual-index sample timestamps and thumbnails, optionally scoped by media IDs and a half-open source-time range. Embeddings are omitted.",inputSchema:{indexId:z.string().uuid(),scope:visualScope.default({}),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({indexId,scope,after,limit})=>result("avid_visual_samples",()=>visual.samples(indexId,scope,after,limit)));
  server.registerTool("avid_search_visual_frame", {description:"Extract a source frame at a given time and find similar indexed frames. Requires export for the reference thumbnail. Optional media/time scope limits results.",inputSchema:{indexId:z.string().uuid(),id,time:z.number().nonnegative(),limit:z.number().int().min(1).max(100).default(20),scope:visualScope.default({})},annotations:write},
    ({indexId,id,time,limit,scope})=>result("avid_search_visual_frame",()=>visual.searchFrame(indexId,id,time,limit,scope)));
  server.registerTool("avid_transcribe_media", {description:"Transcribe up to ten minutes of local audio with explicitly downloaded English or multilingual Whisper weights. Options select model and language code (auto omits a language hint). Requires export and project-write. Returns a reviewable transcript revision; no diarization or accuracy guarantee.",inputSchema:{id,start:z.number().nonnegative(),end:z.number().positive(),options:speechOptions.default({model:"tiny.en",language:"auto"})},annotations:write},
    ({id,start,end,options})=>result("avid_transcribe_media",()=>speech.transcribe(id,start,end,options)));
  server.registerTool("avid_start_analysis_job", {description:"Queue analysis in a bounded local worker after saving its job record. Execution belongs to this session; persistent history survives restart but unfinished work is not automatically resumed.",inputSchema:{job:jobSchema},annotations:write},
    ({job})=>result("avid_start_analysis_job",async()=>jobs.start(job)));
  server.registerTool("avid_analysis_job_status", {description:"Read local analysis job status and completed result.",inputSchema:{jobId:z.string().uuid()},annotations:read},
    ({jobId})=>result("avid_analysis_job_status",async()=>jobs.readStatus(jobId)));
  server.registerTool("avid_analysis_job_history", {description:"Read paginated persistent job records within the same configured roots/capabilities. Unfinished records from another session are unresolved, never automatically replayed; outputs may exist. Does not resume computation.",inputSchema:{after:z.string().uuid().optional(),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({after,limit})=>result("avid_analysis_job_history",()=>jobs.journal.list(after,limit)));
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
  server.registerTool("avid_thumbnail_strip", {description:"Create a portable HTML strip and checksum manifest with 1–120 uniform samples across a source-time range. Requires export. Labels are requested seek times, not exact decoded PTS; sampling may miss shots.",inputSchema:{id,start:z.number().nonnegative(),end:z.number().positive(),samples:z.number().int().min(1).max(120).default(12)},annotations:write},
    ({id,start,end,samples})=>result("avid_thumbnail_strip",()=>library.thumbnailStrip(id,start,end,samples)));
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
  server.registerTool("avid_index_people", {description:"Detect and group similar faces from sampled local frames using explicitly installed YuNet/SFace models. Requires export and project-write. Groups need review; names are never inferred. For long work use a people analysis job.",inputSchema:{ids:z.array(id).min(1).max(20),samples:z.number().int().min(1).max(24).default(12),threshold:z.number().min(0).max(1).default(0.45)},annotations:write},
    ({ids,samples,threshold})=>result("avid_index_people",()=>people.index(ids,samples,threshold)));
  server.registerTool("avid_people_clusters", {description:"Read paginated similarity groups and user-supplied names. These are not verified identities.",inputSchema:{indexId:z.string().uuid(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({indexId,after,limit})=>result("avid_people_clusters",()=>people.list(indexId,after,limit)));
  server.registerTool("avid_people_faces", {description:"Read bounded source timestamps, face boxes and local crop paths, optionally by cluster. Embeddings are not returned.",inputSchema:{indexId:z.string().uuid(),clusterId:z.string().uuid().optional(),after:z.number().int().min(-1).default(-1),limit:z.number().int().min(1).max(100).default(50)},annotations:read},
    ({indexId,clusterId,after,limit})=>result("avid_people_faces",()=>people.faces(indexId,clusterId,after,limit)));
  server.registerTool("avid_edit_people", {description:"Name, merge, move, remove a face, or recluster a reviewed people index with revision checking. Reclustering resets names. Face removal deletes its crop/embedding; sampled frames remain until whole-index deletion.",inputSchema:{indexId:z.string().uuid(),expectedRevision:z.string().uuid(),operation:peopleEditSchema},annotations:{...write,destructiveHint:true}},
    ({indexId,expectedRevision,operation})=>result("avid_edit_people",()=>people.edit(indexId,expectedRevision,operation)));
  server.registerTool("avid_delete_people_index", {description:"Delete this index's face embeddings, crops and sampled frames after revision validation. Source media and other analysis indexes remain.",inputSchema:{indexId:z.string().uuid(),expectedRevision:z.string().uuid()},annotations:{...write,destructiveHint:true}},
    ({indexId,expectedRevision})=>result("avid_delete_people_index",()=>people.remove(indexId,expectedRevision)));
}
