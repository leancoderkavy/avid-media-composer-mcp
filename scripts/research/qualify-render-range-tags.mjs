// Fixed-fixture range-tag experiment. Creates a new copy, never rewrites a render.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const input=path.resolve('.avid-mcp-analysis/native-render-mcp-e0f60e5d-67c3-49ac-9ba0-7de71d73453c/native-export-2984bde7-47e5-4d40-a287-886f9aeb454d/export/render.mp4');
const before=await sha256File(input);assert.equal(before,'8fd3fb4c04d24f3fd2200e600dab3e16edb1ad0329384a6814d1cb22d5f85cc0');
const root=path.resolve('.avid-mcp-analysis',`render-range-tags-${randomUUID()}`);await mkdir(root);
const output=path.join(root,'render-full-range.mp4');
const run=async(exe,args)=>{const result=await runProcess(exe,args,{timeoutMs:120000,maxOutputBytes:1048576});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
await run('ffmpeg',['-nostdin','-v','error','-n','-i',input,'-map','0:v:0','-map','0:a:0','-c','copy','-bsf:v','h264_metadata=video_full_range_flag=1','-color_range','pc',output]);
const probe=async file=>JSON.parse(await run('ffprobe',['-v','error','-show_streams','-of','json',file]));
const original=await probe(input),updated=await probe(output);
const v=updated.streams.find(s=>s.codec_type==='video');assert.equal(v.color_range,'pc');assert.equal(v.nb_frames,'120');assert.equal(v.width,1920);assert.equal(v.height,1080);
// Hash all non-parameter-set H.264 units. SPS/PPS may change for the VUI flag;
// the remaining encoded units, including picture slices, must stay identical.
const hash=async(file,stream,filter)=>run('ffmpeg',['-nostdin','-v','error','-i',file,'-map',stream,'-c','copy',...(filter?['-bsf:v',filter]:[]),'-f','hash','-hash','sha256','pipe:1']);
const pictureBefore=await hash(input,'0:v:0','filter_units=remove_types=7|8'),pictureAfter=await hash(output,'0:v:0','filter_units=remove_types=7|8');
assert.equal(pictureAfter,pictureBefore);
const audioBefore=await hash(input,'0:a:0'),audioAfter=await hash(output,'0:a:0');assert.equal(audioAfter,audioBefore);
assert.equal(await sha256File(input),before);
const report={input,output,inputSha256:before,outputSha256:await sha256File(output),original,updated,
  inputUnchanged:true,encodedPictureUnitsUnchanged:true,audioPacketsUnchanged:true,pictureUnitsSha256:pictureBefore.trim(),audioPacketsSha256:audioBefore.trim(),
  method:'Copy streams into a new MP4 while setting the H.264 full-range VUI flag and container range declaration. No image or audio encoding. Compare hashes excluding only H.264 parameter sets.',
  limitations:['Fixed investigated fixture only; do not apply range overrides to arbitrary exports.','Independent ordinary-decode comparison and exact PCM checks are still required.','This does not change or qualify the native Avid preset itself.']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output,outputSha256:report.outputSha256,encodedPictureUnitsUnchanged:true,audioPacketsUnchanged:true}));
