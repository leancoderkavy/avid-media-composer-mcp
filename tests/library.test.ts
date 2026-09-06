import {mkdtemp,writeFile,readFile,mkdir,readdir,symlink,realpath} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
import {cosine} from "../src/library/visual.js";
import {clientConfiguration,installConfiguration} from "../src/setup.js";
import {Collections} from "../src/library/collections.js";

async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-library-"));
 const file=path.join(root,"test.wav");await writeFile(file,"fixture");
 const id=createHash("sha256").update("fixture").digest("hex");
 const directory=path.join(root,"avid-mcp-library");await mkdir(directory);
 await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file,bytes:7,metadata:{format:{duration:"10"}},transcript:[]}));
 const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write,export"});
 return {root,file,id,config,library:new MediaLibrary(config)};
}
describe("local library boundaries",()=>{
 it("exports collection references through verified aliases and refuses stale copies",async()=>{
  const {config,id,file,root}=await fixture(),collections=new Collections(config);
  const saved=await collections.save({name:"Recovered",selects:[{id,start:2,end:5,label:"",tags:[],note:""}]});
  const alias=path.join(root,"reconnected.wav"),directory=path.join(root,"avid-mcp-library"),aliases=path.join(directory,`${id}.sources`);
  await writeFile(alias,"fixture");await mkdir(aliases);await writeFile(path.join(aliases,`${"a".repeat(64)}.json`),JSON.stringify({id,file:alias}));await writeFile(file,"changed");
  const exported=await new Collections(config).exportOtio(saved.revision,30),bytes=await readFile(exported.output),document=JSON.parse(bytes.toString());
  const clip=document.tracks.children[0].children[0];
  expect(clip.media_references.DEFAULT_MEDIA.target_url).toBe(pathToFileURL(await realpath(alias)).href);
  expect(clip.metadata.avid_mcp.sourceSha256).toBe(id);expect(clip.source_range.start_time.value).toBe(60);expect(clip.source_range.duration.value).toBe(90);
  const before=(await readdir(directory)).sort();await writeFile(alias,"also changed");
  await expect(new Collections(config).exportOtio(saved.revision,30)).rejects.toThrow("Source changed since indexing");
  expect((await readdir(directory)).sort()).toEqual(before);expect(await readFile(exported.output)).toEqual(bytes);expect(await readFile(file,"utf8")).toBe("changed");
 });
 it.each([false,true])("refuses matching out-of-scope aliases (directory link: %s) and can select a later allowed copy",async linked=>{
  const {library,id,file,root}=await fixture(),outside=await mkdtemp(path.join(os.tmpdir(),"avid-outside-")),external=path.join(outside,"private.wav");await writeFile(external,"fixture");await writeFile(file,"changed");
  let alias=external;
  if(linked){const link=path.join(root,"redirect");await symlink(outside,link,process.platform==="win32"?"junction":"dir");alias=path.join(link,"private.wav");}
  const aliases=path.join(root,"avid-mcp-library",`${id}.sources`);await mkdir(aliases);await writeFile(path.join(aliases,`${"a".repeat(64)}.json`),JSON.stringify({id,file:alias}));
  await expect(library.validatedMetadata(id)).rejects.toThrow("Source changed since indexing");
  const allowed=path.join(root,"allowed.wav");await writeFile(allowed,"fixture");await writeFile(path.join(aliases,`${"b".repeat(64)}.json`),JSON.stringify({id,file:allowed}));
  expect((await library.validatedMetadata(id)).file).toBe(await realpath(allowed));const report=await library.report([id]);const html=await readFile(report.output,"utf8");expect(html).toContain("allowed.wav");expect(html).not.toContain("private.wav");expect(await readFile(external,"utf8")).toBe("fixture");
 });
 it("uses a matching indexed alias when the original path contains changed media",async()=>{
  const {library,id,file,root}=await fixture(),alias=path.join(root,"reconnected.wav");await writeFile(alias,"fixture");
  const aliases=path.join(root,"avid-mcp-library",`${id}.sources`);await mkdir(aliases);
  await writeFile(path.join(aliases,`${"a".repeat(64)}.json`),JSON.stringify({id,file:alias}));await writeFile(file,"changed");
  const report=await library.report([id]),html=await readFile(report.output,"utf8");expect(html).toContain("reconnected.wav");expect(html).not.toContain("test.wav");
  expect(await readFile(file,"utf8")).toBe("changed");expect(await readFile(alias,"utf8")).toBe("fixture");
  await writeFile(alias,"also changed");await expect(library.report([id])).rejects.toThrow("Source changed since indexing");
 });
 it("refuses stale inventory metadata before publishing another report",async()=>{
  const {library,id,file,root}=await fixture();const first=await library.report([id]);const bytes=await readFile(first.output);
  const directory=path.join(root,"avid-mcp-library"),before=(await readdir(directory)).sort();
  await writeFile(file,"changed");await expect(library.report([id])).rejects.toThrow("Source changed since indexing");
  expect((await readdir(directory)).sort()).toEqual(before);expect(await readFile(first.output)).toEqual(bytes);expect(await readFile(file,"utf8")).toBe("changed");
 });
 it("maps collection overlaps to source ranges and validates OTIO identity",async()=>{
  const {config,id,file}=await fixture();const collections=new Collections(config);
  const saved=await collections.save({name:"Selects",selects:[{id,start:2,end:5,label:"first",tags:["outdoors"],note:""},{id,start:6,end:8,label:"second",tags:[],note:""}]});
  const range=await collections.range(saved.revision,2,4);
  expect(range.results.map(r=>[r.overlapSourceStart,r.overlapSourceEnd])).toEqual([[4,5],[6,7]]);
  expect((await collections.range(saved.revision,3,5)).results).toHaveLength(1);
  const exported=await collections.exportOtio(saved.revision,30);
  const otio=JSON.parse(await readFile(exported.output,"utf8"));
  expect(otio.tracks.children[0].children[0].source_range.start_time.value).toBe(60);
  await expect(collections.save({name:"Bad",selects:[{id,start:0,end:11,label:"",tags:[],note:""}]})).rejects.toThrow("duration");
  await writeFile(file,"changed");await expect(collections.exportOtio(saved.revision,30)).rejects.toThrow("Source changed");
 });
 it("keeps transcript revisions separate and paginates half-open overlaps",async()=>{
  const {library,id}=await fixture();
  const first=await library.importTranscript(id,[{start:0,end:2,text:"First quote"},{start:2,end:4,text:"Second QUOTE"},{start:4,end:6,text:"Third"}]);
  const page=await library.transcriptRange(id,2,5,-1,1,first.revision);
  expect(page.segments.map(s=>s.text)).toEqual(["Second QUOTE"]);expect(page.truncated).toBe(true);
  const next=await library.transcriptRange(id,2,5,page.nextAfter!,1,first.revision);expect(next.segments[0]?.text).toBe("Third");
  expect((await library.search([id],"quote",10,{[id]:first.revision})).results).toHaveLength(2);
  expect((await library.search([id],"quote")).results).toHaveLength(0);
  await expect(library.importTranscript(id,[{start:9,end:11,text:"outside"}])).rejects.toThrow("duration");
 });
 it("rechecks allowed roots and detects changed source before export",async()=>{
  const {library,file,id,config}=await fixture();await writeFile(file,"changed");
  await expect(library.artifact(id,"copy")).rejects.toThrow("Source changed");
  const narrow=new MediaLibrary({...config,allowedRoots:[]});await expect(narrow.metadata([id])).rejects.toThrow("outside");
 });
 it("does not allow export merely because an output root exists",async()=>{
  const{config,id}=await fixture();await expect(new MediaLibrary({...config,capabilities:new Set(["inspect"])}).artifact(id,"copy")).rejects.toThrow("export");
 });
 it("compares normalized embeddings and rejects malformed vectors",()=>{
  expect(cosine([1,0],[0,1])).toBe(0);expect(cosine([2,0],[1,0])).toBe(1);
  expect(()=>cosine([NaN],[1])).toThrow();expect(()=>cosine([1,2],[1])).toThrow();
 });
 it("backs up and merges unrelated client configuration without replacing an existing Avid entry",async()=>{
  const{root}=await fixture();const target=path.join(root,"client.json");
  const original={theme:"dark",mcpServers:{other:{command:"existing"}}};await writeFile(target,JSON.stringify(original));
  const config=clientConfiguration("claude",[root]);const result=await installConfiguration(target,config);
  expect(JSON.parse(await readFile(result.backup!,"utf8"))).toEqual(original);
  expect(JSON.parse(await readFile(target,"utf8"))).toMatchObject(original);
  await expect(installConfiguration(target,config)).rejects.toThrow("already exists");
 });
});
