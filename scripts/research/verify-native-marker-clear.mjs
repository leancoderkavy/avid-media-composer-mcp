import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=process.argv[2];assert.ok(root&&path.isAbsolute(root)&&process.argv.length===3);
const evidence=JSON.parse(await readFile(path.join(root,'evidence.json'),'utf8'));
const graphs=[];for(const stage of ['original','updated','restored']){const graph=JSON.parse(await readFile(path.join(root,stage+'.json'),'utf8'));assert.equal(await sha256File(path.join(root,stage+'.avb')),graph.sha256);graphs.push(graph);}
const [original,updated,restored]=graphs,expected=structuredClone(original.mobs),guid=evidence.notes[0].guid;
let matched=0;for(const mob of expected)for(const marker of mob.markers??[])if(marker.id===guid){matched++;assert.equal(marker.guid,null);marker.comment='';marker.color='Blue';marker.rgb16=[13107,13107,52428];}
assert.equal(matched,1);assert.deepEqual(updated.mobs,expected);assert.deepEqual(updated.warnings,original.warnings);
assert.deepEqual(restored.mobs,original.mobs);assert.deepEqual(restored.warnings,original.warnings);
await writeFile(path.join(root,'saved-clear-verification.json'),JSON.stringify({savedClearVerified:true,otherDecodedFieldsPreserved:true,restoredDecodedGraph:true,hashes:graphs.map(graph=>graph.sha256),scope:'One saved non-UUID marker comment clear and observed Blue RGB declaration, plus exact decoded restoration. No binary equivalence, arbitrary color mapping or atomic undo guarantee.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,verified:true}));
