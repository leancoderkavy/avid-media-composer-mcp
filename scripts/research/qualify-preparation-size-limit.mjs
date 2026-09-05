// Demonstrate why FFmpeg's size limit must not be treated as completion proof.
import {mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',expected='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(source),expected);
const root=path.resolve('.avid-mcp-analysis',`preparation-size-limit-${randomUUID()}`);await mkdir(root);
const output=path.join(root,'limited.mov'),limit=1024*1024;
const result=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-protocol_whitelist','file,pipe','-i',source,'-map','0:0','-map','0:1','-c:v','copy','-af','aresample=48000:async=1:first_pts=0','-c:a','pcm_s24le','-fs',String(limit),output],{timeoutMs:30000,maxOutputBytes:1048576});
assert.equal(result.exitCode,0,result.stderr);
const probe=await runProcess('ffprobe',['-v','error','-show_streams','-of','json',output],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(probe.exitCode,0,probe.stderr);
const streams=JSON.parse(probe.stdout).streams,video=streams.find(s=>s.codec_type==='video');
assert.ok(Number(video.nb_frames)>0&&Number(video.nb_frames)<5725);
assert.equal(await sha256File(source),expected);
const report={source,sourceSha256:expected,output,limit,actualBytes:(await stat(output)).size,ffmpegExitCode:result.exitCode,frames:Number(video.nb_frames),fullSourceFrames:5725,truncatedDespiteSuccessfulExit:true,sourceUnchanged:true,interpretation:'Muxer size limits can overshoot and return exit zero for incomplete media. Production retains final size, frame, video-essence and PCM comparisons; this file is not a verified preparation.'};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),...report}));
