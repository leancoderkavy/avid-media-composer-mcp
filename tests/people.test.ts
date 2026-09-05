import {mkdir,mkdtemp,writeFile,readFile,access} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomUUID,createHash} from "node:crypto";
import {it,expect} from "vitest";
import {People,clusterFaces,peopleSampleTimes} from "../src/library/people.js";
import {FACE_REVISION} from "../src/library/face-runtime.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";
const embedding=(x:number,y:number)=>[x,y,...Array(126).fill(0)];
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-people-")),file=path.join(root,"media.mp4");await writeFile(file,"fixture");
  const id=createHash("sha256").update("fixture").digest("hex"),config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write,export"});
  const library=await new MediaLibrary(config).directory();await writeFile(path.join(library,`${id}.json`),JSON.stringify({id,file,bytes:7,metadata:{format:{duration:10}},transcript:[]}));
  const indexId=randomUUID(),directory=path.join(library,`people-${indexId}`);await mkdir(directory);
  const faces=[embedding(1,0),embedding(0.99,0.01),embedding(0,1)].map((vector,index)=>({faceId:`f0000${index}`,mediaId:id,time:index,box:[0,0,10,10],confidence:0.9,crop:`f0000${index}.jpg`,embedding:vector}));
  for(const face of faces)await writeFile(path.join(directory,face.crop),"crop");
  const record={schema:1,revision:randomUUID(),modelRevision:FACE_REVISION,faces,clusters:clusterFaces(faces,0.8),threshold:0.8};
  await writeFile(path.join(directory,"index.json"),JSON.stringify(record));return {people:new People(config),config,indexId,record,directory,file};
}
it("groups similar features without assigning inferred names",async()=>{
  const {record}=await fixture();expect(record.clusters).toHaveLength(2);expect(record.clusters[0]?.faceIds).toHaveLength(2);expect(record.clusters.every(cluster=>cluster.name===null)).toBe(true);
});
it("plans dense bounded midpoint samples inside a selected source range",()=>{
  const plan=peopleSampleTimes(190,120,{start:60,end:90});expect(plan.times).toHaveLength(120);expect(plan.times[0]).toBe(60.125);expect(plan.times.at(-1)).toBe(89.875);
  expect(()=>peopleSampleTimes(10,121)).toThrow();expect(()=>peopleSampleTimes(10,12,{start:1,end:11})).toThrow();expect(()=>peopleSampleTimes(10,12,{start:2,end:1})).toThrow();
});
it("retains authority for zero-face coverage and rejects faces outside sampled times",async()=>{
  const {config,people,indexId,record,directory}=await fixture(),id=record.faces[0]!.mediaId;
  await writeFile(path.join(directory,"index.json"),JSON.stringify({...record,faces:[],clusters:[],coverage:[{mediaId:id,start:0,end:10,samples:120}]}));
  expect((await people.list(indexId)).coverage?.[0]?.samples).toBe(120);await expect(new People({...config,allowedRoots:[]}).list(indexId)).rejects.toThrow();
  await writeFile(path.join(directory,"index.json"),JSON.stringify({...record,coverage:[{mediaId:id,start:0,end:10,samples:120}]}));await expect(people.list(indexId)).rejects.toThrow("timestamp");
});
it("supports revision-checked name/merge/move/recluster and omits embeddings from reads",async()=>{
  const {people,indexId,record}=await fixture();
  const named=await people.edit(indexId,record.revision,{action:"name",clusterId:record.clusters[0]!.clusterId,name:"Review group"});
  expect((await people.list(indexId)).clusters[0]?.name).toBe("Review group");
  await expect(people.edit(indexId,record.revision,{action:"recluster",threshold:0.9})).rejects.toThrow("changed");
  const merged=await people.edit(indexId,named.revision,{action:"merge",from:record.clusters[1]!.clusterId,into:record.clusters[0]!.clusterId});expect(merged.clusters).toBe(1);
  const moved=await people.edit(indexId,merged.revision,{action:"move",faceId:"f00002",into:null});expect(moved.clusters).toBe(2);
  const reclustered=await people.edit(indexId,moved.revision,{action:"recluster",threshold:0.8});expect(reclustered.namesReset).toBe(true);
  const page=await people.faces(indexId,undefined,-1,1);expect(page.faces).toHaveLength(1);expect(page.nextAfter).toBe(0);expect(page.faces[0]).not.toHaveProperty("embedding");
});
it("deletes face embeddings/crops and the whole index without deleting source media",async()=>{
  const {people,indexId,record,directory,file}=await fixture();
  const removed=await people.edit(indexId,record.revision,{action:"remove_face",faceId:"f00000"});expect(removed.faces).toBe(2);
  await expect(access(path.join(directory,"f00000.jpg"))).rejects.toThrow();expect((await readFile(path.join(directory,"index.json"),"utf8")).includes('f00000')).toBe(false);
  expect((await people.remove(indexId,removed.revision)).deleted).toBe(true);expect(await readFile(file,"utf8")).toBe("fixture");await expect(access(path.join(directory,"index.json"))).rejects.toThrow();
});
it("rejects out-of-scope reads and removal of unexpected files",async()=>{
  const {people,config,indexId,record,directory}=await fixture();await expect(new People({...config,allowedRoots:[]}).list(indexId)).rejects.toThrow("outside");
  await writeFile(path.join(directory,"unrelated.txt"),"preserve");await expect(people.remove(indexId,record.revision)).rejects.toThrow("Unexpected");expect(await readFile(path.join(directory,"unrelated.txt"),"utf8")).toBe("preserve");
});
