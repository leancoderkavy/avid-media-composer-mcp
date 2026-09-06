// Read-only saved-graph verification for the explicitly owned duplication experiment.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const experiment=path.resolve('.avid-mcp-analysis/native-copy-520aa510-9579-4ac1-a735-6946b78b0b5f');
const attempt=JSON.parse(await readFile(path.join(experiment,'attempt.json'),'utf8'));
const result=JSON.parse(await readFile(path.join(experiment,'result.json'),'utf8'));
const root=path.resolve('.avid-mcp-analysis',`native-duplicate-saved-${randomUUID()}`);await mkdir(root);
const files=[attempt.source,result.destination],graphs=[];
assert.equal(await sha256File(files[0]),attempt.sourceSha256);
for(const file of files){
  const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});
  assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);graphs.push(graph);
  await writeFile(path.join(root,path.basename(file)+'.json'),JSON.stringify(graph,null,2),{flag:'wx'});
  assert.equal(await sha256File(file),graph.sha256);
}
const find=(graph,id)=>{
  assert.match(id,/^[0-9a-f]+(?:-[0-9a-f]+)+$/);
  const hex=id.replaceAll('-','');assert.match(hex,/^[0-9a-f]{64}$/);
  const urn='urn:smpte:umid:'+hex.match(/.{8}/g).join('.');
  const matches=graph.mobs.filter(m=>m.mobId===urn);assert.equal(matches.length,1);return matches[0];
};
const source=find(graphs[0],attempt.mobIds[0]);
const targets=[...result.response.flatMap(body=>body.mob_id),...result.duplication.returned].map(id=>find(graphs[1],id));
const semantics=({mobId,name,...rest})=>rest;
for(const target of targets){assert.notEqual(target.mobId,source.mobId);assert.deepEqual(semantics(target),semantics(source));}
const reachable=(graph,start)=>{
  const seen=new Map(),unresolved=new Set(),pending=[start];
  while(pending.length){const mob=pending.pop();if(seen.has(mob.mobId))continue;seen.set(mob.mobId,mob);
    for(const node of mob.tracks.flatMap(t=>t.nodes)){if(!node.sourceMobId)continue;
      const matches=graph.mobs.filter(m=>m.mobId===node.sourceMobId);assert.ok(matches.length<=1);
      if(matches.length)pending.push(matches[0]);else unresolved.add(node.sourceMobId);
    }
  }seen.delete(start.mobId);return {nodes:[...seen.values()].sort((a,b)=>a.mobId.localeCompare(b.mobId)),unresolved:[...unresolved].sort()};
};
const expectedSources=reachable(graphs[0],source);
for(const target of targets)assert.deepEqual(reachable(graphs[1],target),expectedSources);
const media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
assert.equal(await sha256File(media),'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const evidence={passed:true,files,binHashes:graphs.map(g=>g.sha256),sourceMobId:source.mobId,targetMobIds:targets.map(m=>m.mobId),
  decodedSequenceSemanticsEqual:true,reachableSourcesEqual:true,unresolvedSourceIds:expectedSources.unresolved,originalMediaUnchanged:true,
  scope:'Saved copy and duplicate compared to protected original sequence, excluding only top-level name and MOB ID. All other decoded fields and reachable source records match. Not unknown AVB bytes, native reopen, undo, rendering or a shipped duplicate action.'};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({root,...evidence}));
