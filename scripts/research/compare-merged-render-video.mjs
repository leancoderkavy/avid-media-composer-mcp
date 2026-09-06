// Decode both existing owned renders completely; preserve source artifacts.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const fixtures=[
 {file:'.avid-mcp-analysis/aaf-workflow-mcp-6f42b30d-86ed-4b72-bc09-d6e596911f87/native-export-ca9065e5-4734-4711-8e9a-823cf9ffcdda/export/render.mp4',sha256:'e0b2fcd35a72b21e87ae13de76e5dfcff615e86ef749f31187ddfcb9cac5669f'},
 {file:'.avid-mcp-analysis/aaf-workflow-mcp-a6a0a460-9132-4d96-b13c-ae3d4385f061/native-export-7d62d9d9-fc66-4402-959c-ba38a2e7f248/export/render.mp4',sha256:'cfcc486579fdbc34ad23b5c857817095faba226f2c5bdc5b2274f3b67b1529a9'}];
const root=path.resolve('.avid-mcp-analysis',`merged-render-video-${randomUUID()}`);await mkdir(root);
const results=[];
for(const [index,fixture] of fixtures.entries()){
 const file=path.resolve(fixture.file);assert.equal(await sha256File(file),fixture.sha256);
 const decoded=await runProcess('ffmpeg',['-nostdin','-v','error','-i',file,'-map','0:v:0','-an','-f','framemd5','pipe:1'],{timeoutMs:120000,maxOutputBytes:1048576});
 assert.equal(decoded.exitCode,0,decoded.stderr);
 const lines=decoded.stdout.split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
 assert.equal(lines.length,120);
 await writeFile(path.join(root,`render-${index}.framemd5`),decoded.stdout,{flag:'wx'});
 const probe=await runProcess('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',file],{timeoutMs:120000,maxOutputBytes:1048576});assert.equal(probe.exitCode,0);
 const video=JSON.parse(probe.stdout).streams[0];
 results.push({file,sha256:fixture.sha256,decodedFrames:lines,decodedListingSha256:createHash('sha256').update(lines.join('\n')).digest('hex'),declarations:Object.fromEntries(['codec_name','width','height','pix_fmt','avg_frame_rate','start_time','color_range','color_space','color_transfer','color_primaries'].map(key=>[key,video[key]]))});
 assert.equal(await sha256File(file),fixture.sha256);
}
const report={results,decodedVideoExact:JSON.stringify(results[0].decodedFrames)===JSON.stringify(results[1].decodedFrames),declarationsExact:JSON.stringify(results[0].declarations)===JSON.stringify(results[1].declarations),filesUnchanged:true,limitations:['Comparison to previous render; not independent color acceptance','Previous declared-range discrepancy remains if the frames and declarations match']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),decodedVideoExact:report.decodedVideoExact,declarationsExact:report.declarationsExact}));
assert.ok(report.decodedVideoExact&&report.declarationsExact);
