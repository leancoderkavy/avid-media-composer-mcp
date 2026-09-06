import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=process.argv[2];assert.ok(root&&path.isAbsolute(root)&&process.argv.length===3);
const evidence=JSON.parse(await readFile(path.join(root,'evidence.json'),'utf8')),events=JSON.parse(await readFile(path.join(root,'events.json'),'utf8'));
const created=events.filter(event=>event.name==='avid_native_apply'&&event.response.structuredContent?.data?.action?.action==='add_marker');assert.equal(created.length,2);
const last=created[1],after=events.slice(events.indexOf(last)+1).find(event=>event.name==='avid_native_read'&&event.args.query==='markers');assert.ok(after&&!after.response.isError);
assert.deepEqual(after.response.structuredContent.data,last.response.structuredContent.data.postState);
const graph=JSON.parse(await readFile(path.join(root,'original.json'),'utf8'));assert.equal(await sha256File(path.join(root,'original.avb')),graph.sha256);
const markers=graph.mobs.flatMap(mob=>mob.markers??[]);assert.equal(markers.length,2);
for(const note of evidence.notes){
 const matches=markers.filter(marker=>marker.id===note.guid);assert.equal(matches.length,1);const marker=matches[0];
 assert.match(note.guid,/^060a2b340101010501010f1013-000000-[0-9a-f]{16}-[0-9a-f]{12}-[0-9a-f]{4}$/);assert.equal(marker.guid,null);assert.equal(marker.name,note.name);assert.equal(marker.comment,note.comment);assert.equal(marker.color,note.color);
 assert.equal(marker.location.sequenceFrame,note.offset);assert.equal(marker.location.status,'direct_sequence');
}
await writeFile(path.join(root,'creation-persistence-verification.json'),JSON.stringify({nativeFieldsPreservedAfterReopen:true,savedRequestedFieldsVerified:true,savedSha256:graph.sha256,scope:'Two single-created picture markers at frames zero and 75 on the retained direct sequence. No general track/rate or binary-equivalence proof.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,verified:true}));
