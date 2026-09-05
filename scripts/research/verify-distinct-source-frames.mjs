// Fixed-fixture video diagnostics; no host or media mutation.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const render=path.resolve('.avid-mcp-analysis/aaf-workflow-mcp-6f42b30d-86ed-4b72-bc09-d6e596911f87/native-export-ca9065e5-4734-4711-8e9a-823cf9ffcdda/export/render.mp4');
const renderSha256='e0b2fcd35a72b21e87ae13de76e5dfcff615e86ef749f31187ddfcb9cac5669f';
const sources=[{file:'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sha256:'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',firstFrame:2849},
 {file:'D:/Sonoma Escape Edit/Sonoma_Escape_SLIDESHOW_4K.mp4',sha256:'f6a3b14c49f71546c798dcae1bce1de2208b259a46558bb8c8365f9151aa0c6a',firstFrame:2850}];
assert.equal(await sha256File(render),renderSha256);
const root=path.join(path.dirname(render),`distinct-frames-${randomUUID()}`);await mkdir(root);
const run=async(exe,args)=>{const r=await runProcess(exe,args,{timeoutMs:120000,maxOutputBytes:4*1024*1024});assert.equal(r.exitCode,0,r.stderr);return r.stdout;};
const extract=async(file,name,selection='',full=false)=>{
 const output=path.join(root,name);
 await run('ffmpeg',['-nostdin','-v','error','-n','-i',file,'-map','0:v:0','-an','-vf',`${selection}scale=96:54:flags=area${full?':in_range=pc':''},format=rgb24`,'-fps_mode','passthrough','-f','rawvideo',output]);
 return readFile(output);
};
const bytesPerFrame=96*54*3,expected=[];
for(const [index,s] of sources.entries()){
 assert.equal(await sha256File(s.file),s.sha256);
 const frames=JSON.parse(await run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',s.file])).frames;
 s.maxTimestampResidualSeconds=Math.max(...Array.from({length:60},(_,i)=>Math.abs(Number(frames[s.firstFrame+i].best_effort_timestamp_time)-(95+i/30))));
 assert.ok(s.maxTimestampResidualSeconds<0.000001);
 expected.push(await extract(s.file,`source-${index}.rgb`,`select=between(n\\,${s.firstFrame}\\,${s.firstFrame+59}),`));
 assert.equal(expected[index].length,60*bytesPerFrame);
}
const declared=await extract(render,'declared.rgb'),full=await extract(render,'full-diagnostic.rgb','',true);
assert.equal(declared.length,120*bytesPerFrame);assert.equal(full.length,declared.length);
const metrics=(a,b)=>{let error=0,shift=0;for(let i=0;i<a.length;i++){const d=b[i]-a[i];error+=d*d;shift+=d;}return {rmse:Math.sqrt(error/a.length),meanRgbShift:shift/a.length};};
const cuts=expected.map((pixels,index)=>({source:sources[index],frames:60,declared:metrics(pixels,declared.subarray(index*pixels.length,(index+1)*pixels.length)),forcedFullDiagnostic:metrics(pixels,full.subarray(index*pixels.length,(index+1)*pixels.length)),wrongSourceDiagnostic:metrics(expected[1-index],full.subarray(index*pixels.length,(index+1)*pixels.length))}));
for(const source of sources)assert.equal(await sha256File(source.file),source.sha256);
assert.equal(await sha256File(render),renderSha256);
const report={render,renderSha256,cuts,sourceAndRenderHashesUnchanged:true,limitations:['96x54 decoded RGB diagnostics only; not full-resolution or perceptual color acceptance','Frame selection follows original presentation timestamps; repeated still images cannot independently prove timing','Forced full range is a decode experiment, not a correction']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),cuts}));
