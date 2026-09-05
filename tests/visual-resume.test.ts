import {mkdtemp,writeFile,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect,vi,afterEach} from "vitest";
import {VisualSearch,VISUAL_MODEL,VISUAL_REVISION} from "../src/library/visual.js";
import {VisualCheckpoints} from "../src/library/visual-checkpoints.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {loadConfig} from "../src/config.js";
const model=vi.hoisted(()=>({vision:vi.fn()}));
vi.mock("../src/library/model-runtime.js",()=>({modelRuntime:async()=>({AutoTokenizer:{from_pretrained:async()=>{}},AutoProcessor:{from_pretrained:async()=>async(image:unknown)=>image},CLIPTextModelWithProjection:{from_pretrained:async()=>({dispose:async()=>{}})},CLIPVisionModelWithProjection:{from_pretrained:async()=>Object.assign(model.vision,{dispose:async()=>{}})},RawImage:{read:async(image:unknown)=>image}})}));
afterEach(()=>{vi.restoreAllMocks();model.vision.mockReset();});
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
it("rejects changed source, image, model revision and narrowed roots",async()=>{
  const {config,id,visual,directory,source}=await fixture();model.vision.mockResolvedValueOnce({image_embeds:{data:Array(512).fill(0.5)}}).mockRejectedValueOnce(new Error("stop"));await expect(visual.index([id],3)).rejects.toThrow();
  const run=(await visual.checkpoints.list()).runs[0]!.runId;
  await expect(new VisualSearch({...config,allowedRoots:[]}).resume(run)).rejects.toThrow();
  await expect(new VisualCheckpoints(config,VISUAL_MODEL,"different").read(run,true)).rejects.toThrow("revision");
  await writeFile(path.join(directory,"frame-1.jpg"),"changed");await expect(visual.resume(run)).rejects.toThrow("image changed");
  await writeFile(path.join(directory,"frame-1.jpg"),"1");await writeFile(source,"changed");await expect(visual.resume(run)).rejects.toThrow("source changed");
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
