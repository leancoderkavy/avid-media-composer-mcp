import { mkdir, readFile, writeFile, realpath, copyFile, stat, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as z from "zod/v4";
import type { ServerConfig } from "../config.js";
import { resolveReadablePath } from "../security/path-policy.js";
import { requireCapability } from "../security/capabilities.js";
import { sha256File } from "../analysis/file-inventory.js";
import { runProcess } from "../process.js";
import {readBoundedJson} from "../security/bounded-read.js";

export const transcriptSchema = z.array(z.object({
  start: z.number().nonnegative(), end: z.number().positive(), text: z.string().max(10000),
  speaker: z.string().max(100).optional(),
}).strict().refine(value => value.end > value.start, "Transcript end must follow start")).max(100000);
type Segment = z.infer<typeof transcriptSchema>[number];
interface Entry { id: string; file: string; bytes: number; metadata: Record<string, any>; transcript: Segment[] }
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);
const idSchema = z.string().regex(/^[a-f0-9]{64}$/);

export class MediaLibrary {
  constructor(private readonly config: ServerConfig) {}
  async directory() {
    requireCapability(this.config.capabilities, "inspect");
    if (!this.config.outputRoot) throw new Error("Set AVID_MCP_OUTPUT_ROOT to an existing directory for generated artifacts and analysis");
    const root = await realpath(this.config.outputRoot);
    const directory = path.join(root, "avid-mcp-library");
    await mkdir(directory, { recursive: true });
    await resolveReadablePath(directory, [root], "directory");
    return directory;
  }
  private async entry(id: string): Promise<Entry> {
    idSchema.parse(id);
    const directory = await this.directory();
    const file = await resolveReadablePath(path.join(directory, `${id}.json`), [directory], "file");
    const entry = await readBoundedJson(file,20*1024*1024) as Entry;
    if (entry.id !== id) throw new Error("Library identity mismatch");
    const candidates=[entry.file];
    const sources=path.join(directory,`${id}.sources`);
    try {
      await resolveReadablePath(sources,[directory],"directory");
      const aliases=await readdir(sources);
      if(aliases.length>100)throw new Error("Too many source aliases");
      for(const alias of aliases.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
        const target=await resolveReadablePath(path.join(sources,alias),[sources],"file");
        const value=await readBoundedJson(target,32768) as {id:string;file:string};
        if(value.id!==id||typeof value.file!=="string")throw new Error("Invalid source alias");
        candidates.push(value.file);
      }
    }catch(error){if(!["ENOENT","PATH_NOT_FOUND"].includes((error as NodeJS.ErrnoException).code??""))throw error;}
    let available:string|undefined;
    for(const candidate of candidates){
      try {available=await resolveReadablePath(candidate,this.config.allowedRoots,"file");break;}
      catch { /* A cache can be shared across different allowed roots or disconnected disks. */ }
    }
    if(!available)throw new Error("Indexed source is missing or outside current allowed roots; index its new location to reconnect");
    entry.file=available;
    entry.transcript = transcriptSchema.parse(entry.transcript);
    return entry;
  }
  private async source(entry: Entry) {
    const source = await resolveReadablePath(entry.file, this.config.allowedRoots, "file");
    if (await sha256File(source) !== entry.id) throw new Error("Source changed since indexing; index it again");
    return source;
  }
  async index(files: string[]) {
    if (!files.length || files.length > Math.min(this.config.maxMediaFiles, 100)) throw new Error("Index batch is outside the configured limit");
    const directory = await this.directory();
    const result = [];
    for (const input of files) {
      const file = await resolveReadablePath(input, this.config.allowedRoots, "file");
      const before = await sha256File(file);
      if (![".mp4", ".mov", ".mxf", ".wav", ".mp3", ".mkv", ".avi", ".aiff", ".flac"].includes(path.extname(file).toLowerCase())) throw new Error("Unsupported media container for local indexing");
      const probe = await runProcess(this.config.ffprobeExecutable, ["-v","error","-protocol_whitelist","file,pipe","-show_format","-show_streams","-of","json",file], { timeoutMs: this.config.commandTimeoutMs, maxOutputBytes: 1024 * 1024 });
      if (probe.exitCode !== 0) throw new Error("Media metadata probe failed");
      const metadata = JSON.parse(probe.stdout);
      if (!Array.isArray(metadata.streams) || !metadata.streams.length) throw new Error("No media streams found");
      if (await sha256File(file) !== before) throw new Error("Media changed during indexing");
      const entry: Entry = { id: before, file, bytes: (await stat(file)).size, metadata, transcript: [] };
      try {
        await writeFile(path.join(directory, `${before}.json`), JSON.stringify(entry), { flag: "wx" });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const sources=path.join(directory,`${before}.sources`);
      await mkdir(sources,{recursive:true});
      await resolveReadablePath(sources,[directory],"directory");
      const alias=path.join(sources,`${createHash("sha256").update(file).digest("hex")}.json`);
      try{await writeFile(alias,JSON.stringify({id:before,file}),{flag:"wx"});}
      catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
      result.push({ id: before, file, duration: metadata.format?.duration, streams: metadata.streams });
    }
    return { entries: result, sourceModified: false };
  }
  async metadata(ids: string[]) { return Promise.all(ids.map(async id => { const entry = await this.entry(id); return { ...entry, transcript: undefined }; })); }
  async search(ids: string[], query: string, limit = 50, revisions: Record<string, string> = {}) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) throw new Error("Search query is empty");
    const results = [];
    for (const id of ids) {
      const entry = await this.entry(id);
      if (`${path.basename(entry.file)} ${JSON.stringify(entry.metadata)}`.toLocaleLowerCase().includes(needle)) results.push({ id, kind: "metadata", file: entry.file });
      const transcript = revisions[id] ? (await this.transcriptRange(id, 0, Number(entry.metadata.format?.duration), -1, 100000, revisions[id])).segments : entry.transcript;
      for (const segment of transcript) {
        if (segment.text.toLocaleLowerCase().includes(needle)) results.push({ id, kind: "transcript", ...segment });
        if (results.length > limit) break;
      }
      if (results.length > limit) break;
    }
    return { matchMode: "case-insensitive-substring", results: results.slice(0, limit), truncated: results.length > limit };
  }
  async importTranscript(id: string, segments: Segment[]) {
    requireCapability(this.config.capabilities, "project-write");
    const entry = await this.entry(id);
    const parsed = transcriptSchema.parse(segments).sort((a, b) => a.start - b.start || a.end - b.end);
    const duration = Number(entry.metadata.format?.duration);
    if (!Number.isFinite(duration) || parsed.some(segment => segment.end > duration)) throw new Error("Transcript is outside media duration");
    // Exclusive sidecar revision: source and existing transcript never overwritten.
    const revision = randomUUID();
    const output = path.join(await this.directory(), `${id}.transcript-${revision}.json`);
    await writeFile(output, JSON.stringify({ id, segments: parsed }), { flag: "wx" });
    return { revision, path: output, segmentCount: parsed.length };
  }
  async transcriptRange(id: string, start: number, end: number, after: number, limit: number, revision?: string) {
    const entry = await this.entry(id);
    let segments = entry.transcript;
    if (revision) {
      z.string().uuid().parse(revision);
      const directory = await this.directory();
      const file = await resolveReadablePath(path.join(directory, `${id}.transcript-${revision}.json`), [directory], "file");
      segments = transcriptSchema.parse((await readBoundedJson(file,20*1024*1024) as {segments:unknown}).segments);
    }
    if (end <= start) throw new Error("Invalid source range");
    const matches = segments.map((segment, index) => ({ ...segment, index })).filter(s => s.index > after && s.start < end && s.end > start);
    const page = matches.slice(0, limit);
    return { segments: page, truncated: matches.length > limit, nextAfter: matches.length > limit ? page.at(-1)?.index : null, rangeConvention: "half-open" };
  }
  async artifact(id: string, kind: "thumbnail" | "clip" | "copy", start = 0, end?: number) {
    requireCapability(this.config.capabilities, "export");
    const entry = await this.entry(id);
    const source = await this.source(entry);
    const duration = Number(entry.metadata.format?.duration);
    if (!Number.isFinite(start) || start < 0 || start >= duration || (end !== undefined && (!Number.isFinite(end) || end <= start || end > duration))) throw new Error("Requested range exceeds media");
    if (kind === "clip" && end === undefined) throw new Error("Clip export requires an end");
    const directory = path.join(await this.directory(), randomUUID());
    await mkdir(directory);
    const output = path.join(directory, kind === "copy" ? path.basename(source) : kind === "thumbnail" ? "frame.jpg" : "clip.mp4");
    if (kind === "copy") await copyFile(source, output, constants.COPYFILE_EXCL);
    else {
      const args = ["-nostdin", "-v", "error", "-n", "-protocol_whitelist", "file,pipe", "-ss", String(start), "-i", source];
      if (kind === "thumbnail") args.push("-map","0:v:0","-frames:v","1","-vf","scale=640:-2");
      else args.push("-t", String(end! - start), "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart");
      args.push(output);
      const result = await runProcess(this.config.ffmpegExecutable ?? "ffmpeg", args, { timeoutMs: this.config.commandTimeoutMs, maxOutputBytes: 1024 * 1024 });
      if (result.exitCode !== 0) throw new Error(`Media output failed; partial artifacts are in ${directory}`);
    }
    const outputSha256 = await sha256File(output);
    const sourceSha256 = await sha256File(source);
    if (sourceSha256 !== id || (kind === "copy" && outputSha256 !== id)) throw new Error("Integrity verification failed");
    const receipt = { id, kind, sourceSha256, outputSha256, output, start, end, sourceUnchanged: true };
    await writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" });
    return receipt;
  }
  async report(ids: string[]) {
    requireCapability(this.config.capabilities, "export");
    const entries = await this.metadata(ids);
    const output = path.join(await this.directory(), `report-${randomUUID()}.html`);
    const rows = entries.map(entry => `<tr><td>${escape(path.basename(entry.file))}</td><td>${escape(entry.id)}</td><td>${escape(entry.metadata.format?.duration)}</td><td>${escape(entry.bytes)}</td></tr>`).join("");
    await writeFile(output, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Media inventory</title><style>body{font:16px system-ui;margin:32px}table{border-collapse:collapse}td,th{padding:10px;border:1px solid #bbb;overflow-wrap:anywhere}</style><h1>Media inventory</h1><table><thead><tr><th>File</th><th>SHA-256</th><th>Seconds</th><th>Bytes</th></tr></thead><tbody>${rows}</tbody></table></html>`, {flag:"wx"});
    return { output, entries: entries.length };
  }
  async facets(ids:string[]){
    const facets:Record<string,Record<string,number>>={codec:{},resolution:{},frameRate:{},audioChannels:{}};
    for(const entry of await this.metadata(ids)){
      const values:Record<string,Set<string>>={codec:new Set(),resolution:new Set(),frameRate:new Set(),audioChannels:new Set()};
      for(const stream of entry.metadata.streams??[]){
        if(stream.codec_name)values.codec!.add(String(stream.codec_name));
        if(stream.width&&stream.height)values.resolution!.add(`${stream.width}x${stream.height}`);
        if(stream.codec_type==="video"&&stream.r_frame_rate)values.frameRate!.add(String(stream.r_frame_rate));
        if(stream.channels)values.audioChannels!.add(String(stream.channels));
      }
      for(const[key,set]of Object.entries(values))for(const value of set)facets[key]![value]=(facets[key]![value]??0)+1;
    }
    return {mediaCount:ids.length,facets,countMeaning:"Files with each observed value; nominal frame rate does not prove CFR"};
  }
  async exportTranscript(id:string,revision:string,format:"txt"|"json"|"csv"|"srt"|"vtt"){
    requireCapability(this.config.capabilities,"export");
    const entry=await this.entry(id);
    const {segments}=await this.transcriptRange(id,0,Number(entry.metadata.format?.duration),-1,100000,revision);
    const clock=(seconds:number,separator:string)=>{
      const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,"0")}:${String(Math.floor(ms/60000)%60).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}${separator}${String(ms%1000).padStart(3,"0")}`;
    };
    const csv=(value:unknown)=>`"${String(value).replaceAll('"','""')}"`;
    let text;
    if(format==="json")text=JSON.stringify({id,revision,segments},null,2);
    else if(format==="txt")text=segments.map(segment=>segment.text).join("\n");
    else if(format==="csv")text="start,end,speaker,text\n"+segments.map(segment=>[segment.start,segment.end,segment.speaker??"",segment.text].map(csv).join(",")).join("\n");
    else text=(format==="vtt"?"WEBVTT\n\n":"")+segments.map((segment,index)=>`${format==="srt"?`${index+1}\n`:""}${clock(segment.start,format==="srt"?",":".")} --> ${clock(segment.end,format==="srt"?",":".")}\n${segment.text.trim()}\n`).join("\n");
    const output=path.join(await this.directory(),`transcript-${randomUUID()}.${format}`);
    await writeFile(output,text,{flag:"wx"});return {output,segments:segments.length,revision};
  }
  async outline(id:string,revision:string,windowSeconds:number){
    const entry=await this.entry(id),duration=Number(entry.metadata.format?.duration);
    if(!Number.isFinite(windowSeconds)||windowSeconds<10)throw new Error("Outline window must be at least ten seconds");
    const {segments}=await this.transcriptRange(id,0,duration,-1,100000,revision);
    const groups=new Map<number,Segment[]>();
    for(const segment of segments){const key=Math.floor(segment.start/windowSeconds);const values=groups.get(key)??[];values.push(segment);groups.set(key,values);}
    return {id,revision,kind:"extractive-transcript-outline",generatedNarrative:false,children:[...groups.entries()].slice(0,500).map(([key,values])=>({nodeId:`${revision}:${key}`,start:key*windowSeconds,end:Math.min(duration,(key+1)*windowSeconds),segments:values.length,preview:values.map(value=>value.text).join(" ").slice(0,500)})),truncated:groups.size>500};
  }
  async contactSheet(ids:string[]){
    requireCapability(this.config.capabilities,"export");
    if(ids.length>40)throw new Error("Contact sheet is limited to 40 files");
    const directory=await this.directory();const items=[];
    for(const entry of await this.metadata(ids)){
      const image=await this.artifact(entry.id,"thumbnail",Number(entry.metadata.format?.duration)/2);
      const relative=path.relative(directory,image.output).split(path.sep).join("/");
      items.push(`<figure><img width="320" src="${escape(relative)}" alt="Midpoint frame"><figcaption>${escape(path.basename(entry.file))}</figcaption></figure>`);
    }
    const output=path.join(directory,`contact-sheet-${randomUUID()}.html`);
    await writeFile(output,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Contact sheet</title><style>body{font:16px system-ui}main{display:flex;flex-wrap:wrap}figure{max-width:320px}figcaption{overflow-wrap:anywhere}</style><h1>Media contact sheet</h1><main>${items.join("")}</main></html>`,{flag:"wx"});
    return {output,files:ids.length,sampling:"One midpoint frame per file; copy the report and its thumbnail directories together"};
  }
}
