import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifySavedDualRollerTrim} from '../../dist/native/trim-verifier.js';
const root=path.resolve('.avid-mcp-analysis/native-ui-trim-20260906');
const [baseline,trimmed,undone]=await Promise.all(['baseline','trimmed','undone'].map(async name=>JSON.parse(await readFile(path.join(root,name+'.json'),'utf8'))));
const name='MCP_Sonoma_AAF_Selects.Copy.05';
const find=g=>{const found=g.mobs.filter(m=>m.name===name);assert.equal(found.length,1);return found[0];};
const before=find(baseline),after=find(trimmed),restored=find(undone);
const verifiedTrim=verifySavedDualRollerTrim(baseline,trimmed,{mobId:before.mobId,cut:60,delta:1,trackOrdinals:[0,1,2]});
verifySavedDualRollerTrim(trimmed,undone,{mobId:before.mobId,cut:61,delta:-1,trackOrdinals:[0,1,2]});
const expected=structuredClone(before);
const media=expected.tracks.filter(t=>['picture','sound'].includes(t.mediaKind));assert.equal(media.length,3);
for(const track of media){assert.equal(track.nodes.length,2);assert.equal(track.nodes[0].timelineEnd,60);assert.equal(track.nodes[1].timelineStart,60);assert.equal(track.nodes[1].sourceStart,3300);track.nodes[0].timelineEnd=61;track.nodes[1].timelineStart=61;track.nodes[1].sourceStart=3301;}
assert.deepEqual(after,expected);assert.deepEqual(restored,before);
const other=g=>g.mobs.filter(m=>m.mobId!==before.mobId).sort((a,b)=>a.mobId.localeCompare(b.mobId));assert.deepEqual(other(trimmed),other(baseline));assert.deepEqual(other(undone),other(baseline));
const evidence={verifiedTrim,sequence:name,mobId:before.mobId,rate:30,duration:120,changedTracks:3,cutBefore:60,cutAfter:61,secondSourceStartBefore:3300,secondSourceStartAfter:3301,undoRestoresDecodedSequence:true,otherDecodedMobsUnchanged:true,hashes:[baseline.sha256,trimmed.sha256,undone.sha256],scope:'Saved AVB semantics after one UI dual-roller trim and immediate undo. Unknown AVB fields, playback fidelity and a shipping UI adapter are not qualified.'};
await writeFile(path.join(root,'verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
