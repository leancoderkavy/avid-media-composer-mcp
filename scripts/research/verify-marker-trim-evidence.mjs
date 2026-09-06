import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifySavedDualRollerTrim} from '../../dist/native/trim-verifier.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=process.argv[2];assert.ok(root&&path.isAbsolute(root)&&process.argv.length===3);
const fixture=JSON.parse(await readFile(path.join(root,'fixture.json'),'utf8'));
const graphs={},captures={};
for(const stage of ['loaded','trimmed','restored']){
 graphs[stage]=JSON.parse(await readFile(path.join(root,stage+'.json'),'utf8'));
 captures[stage]=JSON.parse(await readFile(path.join(root,stage+'-capture.json'),'utf8'));
 assert.equal(await sha256File(path.join(root,stage+'.avb')),graphs[stage].sha256);
 assert.equal(graphs[stage].sha256,captures[stage].sha256);
 assert.deepEqual(captures[stage].markers,fixture.persisted);
}
assert.equal(graphs.loaded.sha256,fixture.baselineSha256);
const canonical=id=>id.replace(/^urn:smpte:umid:/,'').replaceAll('.','').replaceAll('-','');
const targets=Object.fromEntries(Object.entries(graphs).map(([stage,graph])=>[stage,graph.mobs.find(mob=>canonical(mob.mobId)===canonical(fixture.mobId))]));
const plan={mobId:targets.loaded.mobId,cut:60,delta:1,trackOrdinals:[0,1,2]};
for(const [before,after,request] of [['loaded','trimmed',plan],['trimmed','restored',{...plan,cut:61,delta:-1}]]){
 assert.throws(()=>verifySavedDualRollerTrim(graphs[before],graphs[after],request),error=>error.code==='SAVED_TRIM_MARKER_IDENTITIES_CHANGED');
}
// A separate diagnostic comparison deliberately excludes markers; never report it as exact full-state proof.
const withoutMarkers=graph=>({...graph,mobs:graph.mobs.map(({markers,...mob})=>mob)});
assert.equal(verifySavedDualRollerTrim(withoutMarkers(graphs.loaded),withoutMarkers(graphs.trimmed),plan).verified,true);
assert.equal(verifySavedDualRollerTrim(withoutMarkers(graphs.trimmed),withoutMarkers(graphs.restored),{...plan,cut:61,delta:-1}).verified,true);
assert.deepEqual(withoutMarkers(graphs.restored).mobs,withoutMarkers(graphs.loaded).mobs);
const changes=[];
for(let index=0;index<3;index++){
 const before=targets.loaded.markers[index],trimmed=targets.trimmed.markers[index],restored=targets.restored.markers[index];
 assert.equal(before.guid,fixture.markers[index].guid);assert.equal(trimmed.guid,null);assert.equal(restored.guid,null);
 assert.notEqual(before.id,trimmed.id);assert.notEqual(trimmed.id,restored.id);assert.notEqual(before.id,restored.id);
 const expected={...before,id:trimmed.id,guid:null,componentOffset:before.componentOffset-(index===0?0:1)};
 assert.deepEqual(trimmed,expected);assert.deepEqual(restored,{...before,id:restored.id,guid:null});
 changes.push({name:before.name,beforeId:before.id,trimmedId:trimmed.id,restoredId:restored.id,beforeOffset:before.componentOffset,trimmedOffset:trimmed.componentOffset,restoredOffset:restored.componentOffset,sequenceFrame:before.location.sequenceFrame});
}
assert.deepEqual(await Promise.all(fixture.protectedFiles.map(sha256File)),fixture.hashes);
assert.equal(await sha256File(fixture.file),captures.restored.sha256);
const result={changes,clipRangesRestored:true,markerPositionsAndTextRestored:true,savedMarkerIdentitiesRestored:false,nativeReportedUuidsUnchanged:true,exactTrimVerificationRefused:true,originalSourcesUnchanged:true,scope:'One observed UI trim/save/undo/save. Marker ID correspondence is fixture-specific; no automatic rekeying, cross-session native UUID continuity or complete undo guarantee.'};
await writeFile(path.join(root,'verification.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({root,...result}));
