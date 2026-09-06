import {mkdtemp,writeFile,readFile,readdir,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {describe,it,expect} from "vitest";
import {loadConfig} from "../src/config.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {ProjectSnapshots,publishSnapshot} from "../src/library/project-snapshots.js";

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-snapshot-")),file=path.join(root,"fixture.avb");await writeFile(file,"fixture");
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root});
  const directory=await new MediaLibrary(config).directory();
  const record={revision:randomUUID(),createdAt:"baseline",bins:[{schema:1,file,sha256:"a".repeat(64),complete:true,nodeCount:1,stateOrigin:"saved-bin",warnings:[],mobs:[{mobId:"sequence",name:"Cut",mobType:"CompositionMob",usageCode:0,rate:30,duration:60,sourceBounds:{start:0,end:60},tracks:[{ordinal:0,index:1,mediaKind:"picture",nodes:[{kind:"SCLP",timelineStart:0,timelineEnd:60,sourceMobId:"source",sourceTrackId:1,sourceStart:90}]}]}]}]};
  const save=async()=>{await writeFile(path.join(directory,`snapshot-${record.revision}.json`),JSON.stringify(record));return record.revision;};
  return {config,record,save,snapshots:new ProjectSnapshots(config)};
}
describe("saved semantic snapshots",()=>{
  it("verifies captured trims with scoped bin selection and rejects partial-track expectations",async()=>{
    const {record,save,snapshots,config}=await fixture(),bin=record.bins[0]!,sequence=bin.mobs[0]!;
    const first=sequence.tracks[0]!.nodes[0]!;first.timelineEnd=30;
    sequence.tracks[0]!.nodes.push({...first,timelineStart:30,timelineEnd:60,sourceStart:120});
    bin.mobs.push({...structuredClone(sequence),mobId:"source",duration:1000,sourceBounds:{start:0,end:1000},tracks:[{...sequence.tracks[0]!,nodes:[{...first,timelineStart:0,timelineEnd:1000}]}]});
    const baseline=await save();record.revision=randomUUID();first.timelineEnd=31;sequence.tracks[0]!.nodes[1]!.timelineStart=31;sequence.tracks[0]!.nodes[1]!.sourceStart=121;
    const candidate=await save();expect((await snapshots.verifyTrim(baseline,candidate,bin.file,bin.file,"sequence",30,1,[0])).verified).toBe(true);
    await expect(snapshots.verifyTrim(baseline,candidate,bin.file,bin.file,"sequence",30,-1,[0])).rejects.toThrow("exact requested trim");
    await expect(new ProjectSnapshots({...config,allowedRoots:[]}).verifyTrim(baseline,candidate,bin.file,bin.file,"sequence",30,1,[0])).rejects.toThrow("outside");
    await expect(snapshots.verifyTrim(baseline,candidate,"missing.avb",bin.file,"sequence",30,1,[0])).rejects.toThrow();
  });
  it("identifies deleted bins while preserving authorized historical mob discovery",async()=>{
    const {record,save,snapshots,config}=await fixture(),revision=await save();
    expect((await snapshots.mobs(revision)).mobs[0]!.binPresent).toBe(true);
    await unlink(record.bins[0]!.file);
    expect((await snapshots.list()).snapshots[0]!.missingBins).toBe(1);
    expect((await snapshots.mobs(revision)).mobs[0]!.binPresent).toBe(false);
    expect((await snapshots.range(revision,'sequence',0,30)).results).toHaveLength(1);
    await expect(new ProjectSnapshots({...config,allowedRoots:[]}).mobs(revision)).rejects.toThrow('outside');
  });
  it("pages mob identities needed to query recovered snapshots",async()=>{
    const {record,save,snapshots,config}=await fixture(),template=record.bins[0]!.mobs[0]!;
    record.bins[0]!.mobs=Array.from({length:102},(_,i)=>({...template,mobId:`mob-${i}`}));
    const revision=await save(),first=await snapshots.mobs(revision);
    expect(first.mobs).toHaveLength(100);expect(first.nextAfter).toBe(99);expect(first.totalMobs).toBe(102);
    const last=await snapshots.mobs(revision,first.nextAfter!);expect(last.mobs.map(mob=>mob.mobId)).toEqual(['mob-100','mob-101']);expect(last.nextAfter).toBeNull();
    await expect(new ProjectSnapshots({...config,allowedRoots:[]}).mobs(revision)).rejects.toThrow('outside');
  });
  it("allows exactly one concurrent publisher per revision without mixing bytes",async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'avid-snapshot-race-')),file=path.join(directory,'snapshot.json');
    const contents=['first '.repeat(10000),'second '.repeat(10000)];
    const outcomes=await Promise.allSettled(contents.map(content=>publishSnapshot(file,content)));
    expect(outcomes.filter(outcome=>outcome.status==='fulfilled')).toHaveLength(1);
    const winner=outcomes.findIndex(outcome=>outcome.status==='fulfilled');
    expect(await readFile(file,'utf8')).toBe(contents[winner]);
    expect(await readdir(directory)).toEqual(['snapshot.json']);
  });
  it("ignores abandoned temporary writes when discovering completed revisions",async()=>{
    const {config,save,snapshots}=await fixture(),revision=await save(),directory=await new MediaLibrary(config).directory();
    await writeFile(path.join(directory,`snapshot-${randomUUID()}.json.${randomUUID()}.tmp`),'{unfinished');
    const result=await snapshots.list();
    expect(result.snapshots.map(snapshot=>snapshot.revision)).toEqual([revision]);
    expect(result.scanned).toBe(1);expect(result.unavailable).toBe(0);
  });
  it("publishes complete snapshot bytes exclusively and cleans temporary attempts",async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'avid-snapshot-publish-')),file=path.join(directory,'snapshot.json');
    await publishSnapshot(file,'{"complete":true}');
    await expect(publishSnapshot(file,'replacement')).rejects.toThrow();
    expect(await readFile(file,'utf8')).toBe('{"complete":true}');
    expect(await readdir(directory)).toEqual(['snapshot.json']);
    await expect(publishSnapshot(path.join(directory,'oversized.json'),'x'.repeat(32*1024*1024+1))).rejects.toThrow('size limit');
    expect(await readdir(directory)).toEqual(['snapshot.json']);
  });
  it("discovers revisions after reconnect and hides snapshots outside current roots",async()=>{
    const {config,record,save,snapshots}=await fixture();const revision=await save();
    const discovered=await new ProjectSnapshots(config).list();
    expect(discovered.snapshots[0]).toMatchObject({revision,bins:1,mobs:1});expect(discovered.nextAfter).toBeNull();
    const restricted=await new ProjectSnapshots({...config,allowedRoots:[]}).list();
    expect(restricted.snapshots).toEqual([]);expect(restricted.unavailable).toBe(1);
    Object.assign(record,{bins:'damaged'});await save();
    expect((await snapshots.list()).unavailable).toBe(1);
    await expect(snapshots.list(undefined,51)).rejects.toThrow('page');
  });
  it("retains baseline and candidate omissions even when visible fields have no differences",async()=>{
    const {record,save,snapshots}=await fixture(),baseline=await save();
    record.revision=randomUUID();Object.assign(record.bins[0]!,{complete:false,warnings:[{code:'UNRESOLVED_SEQUENCE_OFFSETS'}]});
    const result=await snapshots.diff(baseline,await save());
    expect(result.changes).toEqual([]);expect(result.complete).toBe(false);
    expect(result.coverage.baseline[0]!.complete).toBe(true);
    expect(result.coverage.candidate[0]!.warnings[0]).toEqual({code:'UNRESOLVED_SEQUENCE_OFFSETS'});
  });
  it("explains incomplete zero-match source usage with bounded per-bin warnings",async()=>{
    const {record,save,snapshots}=await fixture();
    Object.assign(record.bins[0]!,{complete:false,warnings:Array.from({length:12},()=>({code:'MIXED_EDIT_RATE',mobRate:30,componentRate:24}))});
    const result=await snapshots.usage(await save(),'missing');
    expect(result.usages).toEqual([]);expect(result.complete).toBe(false);
    expect(result.coverage[0]).toMatchObject({complete:false,warningCount:12,warningsTruncated:true});
    expect(result.coverage[0]!.warnings).toHaveLength(10);
  });
  it("continues filtered timeline pages using global node indices across tracks",async()=>{
    const {record,save,snapshots}=await fixture(),mob=record.bins[0]!.mobs[0]!,first=mob.tracks[0]!;
    first.nodes=Array.from({length:205},()=>({...first.nodes[0]!}));
    mob.tracks.push({...first,ordinal:1,nodes:Array.from({length:203},()=>({...first.nodes[0]!}))});
    const revision=await save(),page=await snapshots.range(revision,'sequence',10,20,1,-1,200);
    expect(page.results).toHaveLength(200);expect(page.results[0]!.index).toBe(205);expect(page.nextAfter).toBe(404);
    const last=await snapshots.range(revision,'sequence',10,20,1,page.nextAfter!,200);
    expect(last.results.map(node=>node.index)).toEqual([405,406,407]);expect(last.nextAfter).toBeNull();
    expect(last.results[0]).toMatchObject({overlapSourceStart:100,overlapSourceEnd:110});
    await expect(snapshots.range(revision,'sequence',0,10,undefined,-1,201)).rejects.toThrow('page');
    await expect(snapshots.range(revision,'sequence',0,10,-1)).rejects.toThrow('page');
  });
  it("refuses duplicate comparison identities instead of silently overwriting mobs",async()=>{
    const {record,save,snapshots}=await fixture(),baseline=await save();
    record.revision=randomUUID();record.bins[0]!.mobs.push({...record.bins[0]!.mobs[0]!,name:'Conflicting'});
    await expect(snapshots.diff(baseline,await save())).rejects.toThrow('Duplicate mob identity');
    record.bins[0]!.mobs.pop();record.bins.push({...record.bins[0]!,mobs:[]});
    await expect(snapshots.diff(baseline,await save())).rejects.toThrow('Duplicate bin identity');
  });
  it("retrieves snapshot changes beyond 200 without repeating or losing changes",async()=>{
    const {record,save,snapshots}=await fixture(),template=record.bins[0]!.mobs[0]!;
    record.bins[0]!.mobs=Array.from({length:203},(_,i)=>({...template,mobId:`mob-${i}`}));
    const baseline=await save();record.revision=randomUUID();
    for(const mob of record.bins[0]!.mobs)mob.name='Renamed';
    const candidate=await save(),first=await snapshots.diff(baseline,candidate);
    expect(first.changes).toHaveLength(200);expect(first.totalChanges).toBe(203);expect(first.nextAfter).toBe(199);
    const last=await snapshots.diff(baseline,candidate,first.nextAfter!);
    expect(last.changes.map(change=>change.index)).toEqual([200,201,202]);expect(last.nextAfter).toBeNull();
    expect((await snapshots.diff(baseline,candidate,999)).changes).toEqual([]);
    await expect(snapshots.diff(baseline,candidate,-2)).rejects.toThrow('page');
  });
  it("retrieves every source reference beyond the original 500-row limit",async()=>{
    const {record,save,snapshots}=await fixture(),track=record.bins[0]!.mobs[0]!.tracks[0]!;
    track.nodes=Array.from({length:503},()=>({...track.nodes[0]!}));
    const revision=await save(),first=await snapshots.usage(revision,"source");
    expect(first.usages).toHaveLength(500);expect(first.totalReferences).toBe(503);expect(first.nextAfter).toBe(499);
    const last=await snapshots.usage(revision,"source",first.nextAfter!);
    expect(last.usages.map(row=>row.index)).toEqual([500,501,502]);expect(last.nextAfter).toBeNull();expect(last.truncated).toBe(false);
    expect((await snapshots.usage(revision,"absent")).usages).toEqual([]);
    await expect(snapshots.usage(revision,"source",-2)).rejects.toThrow("page");
  });
  it("rejects inconsistent saved bounds and ambiguous track identities before reporting",async()=>{
    const {record,save,snapshots}=await fixture(),mob=record.bins[0]!.mobs[0]!;
    mob.sourceBounds.end=61;
    await expect(snapshots.complexity(await save(),"sequence")).rejects.toThrow("bounds disagree");
    mob.sourceBounds.end=60;mob.tracks[0]!.nodes[0]!.timelineEnd=61;
    await expect(snapshots.complexity(await save(),"sequence")).rejects.toThrow("node range");
    mob.tracks[0]!.nodes[0]!.timelineEnd=60;mob.tracks.push({...mob.tracks[0]!});
    await expect(snapshots.complexity(await save(),"sequence")).rejects.toThrow("ordinals are duplicated");
  });
  it("reports direct structural counts and preserves opaque completeness limits",async()=>{
    const {record,save,snapshots}=await fixture();
    const track=record.bins[0]!.mobs[0]!.tracks[0]!;
    track.nodes.push({...track.nodes[0]!,kind:"EFFECT",...{opaque:true}});
    const report=await snapshots.complexity(await save(),"sequence");
    expect(report).toMatchObject({trackCount:1,nodes:2,sourceReferences:2,distinctSourceMobs:1,opaqueNodes:1,complete:false,durationSeconds:2});
    expect(report.tracks[0]!.kinds).toEqual({SCLP:1,EFFECT:1});
    await expect(snapshots.complexity(record.revision,"missing")).rejects.toThrow("one matching mob");
  });
  it("retains stereo channel identity through range paging, usage and semantic diff",async()=>{
    const {record,save,snapshots}=await fixture();const track=record.bins[0]!.mobs[0]!.tracks[0]!;
    track.mediaKind="sound";
    Object.assign(track.nodes[0]!,{channelCombiner:{channelIndex:1,channelCount:2}});
    track.nodes.push({...track.nodes[0]!,sourceTrackId:2,...{channelCombiner:{channelIndex:2,channelCount:2}}});
    const baseline=await save();
    const first=await snapshots.range(baseline,"sequence",15,30,0,-1,1);
    expect(first.results[0]).toMatchObject({channelCombiner:{channelIndex:1,channelCount:2},overlapSourceStart:105,overlapSourceEnd:120});
    const second=await snapshots.range(baseline,"sequence",15,30,0,first.nextAfter!,1);
    expect(second.results[0]).toMatchObject({channelCombiner:{channelIndex:2,channelCount:2},sourceTrackId:2});
    expect((await snapshots.usage(baseline,"source")).usages.map(item=>item.channelCombiner?.channelIndex)).toEqual([1,2]);
    record.revision=randomUUID();Object.assign(track.nodes[1]!,{channelCombiner:{channelIndex:1,channelCount:2}});
    expect((await snapshots.diff(baseline,await save())).changes[0]?.change).toBe("changed");
  });
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
    await expect(new ProjectSnapshots({...config,allowedRoots:[]}).complexity(first,"sequence")).rejects.toThrow("outside");
    record.bins.push(record.bins[0]!);record.revision=randomUUID();
    await expect(snapshots.range(await save(),"sequence",0,10)).rejects.toThrow("one matching mob");
    await expect(snapshots.complexity(record.revision,"sequence")).rejects.toThrow("one matching mob");
  });
});

it("separates parsed completeness from unresolved and ambiguous saved-bin references",async()=>{
 const {record,save,snapshots}=await fixture();let revision=await save();
 expect(await snapshots.range(revision,"sequence",0,30)).toMatchObject({complete:true,sourceReferenceCoverage:{references:1,allReferencesResolve:false,unresolvedCount:1,unresolvedIds:["source"]}});
 const source={...record.bins[0]!.mobs[0]!,mobId:"source",name:"Source",tracks:[]};record.bins[0]!.mobs.push(source);revision=await save();
 expect(await snapshots.range(revision,"sequence",0,30)).toMatchObject({sourceReferenceCoverage:{allReferencesResolve:true,resolvedSourceIds:1}});
 record.bins[0]!.mobs.push({...source});revision=await save();
 expect(await snapshots.range(revision,"sequence",0,30)).toMatchObject({sourceReferenceCoverage:{allReferencesResolve:false,ambiguousCount:1,ambiguousIds:["source"]}});
});

it("distinguishes cross-bin matches from missing and repeated source identities",async()=>{
 const {record,save,snapshots}=await fixture();const first=record.bins[0]!,otherFile=path.join(path.dirname(first.file),"sources.avb");await writeFile(otherFile,"sources");
 const source={...first.mobs[0]!,mobId:"source",name:"Source",tracks:[]};record.bins.push({...first,file:otherFile,mobs:[source]});let revision=await save();
 expect(await snapshots.range(revision,"sequence",0,30)).toMatchObject({sourceReferenceCoverage:{allReferencesResolve:false},snapshotSourceReferenceCoverage:{allReferencesResolve:true,resolvedSourceIds:1}});
 first.mobs.push({...source});revision=await save();
 expect(await snapshots.range(revision,"sequence",0,30)).toMatchObject({sourceReferenceCoverage:{allReferencesResolve:true},snapshotSourceReferenceCoverage:{allReferencesResolve:false,ambiguousCount:1}});
});

it("pages all source identities beyond coverage samples without omission",async()=>{
 const {record,save,snapshots}=await fixture(),track=record.bins[0]!.mobs[0]!.tracks[0]!;
 track.nodes=Array.from({length:23},(_,i)=>({...track.nodes[0]!,sourceMobId:`source-${String(i).padStart(2,"0")}`}));
 const revision=await save(),first=await snapshots.sourceResolution(revision,-1,10),second=await snapshots.sourceResolution(revision,first.nextAfter!,10),last=await snapshots.sourceResolution(revision,second.nextAfter!,10);
 expect([...first.sources,...second.sources,...last.sources].map(row=>row.sourceMobId)).toEqual(track.nodes.map(node=>node.sourceMobId));expect(last.nextAfter).toBeNull();expect(first.totalSourceIds).toBe(23);expect(first.sources[0]).toMatchObject({status:"unresolved",candidateCount:0,references:1});
 await expect(snapshots.sourceResolution(revision,-2)).rejects.toThrow();await expect(snapshots.sourceResolution(revision,-1,201)).rejects.toThrow();
});

it("queries repeated MOB IDs in a chosen historical bin without recapturing",async()=>{
 const {record,save,snapshots}=await fixture(),first=record.bins[0]!,file=path.join(path.dirname(first.file),"copy.avb");await writeFile(file,"copy");
 record.bins.push({...first,file,mobs:[{...first.mobs[0]!,name:"Copy",tracks:[]}]});const revision=await save();
 await expect(snapshots.range(revision,"sequence",0,30)).rejects.toThrow("bin path");await expect(snapshots.complexity(revision,"sequence")).rejects.toThrow("bin path");
 expect(await snapshots.range(revision,"sequence",0,30,undefined,-1,100,first.file)).toMatchObject({bin:first.file,results:[{sourceMobId:"source"}]});
 expect(await snapshots.range(revision,"sequence",0,30,undefined,-1,100,file)).toMatchObject({bin:file,results:[]});
 await unlink(file);expect(await snapshots.complexity(revision,"sequence",file)).toMatchObject({name:"Copy",trackCount:0});
 await expect(snapshots.complexity(revision,"sequence","copy.avb")).rejects.toThrow("absolute");await expect(snapshots.complexity(revision,"sequence",path.join(os.tmpdir(),"absent.avb"))).rejects.toThrow("matching bin");
});
