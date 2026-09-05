import {mkdtemp,writeFile,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
import {People,PeopleRuns} from "../src/library/people.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {FACE_MODELS,FACE_REVISION} from "../src/library/face-runtime.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {loadConfig} from "../src/config.js";
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"people-runs-")),source=path.join(root,"source.mp4");await writeFile(source,"source");const id=await sha256File(source),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export,project-write"}),library=new MediaLibrary(config),directory=await library.directory();
  await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file:source,metadata:{format:{duration:2}},transcript:[]}));const runs=new PeopleRuns(config),coverage=[{mediaId:id,start:0,end:2,samples:2}],created=await runs.create({coverage,threshold:0.45});
  const face={faceId:"f00000",mediaId:id,time:0.5,box:[0,0,10,10],confidence:0.9,crop:"f00000.jpg",embedding:[1,...Array(127).fill(0)]};await writeFile(path.join(created.directory,face.crop),"crop");
  for(let i=0;i<2;i++){
    const image=path.join(created.directory,`frame-${i}.jpg`);await writeFile(image,`image-${i}`);const frameSha256=await sha256File(image);await runs.extracted(created.indexId,i,frameSha256);
    await writeFile(path.join(created.directory,`faces-${i}.json`),JSON.stringify({schema:1,input:{position:i,mediaId:id,time:i+0.5,frameSha256,models:Object.fromEntries(FACE_MODELS.map(model=>[model.name,model.sha256])),opencv:"4.12.0"},faces:i?[]:[face],cropHashes:i?{}:{[face.crop]:await sha256File(path.join(created.directory,face.crop))}}));
  }
  const record={schema:1,revision:randomUUID(),modelRevision:FACE_REVISION,faces:[face],clusters:[{clusterId:randomUUID(),name:null,faceIds:[face.faceId]}],threshold:0.45,coverage};
  return {root,source,id,config,runs,coverage,...created,record};
}
it("copies verified extracted and analyzed prefixes without changing the parent",async()=>{
  const {runs,indexId,directory,coverage}=await fixture(),saved=await runs.read(indexId),before=await readFile(path.join(directory,"faces-0.json"),"utf8"),child=await runs.create({coverage,threshold:0.45,parentIndexId:indexId});
  await runs.copyPrefix(saved,child.indexId);expect(await runs.status(child.indexId)).toMatchObject({parentIndexId:indexId,extractedFrames:2,analyzedFrames:2,faces:1,state:"partial"});expect(await readFile(path.join(directory,"faces-0.json"),"utf8")).toBe(before);
  await expect(runs.extracted(indexId,0,saved.extracted[0]!.sha256)).rejects.toMatchObject({code:"EEXIST"});
});
it("verifies original completion and refuses replay, edits and missing checkpoints",async()=>{
  const {config,runs,indexId,directory,record}=await fixture(),file=path.join(directory,"index.json");await writeFile(file,JSON.stringify(record));await runs.finish(indexId);expect(await runs.status(indexId)).toMatchObject({state:"completed"});await expect(new People(config).resume(indexId)).rejects.toThrow("completed");
  await writeFile(file,JSON.stringify({...record,revision:randomUUID()}));await expect(runs.status(indexId)).rejects.toThrow("index changed");await writeFile(file,JSON.stringify(record));await unlink(path.join(directory,"faces-1.json"));await expect(runs.status(indexId)).rejects.toThrow("missing checkpoints");
},20_000); // Multiple checksum-backed filesystem passes on shared Windows CI.
it("rejects changed crops, models, sources and authority",async()=>{
  const {config,runs,indexId,directory,source}=await fixture(),crop=path.join(directory,"f00000.jpg");await writeFile(crop,"changed");await expect(runs.read(indexId)).rejects.toThrow("crop changed");await writeFile(crop,"crop");
  const file=path.join(directory,"faces-0.json"),original=await readFile(file,"utf8"),record=JSON.parse(original);record.input.models[FACE_MODELS[0]!.name]="0".repeat(64);await writeFile(file,JSON.stringify(record));await expect(runs.read(indexId)).rejects.toThrow("input changed");await writeFile(file,original);
  await expect(new PeopleRuns({...config,allowedRoots:[]}).read(indexId)).rejects.toThrow();await writeFile(source,"changed");await expect(runs.read(indexId)).rejects.toThrow("source changed");
});
it("refuses a source frame altered between validation and copying",async()=>{
  const {runs,indexId,coverage}=await fixture(),saved=await runs.read(indexId),child=await runs.create({coverage,threshold:0.45,parentIndexId:indexId});await writeFile(saved.extracted[0]!.file,"changed");await expect(runs.copyPrefix(saved,child.indexId)).rejects.toThrow("during checkpoint copy");
});
it("removes derived analysis checkpoints when a face is deleted",async()=>{
  const {config,runs,indexId,directory,record}=await fixture();await writeFile(path.join(directory,"index.json"),JSON.stringify(record));await runs.finish(indexId);
  const removed=await new People(config).edit(indexId,record.revision,{action:"remove_face",faceId:"f00000"});expect(removed.analysisCheckpointsRemoved).toBe(2);
  await expect(readFile(path.join(directory,"faces-0.json"))).rejects.toMatchObject({code:"ENOENT"});await expect(readFile(path.join(directory,"f00000.jpg"))).rejects.toMatchObject({code:"ENOENT"});
  expect(await readFile(path.join(directory,"frame-0.jpg"),"utf8")).toBe("image-0");await expect(runs.status(indexId)).rejects.toThrow("missing checkpoints");
});
