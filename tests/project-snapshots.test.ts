import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {describe,it,expect} from "vitest";
import {loadConfig} from "../src/config.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {ProjectSnapshots} from "../src/library/project-snapshots.js";

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-snapshot-")),file=path.join(root,"fixture.avb");await writeFile(file,"fixture");
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root});
  const directory=await new MediaLibrary(config).directory();
  const record={revision:randomUUID(),createdAt:"baseline",bins:[{schema:1,file,sha256:"a".repeat(64),complete:true,nodeCount:1,stateOrigin:"saved-bin",warnings:[],mobs:[{mobId:"sequence",name:"Cut",mobType:"CompositionMob",usageCode:0,rate:30,duration:60,sourceBounds:{start:0,end:60},tracks:[{ordinal:0,index:1,mediaKind:"picture",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:60,sourceMobId:"source",sourceTrackId:1,sourceStart:90}]}]}]}]};
  const save=async()=>{await writeFile(path.join(directory,`snapshot-${record.revision}.json`),JSON.stringify(record));return record.revision;};
  return {config,record,save,snapshots:new ProjectSnapshots(config)};
}
describe("saved semantic snapshots",()=>{
  it("maps overlap source ranges and compares semantics independently of save metadata",async()=>{
    const {record,save,snapshots}=await fixture();const baseline=await save();
    expect((await snapshots.range(baseline,"sequence",15,30)).results[0]).toMatchObject({overlapSourceStart:105,overlapSourceEnd:120,mediaKind:"picture"});
    expect((await snapshots.usage(baseline,"source")).usages).toHaveLength(1);
    record.revision=randomUUID();record.createdAt="later";record.bins[0]!.sha256="b".repeat(64);const same=await save();
    expect((await snapshots.diff(baseline,same)).changes).toEqual([]);
    record.revision=randomUUID();record.bins[0]!.mobs[0]!.tracks[0]!.nodes[0]!.sourceStart=100;
    expect((await snapshots.diff(baseline,await save())).changes[0]?.change).toBe("changed");
  });
  it("rechecks source roots and rejects duplicate mob ambiguity",async()=>{
    const {config,record,save,snapshots}=await fixture();const first=await save();
    await expect(new ProjectSnapshots({...config,allowedRoots:[]}).range(first,"sequence",0,10)).rejects.toThrow("outside");
    record.bins.push(record.bins[0]!);record.revision=randomUUID();
    await expect(snapshots.range(await save(),"sequence",0,10)).rejects.toThrow("one matching mob");
  });
});
