import {runProcess} from '../../dist/process.js';import {verifyEdlCuts} from '../../dist/native/edl-verifier.js';import {sha256File} from '../../dist/analysis/file-inventory.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`edl-saved-oracle-${randomUUID()}`);await mkdir(root);
const bin='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_AAF_Selects_20260905.avb',edl=path.resolve('.avid-mcp-analysis/sonoma-file129-ui-20260905.edl');
const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',bin],{timeoutMs:30000,maxOutputBytes:2*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const saved=JSON.parse(parsed.stdout);await writeFile(path.join(root,'saved.json'),JSON.stringify(saved,null,2));
const one=(items,label)=>{assert.equal(items.length,1,label);return items[0];};
const sequence=one(saved.mobs.filter(m=>m.name==='MCP_Sonoma_AAF_Selects'),'sequence');assert.equal(sequence.rate,30);
const tc=(mob,position,end)=>{const nodes=mob.tracks.filter(t=>t.mediaKind==='timecode').flatMap(t=>t.nodes).filter(n=>n.kind==='TCCP'&&n.timelineStart<=position&&n.timelineEnd>=end);if(!nodes.length)return;const n=one(nodes,'timecode');assert.equal(n.timecode.fps,30);assert.equal(n.timecode.flags,0);return n.timecode.start+position-n.timelineStart;};
function resolve(mob,kind,index,start,end,seen=new Set()){
 assert.equal(mob.rate,30);assert.ok(seen.size<16&&!seen.has(mob.mobId),'source chain cycle/depth');seen.add(mob.mobId);
 const clock=tc(mob,start,end);if(clock!==undefined)return {start:clock,end:clock+end-start,reel:mob.name.toUpperCase(),chain:[mob.mobId]};
 const track=one(mob.tracks.filter(t=>t.mediaKind===kind&&t.index===index),'source track');const node=one(track.nodes.filter(n=>n.timelineStart<=start&&n.timelineEnd>=end),'covering node');assert.equal(node.kind,'SCLP');
 const next=one(saved.mobs.filter(m=>m.mobId===node.sourceMobId),'source mob'),position=node.sourceStart+start-node.timelineStart;
 const resolved=resolve(next,kind,node.sourceTrackId,position,position+end-start,seen);return {...resolved,chain:[mob.mobId,...resolved.chain]};
}
const tracks=sequence.tracks.filter(t=>['picture','sound'].includes(t.mediaKind));assert.deepEqual(tracks.map(t=>[t.mediaKind,t.index]),[['picture',1],['sound',1],['sound',2]]);
const mapped=tracks.map(t=>t.nodes.map(n=>{assert.equal(n.kind,'SCLP');const mob=one(saved.mobs.filter(m=>m.mobId===n.sourceMobId),'master');return {recordStart:n.timelineStart,recordEnd:n.timelineEnd,...resolve(mob,t.mediaKind,n.sourceTrackId,n.sourceStart,n.sourceStart+n.timelineEnd-n.timelineStart)};}));
const ranges=rows=>rows.map(({chain,...range})=>range);assert.deepEqual(ranges(mapped[0]),ranges(mapped[1]));assert.deepEqual(ranges(mapped[0]),ranges(mapped[2]));
const format=frame=>{assert.ok(Number.isInteger(frame)&&frame>=0&&frame<24*3600*30);return [Math.floor(frame/108000),Math.floor(frame/1800)%60,Math.floor(frame/30)%60,frame%30].map(n=>String(n).padStart(2,'0')).join(':');};
const recordBase=tc(sequence,0,sequence.duration);assert.ok(Number.isInteger(recordBase));
const contract={frameRate:30,events:mapped[0].map(n=>({reel:n.reel,track:'AA/V',sourceIn:format(n.start),sourceOut:format(n.end),recordIn:format(recordBase+n.recordStart),recordOut:format(recordBase+n.recordEnd)}))};
await writeFile(path.join(root,'contract.json'),JSON.stringify({contract,mapped},null,2));const result=await verifyEdlCuts(edl,contract);assert.equal(await sha256File(bin),saved.sha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,binSha256:saved.sha256,contractOrigin:'Independent saved AVB source-chain and timecode traversal; combined AA/V label is the observed export layout, not separate channel proof.'},null,2));console.log(JSON.stringify({root,verified:true,contract}));
