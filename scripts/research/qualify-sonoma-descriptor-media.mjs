// Compare one explicitly named, authorized MP4 with retained Avid declarations.
// Locator strings are checked for this fixture, never used to construct a path.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const retained=path.resolve('.avid-mcp-analysis/trim-source-trace-51eefa79-0192-47b6-b333-0df257f926df/evidence.json');
const root=path.resolve('.avid-mcp-analysis',`sonoma-descriptor-media-${randomUUID()}`);await mkdir(root);
const hashes=await Promise.all([file,retained].map(sha256File));
const prior=JSON.parse(await readFile(retained,'utf8'));
const descriptors=prior.trace.descriptors;
const video=descriptors.find(d=>d.descriptor?.classId==='CDCI').descriptor;
const audio=descriptors.find(d=>d.descriptor?.classId==='MPGA').descriptor;
const physical=descriptors.find(d=>d.descriptor?.classId==='MDES').descriptor;
assert.deepEqual(physical.locator.paths.map(p=>p.value),Array(2).fill('D//Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'));
async function probe(args){const result=await runProcess('ffprobe',['-v','error',...args,'-of','json',file],{timeoutMs:120000,maxOutputBytes:8*1024*1024});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout);}
const metadata=await probe(['-show_streams','-show_format']);
const videoCount=await probe(['-select_streams','v:0','-count_frames','-show_entries','stream=index,nb_read_frames']);
const audioFrames=await probe(['-select_streams','a:0','-show_frames','-show_entries','frame=best_effort_timestamp,best_effort_timestamp_time,nb_samples']);
assert.ok(audioFrames.frames.length>0&&audioFrames.frames.length<20000);
const samples=audioFrames.frames.reduce((sum,f)=>{assert.ok(Number.isSafeInteger(f.nb_samples)&&f.nb_samples>0);return sum+f.nb_samples;},0);
const decodedVideoFrames=Number(videoCount.streams[0].nb_read_frames);assert.ok(Number.isSafeInteger(decodedVideoFrames)&&decodedVideoFrames>0);
const audioStream=metadata.streams.filter(s=>s.codec_type==='audio');assert.equal(audioStream.length,1);
const videoStream=metadata.streams.filter(s=>s.codec_type==='video');assert.equal(videoStream.length,1);
assert.equal(audioStream[0].time_base,'1/48000');assert.equal(audioStream[0].sample_rate,'48000');
let gapSamples=0,overlapSamples=0,discontinuities=0;
for(let i=0;i<audioFrames.frames.length;i++){
 const frame=audioFrames.frames[i];assert.ok(Number.isSafeInteger(frame.best_effort_timestamp));
 if(i){const previous=audioFrames.frames[i-1],gap=frame.best_effort_timestamp-previous.best_effort_timestamp-previous.nb_samples;
  assert.ok(Number.isSafeInteger(gap));if(gap!==0)discontinuities++;if(gap>0)gapSamples+=gap;else overlapSamples-=gap;}
}
const firstAudio=audioFrames.frames[0],lastAudio=audioFrames.frames.at(-1);
const audioTimestampSpan=lastAudio.best_effort_timestamp+lastAudio.nb_samples-firstAudio.best_effort_timestamp;
assert.equal(samples+gapSamples-overlapSamples,audioTimestampSpan);
const comparison={video:{descriptorFrames:video.values.length,descriptorRate:video.values.edit_rate,decodedFrames:decodedVideoFrames,delta:decodedVideoFrames-video.values.length,descriptorGeometry:[video.values.stored_width,video.values.stored_height],probedGeometry:[videoStream[0].width,videoStream[0].height]},audio:{descriptorSamples:audio.values.length,descriptorRate:audio.values.edit_rate,decodedSamples:samples,delta:samples-audio.values.length,decodedFrames:audioFrames.frames.length,probedSampleRate:Number(audioStream[0].sample_rate),probedChannels:audioStream[0].channels},locatorMatch:'Exact known fixture declaration checked against separately specified candidate; no general locator resolver'};
comparison.audio.timestampAccounting={timeBase:audioStream[0].time_base,first:firstAudio.best_effort_timestamp,end:lastAudio.best_effort_timestamp+lastAudio.nb_samples,span:audioTimestampSpan,gapSamples,overlapSamples,discontinuities,descriptorMinusSpan:audio.values.length-audioTimestampSpan};
assert.deepEqual(await Promise.all([file,retained].map(sha256File)),hashes);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({file,retained,hashes,metadata,videoCount,audioFrames,comparison,inputsUnchanged:true,limitations:['File hash binds this observation, not the historical Avid import','Decoded counts do not establish Avid essence identity or timestamp continuity','No frame/sample conversion, trim handle acceptance or playback claim']},null,2),{flag:'wx'});
console.log(JSON.stringify({root,comparison,inputsUnchanged:true}));
