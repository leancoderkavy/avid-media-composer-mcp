import {mkdtemp,mkdir,writeFile,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {it,expect,vi} from "vitest";
import {CaptionBatches} from "../src/library/caption-batches.js";
import {FrameCaptions,CAPTION_MODEL,CAPTION_REVISION,CAPTION_TASK} from "../src/library/captions.js";
import {loadConfig} from "../src/config.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {sha256File} from "../src/analysis/file-inventory.js";
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-caption-")),source=path.join(root,"source.mp4");await writeFile(source,"source");const id=await sha256File(source),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export,project-write"}),base=await new MediaLibrary(config).directory();await writeFile(path.join(base,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:10},streams:[{codec_type:"video"}]},transcript:[]}));const captionId=randomUUID(),directory=path.join(base,`caption-${captionId}`);await mkdir(directory);const image=path.join(directory,"frame.jpg");await writeFile(image,"image");const record={schema:1,captionId,revision:randomUUID(),id,time:2,imageSha256:await sha256File(image),model:CAPTION_MODEL,modelRevision:CAPTION_REVISION,task:CAPTION_TASK,runtime:"4.2.0",dtype:"q4",machineText:"Original machine description",text:"Original machine description",edited:false,mayBeTruncated:false,createdAt:new Date().toISOString()};await writeFile(path.join(directory,"caption.json"),JSON.stringify(record));return {config,id,source,captionId,directory,image,captions:new FrameCaptions(config)};}
it("corrects with checksum checking while retaining original machine text, then removes only caption artifacts",async()=>{const f=await fixture(),original=await f.captions.read(f.captionId);const corrected=await f.captions.correct(f.captionId,original.sha256,"Corrected description");expect(corrected).toMatchObject({text:"Corrected description",machineText:original.machineText,edited:true,reviewRequired:true});expect(corrected.revision).not.toBe(original.revision);await expect(f.captions.correct(f.captionId,original.sha256,"stale")).rejects.toThrow("changed");expect((await f.captions.list(f.id)).captions).toHaveLength(1);await f.captions.remove(f.captionId,corrected.sha256);expect(await sha256File(f.source)).toBe(f.id);expect((await f.captions.list(f.id)).captions).toEqual([]);});
it("rejects changed images and unauthorized sources, but lists image damage as unavailable",async()=>{const f=await fixture();await expect(new FrameCaptions({...f.config,allowedRoots:[]}).read(f.captionId)).rejects.toThrow();await writeFile(f.image,"changed");await expect(f.captions.read(f.captionId)).rejects.toThrow("image changed");expect((await f.captions.list(f.id)).captions[0]).toMatchObject({state:"unavailable"});await writeFile(f.source,"changed");await expect(f.captions.list(f.id)).rejects.toThrow(/[Ss]ource changed/);});
it("preserves unexpected files and rejects write operations without capability",async()=>{const f=await fixture(),record=await f.captions.read(f.captionId),extra=path.join(f.directory,"notes.txt");await writeFile(extra,"preserve");await expect(f.captions.remove(f.captionId,record.sha256)).rejects.toThrow("Unexpected");expect(await readFile(extra,"utf8")).toBe("preserve");await expect(new FrameCaptions({...f.config,capabilities:new Set(["inspect"])}).correct(f.captionId,record.sha256,"change")).rejects.toThrow();await unlink(extra);});

it("resumes verified caption checkpoints without changing parent files and rejects edited references",async()=>{
  const f=await fixture(),batches=new CaptionBatches(f.config,f.captions),original=await f.captions.read(f.captionId);
  const generate=vi.spyOn(f.captions,"generate").mockResolvedValueOnce(original).mockRejectedValueOnce(new Error("interrupted"));
  await expect(batches.generate(f.id,[2,3])).rejects.toThrow("interrupted");
  const runs=await batches.list(f.id),runId=runs.runs[0]!.runId;
  expect(await batches.status(runId)).toMatchObject({state:"partial",completedCaptions:1});
  const base=await new MediaLibrary(f.config).directory(),parent=path.join(base,`caption-run-${runId}`),before=await readFile(path.join(parent,"0.json"),"utf8");
  generate.mockImplementationOnce(async(id,time)=>{const captionId=randomUUID(),directory=path.join(base,`caption-${captionId}`);await mkdir(directory);await writeFile(path.join(directory,"frame.jpg"),"image");const record=JSON.parse(await readFile(path.join(f.directory,"caption.json"),"utf8"));await writeFile(path.join(directory,"caption.json"),JSON.stringify({...record,captionId,time}));return f.captions.read(captionId);});
  const resumed=await batches.resume(runId);
  expect(resumed).toMatchObject({state:"completed",completedCaptions:2,reusedCaptions:1,parentRunId:runId});
  expect(generate).toHaveBeenCalledTimes(3);
  expect(await readFile(path.join(parent,"0.json"),"utf8")).toBe(before);
  await expect(batches.resume(resumed.runId)).rejects.toThrow("already completed");
  await f.captions.correct(f.captionId,original.sha256,"reviewed");
  await expect(batches.status(resumed.runId)).rejects.toThrow("changed");
  expect(await sha256File(f.source)).toBe(f.id);
},20_000); // Multiple checksum-backed filesystem passes on shared Windows CI.
it("rejects invalid caption batch plans and unauthorized or changed sources",async()=>{
  const f=await fixture(),batches=new CaptionBatches(f.config,f.captions);
  await expect(batches.generate(f.id,[2,2])).rejects.toThrow();
  await expect(batches.generate(f.id,[10])).rejects.toThrow("duration");
  await expect(new CaptionBatches({...f.config,capabilities:new Set(["inspect"])}).generate(f.id,[2])).rejects.toThrow();
  await writeFile(f.source,"changed");await expect(batches.generate(f.id,[2])).rejects.toThrow("changed");
});
