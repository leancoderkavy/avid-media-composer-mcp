import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {speechAudioArguments} from '../../dist/library/speech-audio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const ffmpeg=process.env.AVID_MCP_FFMPEG??'ffmpeg';
const root=path.resolve('.avid-mcp-analysis',`speech-clock-${randomUUID()}`);await mkdir(root);
async function run(args){const result=await runProcess(ffmpeg,args,{timeoutMs:120000,maxOutputBytes:1024*1024});assert.equal(result.exitCode,0,result.stderr);}
const results=[];
async function extract(source,start,end){
  const before=await sha256File(source),output=path.join(root,`${randomUUID()}.f32`);
  await run(speechAudioArguments(source,output,start,end));
  const bytes=await readFile(output);assert.ok(bytes.length>0&&bytes.length%4===0);assert.ok(bytes.length<=Math.ceil((end-start)*16000)*4);
  const samples=Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));assert.ok(samples.every(Number.isFinite));
  assert.equal(await sha256File(source),before);
  const record={source,sourceHash:before,start,end,output,seconds:samples.length/16000,sourceUnchanged:true};results.push(record);return {samples,record};
}
function energy(samples,start,end){const selected=samples.slice(Math.round(start*16000),Math.round(end*16000));assert.ok(selected.length);return Math.sqrt(selected.reduce((sum,value)=>sum+value*value,0)/selected.length);}
// Keep video at zero so container origin does not erase the audio delay.
const delayed=path.join(root,'delayed.mkv');
await run(['-nostdin','-v','error','-n','-f','lavfi','-i','color=size=32x32:rate=10:duration=4','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=2','-filter_complex','[1:a]asetpts=PTS+1/TB[a]','-map','0:v','-map','[a]','-c:v','ffv1','-c:a','pcm_s16le',delayed]);
for(const [start,end] of [[0,3],[0.5,2],[1.5,2.5]]){const {samples,record}=await extract(delayed,start,end);if(start<1){assert.equal(energy(samples,0,1-start-0.05),0);assert.ok(energy(samples,1-start+0.05,end-start-0.05)>0.05);}else assert.ok(energy(samples,0.05,0.9)>0.05);record.delayPreserved=true;}
const gap=path.join(root,'gap.mkv');
await run(['-nostdin','-v','error','-n','-f','lavfi','-i','color=size=32x32:rate=10:duration=4','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=2','-filter_complex',"[1:a]asetnsamples=n=160,asetpts=PTS+gte(T\\,1)/TB[a]",'-map','0:v','-map','[a]','-c:v','ffv1','-c:a','pcm_s16le',gap]);
const gapped=await extract(gap,0,3);assert.ok(energy(gapped.samples,0.1,0.9)>0.05);assert.equal(energy(gapped.samples,1.1,1.9),0);assert.ok(energy(gapped.samples,2.1,2.9)>0.05);gapped.record.gapPreserved=true;
const sonoma=process.argv[2];
if(sonoma){
  const full=await extract(path.resolve(sonoma),0,190.866666);
  assert.ok(Math.abs(full.samples.length/16000-190.866666)<=1/16000);full.record.durationWithinOneSample=true;
  for(const [start,end] of [[0,60],[60,90],[160,190]]){
    const {samples,record}=await extract(path.resolve(sonoma),start,end);assert.ok(Math.abs(samples.length/16000-(end-start))<=1/16000);record.durationWithinOneSample=true;
    // Exclude the final resampler boundary: input decode ends at the requested end.
    const interior=samples.subarray(1600,samples.length-1600),reference=full.samples.subarray(start*16000+1600,end*16000-1600);
    assert.deepEqual(interior,reference);record.interiorMatchesFullSourceDecode=true;
  }
}
await writeFile(path.join(root,'evidence.json'),JSON.stringify({ffmpeg,recipe:3,results,scope:'Real production argument builder. Synthetic delayed tone and packet gap timing plus optional Sonoma duration/ranges; no speech recognition accuracy claim.'},null,2));
console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
