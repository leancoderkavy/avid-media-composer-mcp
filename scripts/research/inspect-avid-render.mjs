// Inspect an existing Avid-rendered fixture; this does not export or control Avid.
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file=path.resolve(process.argv[2]??''),source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
if(!process.argv[2]||path.extname(file).toLowerCase()!=='.mp4')throw new Error('Supply the existing Avid test render MP4');
const probe=async(input)=>{const value=await runProcess('ffprobe',['-v','error','-show_format','-show_streams','-of','json',input],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(value.exitCode,0,value.stderr);return JSON.parse(value.stdout);};
const sourceSha256=await sha256File(source),renderSha256=await sha256File(file);
assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const rendered=await probe(file),original=await probe(source),video=rendered.streams.find(stream=>stream.codec_type==='video');
assert.equal(video.nb_frames,'120');assert.equal(video.avg_frame_rate,'30/1');assert.equal(video.width,1920);assert.equal(video.height,1080);assert.equal(Number(video.duration),4);
const decode=await runProcess('ffmpeg',['-nostdin','-v','error','-xerror','-i',file,'-map','0:v:0','-map','0:a?','-f','null','-'],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(decode.exitCode,0,decode.stderr);
assert.equal(await sha256File(source),sourceSha256);assert.equal(await sha256File(file),renderSha256);
const report={render:file,renderSha256,sourceSha256,rendered,original,decodePassed:true,expectedVideoStructurePassed:true,audioChannelPreservation:rendered.streams.find(stream=>stream.codec_type==='audio')?.channels===original.streams.find(stream=>stream.codec_type==='audio')?.channels,colorConformance:'unverified',exactFrameConformance:'unverified',sourceUnchanged:true};
const evidence=path.join(path.dirname(file),`inspection-${randomUUID()}.json`);await writeFile(evidence,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence,renderSha256,decodePassed:true,audioChannelPreservation:report.audioChannelPreservation}));
