// Create a new research MOV with copied video and source-clock stereo PCM.
// Does not relink, import, replace, or edit any Avid media or project.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceSha256=await sha256File(source);
assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root=path.resolve('.avid-mcp-analysis',`sonoma-source-clock-${randomUUID()}`);await mkdir(root);
const output=path.join(root,'Sonoma_SourceClock_Stereo.mov');
const run=async(executable,args)=>{const result=await runProcess(executable,args,{timeoutMs:120000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
const clock='aresample=48000:async=1:first_pts=0';
await run('ffmpeg',['-nostdin','-v','error','-n','-protocol_whitelist','file,pipe','-i',source,'-map','0:v:0','-map','0:a:0','-c:v','copy','-af',clock,'-c:a','pcm_s24le',output]);
const probe=async file=>JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
const original=await probe(source),prepared=await probe(output);
const video=prepared.streams.find(s=>s.codec_type==='video'),sourceVideo=original.streams.find(s=>s.codec_type==='video');
const audio=prepared.streams.filter(s=>s.codec_type==='audio');
assert.equal(audio.length,1);assert.equal(audio[0].codec_name,'pcm_s24le');assert.equal(audio[0].channels,2);assert.equal(audio[0].sample_rate,'48000');
for(const field of ['codec_name','width','height','nb_frames','avg_frame_rate','start_time','color_range','color_space','color_primaries','color_transfer'])assert.equal(video[field],sourceVideo[field],`Changed video field ${field}`);
const essenceHash=async(file,map,filter,codec)=>run('ffmpeg',['-nostdin','-v','error','-i',file,'-map',map,...(filter?['-af',filter]:[]),'-c',codec,'-f','hash','-hash','sha256','pipe:1']);
const originalVideoHash=await essenceHash(source,'0:v:0',null,'copy'),preparedVideoHash=await essenceHash(output,'0:v:0',null,'copy');
assert.equal(preparedVideoHash,originalVideoHash);
const expectedAudioHash=await essenceHash(source,'0:a:0',clock,'pcm_s24le'),preparedAudioHash=await essenceHash(output,'0:a:0',null,'pcm_s24le');
assert.equal(preparedAudioHash,expectedAudioHash);
const packets=JSON.parse(await run('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts_time,duration_time','-of','json',output])).packets;
assert.ok(packets.length>0);
let end=0,maxGap=0;
for(const packet of packets){const pts=Number(packet.pts_time),duration=Number(packet.duration_time);assert.ok(Number.isFinite(pts)&&Number.isFinite(duration)&&duration>0);maxGap=Math.max(maxGap,Math.abs(pts-end));end=pts+duration;}
assert.ok(maxGap<1/48000,'Prepared PCM packets must be contiguous within timestamp decimal precision');
assert.equal(await sha256File(source),sourceSha256);
const report={source,output,sourceSha256,outputSha256:await sha256File(output),sourceUnchanged:true,original,prepared,
  copiedVideoEssenceSha256:originalVideoHash.trim(),sourceClockPcmSha256:expectedAudioHash.trim(),audioPackets:packets.length,maxAudioPacketGapSeconds:maxGap,
  method:'Copies compressed video essence and converts audio to 24-bit stereo PCM using presentation-clock resampling. Verifies video metadata/essence, normalized PCM equality and contiguous output audio packets.',
  limitations:['No Avid link/import/render has been performed with this file.','This prepares a separate research asset, not an automatic relink or universal ingest preset.','Color interpretation, channel mixing and perceptual sync still require Avid qualification.']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output,outputSha256:report.outputSha256,copiedVideoEssenceSha256:report.copiedVideoEssenceSha256,sourceClockPcmSha256:report.sourceClockPcmSha256,maxAudioPacketGapSeconds:maxGap}));
