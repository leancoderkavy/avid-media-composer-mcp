import {mkdtemp,writeFile,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,afterEach} from "vitest";
import {VisualSearch,VISUAL_MODEL,VISUAL_REVISION} from "../src/library/visual.js";
import {VisualCheckpoints} from "../src/library/visual-checkpoints.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {loadConfig} from "../src/config.js";
const model=vi.hoisted(()=>({vision:vi.fn(),text:vi.fn(),tokenizer:vi.fn()}));
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({AutoTokenizer:{from_pretrained:async()=>model.tokenizer},AutoProcessor:{from_pretrained:async()=>async(image:unknown)=>image},CLIPTextModelWithProjection:{from_pretrained:async()=>Object.assign(model.text,{dispose:async()=>{}})},CLIPVisionModelWithProjection:{from_pretrained:async()=>Object.assign(model.vision,{dispose:async()=>{}})},RawImage:{read:async(image:unknown)=>image,fromBlob:async(image:unknown)=>image}})}));
afterEach(()=>{vi.restoreAllMocks();model.vision.mockReset();model.text.mockReset();model.tokenizer.mockReset();});
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-visual-resume-")),source=path.join(root,"source.mp4");await writeFile(source,"source");const id=await sha256File(source);
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:root,AVID_MCP_CAPABILITIES:"inspect,export"});
  const directory=await new MediaLibrary(config).directory();await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:6}},transcript:[]}));
  vi.spyOn(MediaLibrary.prototype,"artifact").mockImplementation(async(_id,_kind,time)=>{const output=path.join(directory,`frame-${time}.jpg`);await writeFile(output,String(time));return {output} as any;});
  model.vision.mockResolvedValue({image_embeds:{data:Array(512).fill(0.5)}});
  return {root,source,id,config,directory,visual:new VisualSearch(config)};
}
it("resumes persisted embeddings after failure without recomputing the prefix",async()=>{
  const {config,id,visual,directory}=await fixture();model.vision.mockResolvedValueOnce({image_embeds:{data:Array(512).fill(0.5)}}).mockRejectedValueOnce(new Error("interrupted"));
  await expect(visual.index([id],3)).rejects.toMatchObject({code:"VISUAL_INDEX_INCOMPLETE"});
  const [partial]=(await visual.checkpoints.list()).runs;expect(partial).toMatchObject({state:"partial",completedSamples:1,plannedSamples:3});
  const original=await readFile(path.join(directory,`visual-run-${partial!.runId}`,"0.json"),"utf8");
  const resumed=await new VisualSearch(config).resume(partial!.runId);expect(resumed).toMatchObject({samples:3,reusedSamples:1,parentRunId:partial!.runId});expect(model.vision).toHaveBeenCalledTimes(4);
  expect(await readFile(path.join(directory,`visual-run-${partial!.runId}`,"0.json"),"utf8")).toBe(original);
  expect(await visual.checkpoints.status(resumed.runId)).toMatchObject({state:"completed",completedSamples:3});
  await expect(visual.resume(resumed.runId)).rejects.toThrow("already completed");
});
it("rejects oversized text before inference instead of dropping its suffix",async()=>{
  const {visual,id}=await fixture(),index=await visual.index([id],1);model.tokenizer.mockResolvedValue({input_ids:{dims:[1,78]}});
  await expect(visual.search(index.indexId,{text:"A long query fixture"},10)).rejects.toMatchObject({code:"VISUAL_QUERY_TOO_LONG",details:{tokenCount:78,maxTokens:77}});expect(model.text).not.toHaveBeenCalled();expect(model.tokenizer).toHaveBeenCalledWith("A long query fixture",{padding:true,truncation:false});
  const accepted={input_ids:{dims:[1,77]}};model.tokenizer.mockResolvedValue(accepted);model.text.mockResolvedValue({text_embeds:{data:Array(512).fill(0.5)}});expect((await visual.search(index.indexId,{text:"A valid query"},10)).results).toHaveLength(1);expect(model.text).toHaveBeenCalledWith(accepted);
  await expect(visual.search(index.indexId,{text:"   "},10)).rejects.toThrow();
});
it("rejects changed source, image, model revision and narrowed roots",async()=>{
  const {config,id,visual,directory,source}=await fixture();model.vision.mockResolvedValueOnce({image_embeds:{data:Array(512).fill(0.5)}}).mockRejectedValueOnce(new Error("stop"));await expect(visual.index([id],3)).rejects.toThrow();
  const run=(await visual.checkpoints.list()).runs[0]!.runId;
  await expect(new VisualSearch({...config,allowedRoots:[]}).resume(run)).rejects.toThrow();
  await expect(new VisualCheckpoints(config,VISUAL_MODEL,"different").read(run,true)).rejects.toThrow("revision");
  await writeFile(path.join(directory,"frame-1.jpg"),"changed");await expect(visual.resume(run)).rejects.toThrow("image changed");
  await writeFile(path.join(directory,"frame-1.jpg"),"1");await writeFile(source,"changed");await expect(visual.resume(run)).rejects.toThrow(/[Ss]ource changed/);
});
it("rejects malformed or reordered samples instead of trusting their vectors",async()=>{
  const {config,id,directory}=await fixture(),checkpoints=new VisualCheckpoints(config,VISUAL_MODEL,VISUAL_REVISION);
  const run=await checkpoints.create([{id,time:1}]);await writeFile(path.join(directory,`visual-run-${run}`,"0.json"),JSON.stringify({id,time:2,image:"x",imageSha256:id,vector:Array(512).fill(0)}));
  await expect(checkpoints.read(run,true)).rejects.toThrow("planned sample");
});
it("never replaces a committed checkpoint and verifies the completed index itself",async()=>{
  const {visual,id,directory}=await fixture(),completed=await visual.index([id],1);
  const checkpoint=path.join(directory,`visual-run-${completed.runId}`,"0.json"),original=await readFile(checkpoint,"utf8");
  await expect(visual.checkpoints.append(completed.runId,0,{...JSON.parse(original),vector:Array(512).fill(0)})).rejects.toMatchObject({code:"EEXIST"});
  expect(await readFile(checkpoint,"utf8")).toBe(original);
  const output=path.join(directory,`visual-${completed.indexId}.json`),index=JSON.parse(await readFile(output,"utf8"));index.samples[0].vector[0]=0;
  await writeFile(output,JSON.stringify(index));await expect(visual.checkpoints.status(completed.runId)).rejects.toThrow("differs");
  await unlink(output);await expect(visual.checkpoints.status(completed.runId)).rejects.toThrow("does not exist");
});
it("paginates accessible runs across a shared cache while retaining direct scope rejection",async()=>{
  const {config,id,source,directory}=await fixture(),checkpoints=new VisualCheckpoints(config,VISUAL_MODEL,VISUAL_REVISION);
  const outside=path.join(config.outputRoot!,"outside.mp4");await writeFile(outside,"other source");const otherId=await sha256File(outside);
  await writeFile(path.join(directory,`${otherId}.json`),JSON.stringify({id:otherId,file:outside,metadata:{format:{duration:6}},transcript:[]}));
  const allowed=[await checkpoints.create([{id,time:1}]),await checkpoints.create([{id,time:2}])].sort(),blocked=await checkpoints.create([{id:otherId,time:1}]);
  const scoped=new VisualCheckpoints({...config,allowedRoots:[source]},VISUAL_MODEL,VISUAL_REVISION);
  const first=await scoped.list(undefined,1);expect(first.runs.map(run=>run.runId)).toEqual([allowed[0]]);expect(first.nextAfter).toBe(allowed[0]);
  const second=await scoped.list(first.nextAfter!,1);expect(second.runs.map(run=>run.runId)).toEqual([allowed[1]]);expect(second.nextAfter).toBeNull();
  await expect(scoped.status(blocked)).rejects.toMatchObject({code:"INDEXED_SOURCE_UNAVAILABLE"});
  await writeFile(path.join(directory,`visual-run-${allowed[0]}`,"manifest.json"),"broken");await expect(scoped.list()).rejects.toThrow();
});

it("softly penalizes excluded concepts without deleting samples and validates all text before inference",async()=>{
  const {visual,id}=await fixture();
  const v=(a:number,b:number)=>[a,b,...Array(510).fill(0)];
  model.vision.mockResolvedValueOnce({image_embeds:{data:v(1,0)}}).mockResolvedValueOnce({image_embeds:{data:v(0,1)}});
  const index=await visual.index([id],2);
  model.tokenizer.mockImplementation(async(label:string)=>({label,input_ids:{dims:[1,label==='too long'?78:3]}}));
  model.text.mockImplementation(async({label}:{label:string})=>({text_embeds:{data:label==='unwanted'?v(1,0):v(0.8,0.6)}}));
  const baseline=await visual.search(index.indexId,{text:'scene'},2);
  expect(baseline.results.map(s=>s.time)).toEqual([1.5,4.5]);
  const refined=await visual.search(index.indexId,{text:'scene'},2,{}, {exclude:['unwanted','unwanted'],weight:0.5});
  expect(refined.results.map(s=>s.time)).toEqual([4.5,1.5]);expect(refined.matchingSamples).toBe(2);
  expect(refined.results[1]).toMatchObject({similarity:0.8,exclusionSimilarity:1});expect(refined.results[1]!.score).toBeCloseTo(0.3);
  expect(refined.refinement).toEqual({exclude:['unwanted'],weight:0.5});
  expect((await visual.search(index.indexId,{text:'scene'},2,{}, {exclude:['unwanted'],weight:0})).results.map(s=>s.score)).toEqual(baseline.results.map(s=>s.score));
  model.text.mockClear();
  await expect(visual.search(index.indexId,{text:'scene'},2,{}, {exclude:['unwanted','too long']})).rejects.toMatchObject({code:'VISUAL_QUERY_TOO_LONG'});
  expect(model.text).not.toHaveBeenCalled();
  await expect(visual.search(index.indexId,{text:'scene'},2,{}, {exclude:Array(9).fill('x')})).rejects.toThrow();
  await expect(visual.search(index.indexId,{text:'scene'},2,{}, {weight:-1})).rejects.toThrow();
});

it("combines image and text similarities equally before exclusion penalties",async()=>{
  const {visual,id,directory}=await fixture();const v=(a:number,b:number)=>[a,b,...Array(510).fill(0)];
  model.vision.mockResolvedValueOnce({image_embeds:{data:v(1,0)}}).mockResolvedValueOnce({image_embeds:{data:v(0,1)}});
  const index=await visual.index([id],2),image=path.join(directory,'frame-1.5.jpg');
  model.vision.mockResolvedValue({image_embeds:{data:v(1,0)}});
  model.tokenizer.mockImplementation(async(label:string)=>({label,input_ids:{dims:[1,label==='too long'?78:3]}}));
  model.text.mockImplementation(async({label}:{label:string})=>({text_embeds:{data:label==='unwanted'?v(1,0):v(-0.6,0.8)}}));
  const onlyImage=await visual.search(index.indexId,{image},2);
  expect(onlyImage.results[0]!.time).toBe(1.5);
  const combined=await visual.search(index.indexId,{image,text:'scene'},2);
  expect(combined.results.map(s=>s.time)).toEqual([4.5,1.5]);
  expect(combined.results[0]).toMatchObject({imageSimilarity:0,textSimilarity:0.8,similarity:0.4,score:0.4});
  const penalty=await visual.search(index.indexId,{image,text:'scene'},2,{}, {exclude:['unwanted'],weight:0.5});
  expect(penalty.results[1]!.score).toBeCloseTo(-0.3);
  const frame=await visual.searchFrame(index.indexId,id,1.5,2,{}, {},'scene');
  expect(frame.results).toEqual(combined.results);expect(frame.reference.time).toBe(1.5);
  model.vision.mockClear();model.text.mockClear();
  await expect(visual.search(index.indexId,{image,text:'too long'},2)).rejects.toMatchObject({code:'VISUAL_QUERY_TOO_LONG'});
  expect(model.vision).not.toHaveBeenCalled();expect(model.text).not.toHaveBeenCalled();
});

it("rejects invalid frame-search text and scope before creating reference artifacts",async()=>{
  const {visual,id}=await fixture(),index=await visual.index([id],1);
  const artifact=vi.mocked(MediaLibrary.prototype.artifact);artifact.mockClear();
  model.tokenizer.mockResolvedValue({input_ids:{dims:[1,78]}});model.vision.mockClear();
  await expect(visual.searchFrame(index.indexId,id,1,2,{}, {},'overlong fixture')).rejects.toMatchObject({code:'VISUAL_QUERY_TOO_LONG'});
  await expect(visual.searchFrame(index.indexId,id,1,2,{}, {exclude:['overlong fixture']})).rejects.toMatchObject({code:'VISUAL_QUERY_TOO_LONG'});
  await expect(visual.searchFrame(index.indexId,id,1,0)).rejects.toThrow();
  await expect(visual.searchFrame(index.indexId,id,1,2,{range:{start:2,end:1}})).rejects.toThrow();
  await expect(visual.searchFrame(index.indexId,id,-1,2)).rejects.toThrow();
  expect(artifact).not.toHaveBeenCalled();expect(model.text).not.toHaveBeenCalled();expect(model.vision).not.toHaveBeenCalled();
});
