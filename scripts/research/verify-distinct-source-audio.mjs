// Independent original-MP4 audio oracle for the preview/slideshow native render.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const render=path.resolve('.avid-mcp-analysis/aaf-workflow-mcp-6f42b30d-86ed-4b72-bc09-d6e596911f87/native-export-ca9065e5-4734-4711-8e9a-823cf9ffcdda/export/render.mp4');
const renderSha256='e0b2fcd35a72b21e87ae13de76e5dfcff615e86ef749f31187ddfcb9cac5669f';
const sources=[{file:'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sha256:'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca'},
 {file:'D:/Sonoma Escape Edit/Sonoma_Escape_SLIDESHOW_4K.mp4',sha256:'f6a3b14c49f71546c798dcae1bce1de2208b259a46558bb8c8365f9151aa0c6a'}];
assert.equal(await sha256File(render),renderSha256);
const root=path.join(path.dirname(render),`distinct-audio-${randomUUID()}`);await mkdir(root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extract=async(file,name,filter)=>{
 const output=path.join(root,name);
 const result=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',file,'-map','0:a:0',...(filter?['-af',filter]:[]),'-c:a','pcm_s24le','-f','s24le',output],{timeoutMs:120000,maxOutputBytes:1048576});
 assert.equal(result.exitCode,0,result.stderr);return readFile(output);
};
const expected=[];
for(const [index,source] of sources.entries()){
 assert.equal(await sha256File(source.file),source.sha256);
 expected.push(await extract(source.file,`source-${index}.pcm`,'aresample=48000:async=1:first_pts=0,atrim=start=95:end=97,asetpts=PTS-STARTPTS'));
 assert.equal(expected[index].length,96000*2*3);
}
const actual=await extract(render,'render.pcm');assert.equal(actual.length,192000*2*3);
const channel=(bytes,c)=>{const result=Buffer.alloc(bytes.length/2);for(let i=0;i<bytes.length/6;i++)bytes.copy(result,i*3,i*6+c*3,i*6+c*3+3);return result;};
const cuts=expected.map((bytes,index)=>{const rendered=actual.subarray(index*bytes.length,(index+1)*bytes.length);return {source:sources[index],startSeconds:95,lengthSeconds:2,exact:bytes.equals(rendered),expectedSha256:hash(bytes),renderedSha256:hash(rendered),channels:[0,1].map(c=>({channel:c+1,exact:channel(bytes,c).equals(channel(rendered,c))})),renderedChannelsDistinct:!channel(rendered,0).equals(channel(rendered,1))};});
const report={render,renderSha256,cuts,completePcmExact:Buffer.concat(expected).equals(actual),swappedCutsRejected:!Buffer.concat([...expected].reverse()).equals(actual),sourcesUnchanged:true,renderUnchanged:true,limitations:['Exact normalized PCM only; not video, color or perceptual sync acceptance']};
for(const source of sources)assert.equal(await sha256File(source.file),source.sha256);
assert.equal(await sha256File(render),renderSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),completePcmExact:report.completePcmExact,swappedCutsRejected:report.swappedCutsRejected,cuts}));
assert.ok(report.completePcmExact&&report.swappedCutsRejected&&cuts.every(c=>c.exact&&c.channels.every(ch=>ch.exact)));
