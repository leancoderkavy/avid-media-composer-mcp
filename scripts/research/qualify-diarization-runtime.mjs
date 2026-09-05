import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {diarizationRuntimeStatus,installDiarizationRuntime,DIARIZATION_WORKER} from '../../dist/library/diarization-runtime.js';
import {speechAudioArguments} from '../../dist/library/speech-audio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const cache=path.resolve('.avid-mcp-analysis/models'),root=path.resolve('.avid-mcp-analysis',`diarization-runtime-${randomUUID()}`);await mkdir(root);
const status=await diarizationRuntimeStatus(cache);assert.ok(status.unchanged);
const reuse=await installDiarizationRuntime(cache,'nonexistent-python');assert.ok(reuse.reused&&reuse.unchanged);
const ffmpeg=process.env.AVID_MCP_FFMPEG??'ffmpeg',results=[];
const alternating=path.resolve('.avid-mcp-analysis/diarization-601e82eb-5f3d-407d-91b5-7507f0ac7175/alternating.wav');
const sources=[{file:alternating,end:29.155,kind:'alternating'},{file:'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',end:190.866666,kind:'sonoma'}];
for(const source of sources){
  const sourceHash=await sha256File(source.file),audio=path.join(root,`${source.kind}.f32`);
  const extracted=await runProcess(ffmpeg,speechAudioArguments(source.file,audio,0,source.end),{timeoutMs:120000,maxOutputBytes:1024*1024});assert.equal(extracted.exitCode,0,extracted.stderr);
  for(const speakers of [-1,2]){
    const started=performance.now();
    const response=await runProcess(status.executable,['-B',DIARIZATION_WORKER,'--root',status.directory,'--audio',audio,'--speakers',String(speakers)],{timeoutMs:120000,maxOutputBytes:1024*1024});assert.equal(response.exitCode,0,response.stderr);
    const output=JSON.parse(response.stdout);assert.equal(output.audioSha256,await sha256File(audio));assert.ok(output.spans.every(span=>span.start>=0&&span.end>span.start&&span.end<=output.duration));
    if(source.kind==='alternating'){
      const turns=[[0.6,6.795],[7.595,13.86],[14.66,21.305],[22.105,28.355]];
      const labels=turns.map(([start,end])=>{const totals=new Map();for(const span of output.spans)totals.set(span.speaker,(totals.get(span.speaker)??0)+Math.max(0,Math.min(end,span.end)-Math.max(start,span.start)));return [...totals].sort((a,b)=>b[1]-a[1])[0][0];});
      assert.equal(labels[0],labels[2]);assert.equal(labels[1],labels[3]);assert.notEqual(labels[0],labels[1]);assert.equal(output.speakerCount,2);
    }
    results.push({kind:source.kind,sourceHash,speakers,elapsedSeconds:(performance.now()-started)/1000,output});
  }
  assert.equal(await sha256File(source.file),sourceHash);
}
assert.ok((await diarizationRuntimeStatus(cache)).unchanged);
const extra=path.join(status.directory,`qualification-${randomUUID()}.txt`);await writeFile(extra,'owned qualification file',{flag:'wx'});
try{assert.equal((await diarizationRuntimeStatus(cache)).unchanged,false);await assert.rejects(installDiarizationRuntime(cache,'nonexistent-python'),/tree or worker changed/);}finally{await unlink(extra);}
assert.ok((await diarizationRuntimeStatus(cache)).unchanged);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({runtime:status,results,reusedWithoutPython:true,treeUnchangedAfterInference:true,changedTreeRefused:true,sourcesUnchanged:true,scope:'Actual managed runtime and worker execution; synthetic A/B/A/B grouping and unlabelled Sonoma execution, not natural-dialogue accuracy or MCP speaker tools.'},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
