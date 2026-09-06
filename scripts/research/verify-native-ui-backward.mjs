import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifySavedDualRollerTrim} from '../../dist/native/trim-verifier.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis/native-ui-backward-20260906');
const graphs=await Promise.all(['baseline','backward','restored'].map(async stage=>{
  const graph=JSON.parse(await readFile(path.join(root,stage+'.json'),'utf8'));
  assert.equal(graph.sha256,await sha256File(path.join(root,stage+'.avb')));return graph;
}));
const [baseline,backward,restored]=graphs;
const sequence=baseline.mobs.find(m=>m.name==='MCP_Sonoma_AAF_Selects.Copy.05');assert.ok(sequence);
const plan={mobId:sequence.mobId,cut:60,delta:-1,trackOrdinals:[0,1,2]};
const trim=verifySavedDualRollerTrim(baseline,backward,plan);
const undo=verifySavedDualRollerTrim(backward,restored,{...plan,cut:59,delta:1});
const mobs=g=>[...g.mobs].sort((a,b)=>a.mobId.localeCompare(b.mobId));assert.deepEqual(mobs(restored),mobs(baseline));
const result={trim,undo,allDecodedMobsRestored:true,hashes:graphs.map(g=>g.sha256),scope:'One observed Windows Avid backward dual-roller trim/save/undo/save. No shipping UI executor, broader edit, history-restart or playback proof.'};
await writeFile(path.join(root,'verification.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
