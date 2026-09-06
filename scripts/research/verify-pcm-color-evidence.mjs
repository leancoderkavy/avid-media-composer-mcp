// Bind the saved-graph, native-export and independent media evidence for one owned fixture.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const root=path.resolve('.avid-mcp-analysis/native-color-fixture-3bfb1d55-f1d4-4675-936c-bd2ab3cf8694');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const fixture=await read(path.join(root,'evidence.json')),refresh=await read(path.join(root,'refresh-result.json'));
const output=refresh.applied.verification.output,exportRoot=path.dirname(output);
const audio=await read(path.join(exportRoot,'audio-comparison-0f785dec-0e7b-4020-9551-d42c21e810e3/evidence.json'));
const video=await read(path.join(exportRoot,'frame-comparison-69952a6e-d60a-40ff-bb50-2d453dcb9079/evidence.json'));
const full=await read(path.resolve('.avid-mcp-analysis/full-resolution-9a2302fe-441f-49db-adf7-753e9091bfad/evidence.json'));
const outputHash=await sha256File(output);
assert.equal(outputHash,'ee3ab16d6e7789a1a06727fabb6fbafc41207fa31b352791e2dec0908b484e0d');
for(const report of [audio,video]){assert.equal(report.renderSha256,outputHash);assert.equal(path.resolve(report.render),output);}
assert.equal(full.results[0].sha256,outputHash);
assert.equal(refresh.applied.outputVerified,true);assert.equal(refresh.applied.verification.decodedFrames,120);
assert.equal(audio.pcm24SourceClockExactMatch,true);assert.equal(audio.renderedChannelsIdentical,false);
assert.equal(audio.expectedPcm24Hash,audio.renderedPcm24Hash);
assert.deepEqual(video.bestOffsets,{'-1':120});assert.ok(video.maxBestTimestampResidualSeconds<0.000001);
const name='MCP_PCM_AAF_Selects.Copy.01';
const parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',path.join(root,'candidate-refreshed.avb')],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);
const currentGraph=JSON.parse(parsed.stdout);assert.equal(currentGraph.sha256,refresh.graph.sha256);
const before=fixture.after.mobs.find(m=>m.name===name),after=currentGraph.mobs.find(m=>m.name===name);
assert.ok(before&&after);assert.deepEqual(after.tracks.slice(1),before.tracks.slice(1));
assert.equal(after.duration,120);assert.equal(after.rate,30);
for(const [index,node] of after.tracks[0].nodes.entries()){
 const original=before.tracks[0].nodes[index],input=node.effect.inputReference;
 assert.equal(node.effect.id,'EFF2_LUTSFX');assert.equal(node.opaque,true);
 assert.equal(node.effect.linearLutDeclaration.automaticConversion,true);
 assert.equal(node.effect.linearLutDeclaration.transformationListName,'From Rec.709 [full range] to Rec.709');
 assert.equal(input.sourceMobId,original.sourceMobId);assert.equal(input.sourceTrackId,original.sourceTrackId);
 assert.equal(input.sourceStart,original.sourceStart);assert.equal(input.length,original.timelineEnd-original.timelineStart);
 assert.equal(node.timelineStart,original.timelineStart);assert.equal(node.timelineEnd,original.timelineEnd);
}
assert.equal(after.tracks[0].nodes.length,2);
assert.equal(await sha256File(path.join(fixture.project,fixture.sourceBin)),fixture.sourceHash);
assert.equal(await sha256File(path.join(fixture.project,fixture.bin)),refresh.graph.sha256);
assert.equal(await sha256File(audio.source),'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const prepared=path.resolve('.avid-mcp-analysis/sonoma-source-clock-857e680b-48a7-4dc9-a52e-478f864ef2b9/Sonoma_SourceClock_Stereo.mov');
assert.equal(await sha256File(prepared),'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb');
const report={output,outputHash,sourceBinsAndMediaUnchanged:true,nonPictureTracksUnchanged:true,inputReferencesPreserved:true,
 pcm24SourceClockExactMatch:true,channelsDistinct:true,decodedFrames:120,meanSsim:full.results[0].meanSsim,
 maxBestTimestampResidualSeconds:video.maxBestTimestampResidualSeconds,
 scope:'Combined prepared-PCM/color-refresh fixture evidence only; color residual remains, frame ranking is diagnostic, no general native refresh or fidelity certification.'};
await writeFile(path.join(root,'combined-evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
await writeFile(path.join(root,'combined-graph.json'),JSON.stringify(currentGraph,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
