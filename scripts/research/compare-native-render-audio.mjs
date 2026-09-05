// Inspect the existing owned Sonoma two-cut export; never changes media or Avid.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const render=path.resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&path.extname(render).toLowerCase()==='.mp4');
assert.ok(process.argv.slice(3).every(value=>value==='--require-source-clock-stereo'));
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceSha256=await sha256File(source),renderSha256=await sha256File(render);
assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root=path.join(path.dirname(render),`audio-comparison-${randomUUID()}`);await mkdir(root);
const run=async(exe,args)=>{const result=await runProcess(exe,args,{timeoutMs:120000,maxOutputBytes:1048576});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
for(const file of [source,render]){
  const streams=JSON.parse(await run('ffprobe',['-v','error','-select_streams','a','-show_streams','-of','json',file])).streams;
  assert.equal(streams.length,1);assert.equal(streams[0].channels,2);assert.equal(Number(streams[0].sample_rate),48000);
}
const sourceFilter='[0:a:0]aresample=48000:async=1:first_pts=0,asplit=2[a][b];[a]atrim=start=95:end=97,asetpts=PTS-STARTPTS[x];[b]atrim=start=110:end=112,asetpts=PTS-STARTPTS[y];[x][y]concat=n=2:v=0:a=1[out]';
const extract=async(file,name,filter)=>{
  const output=path.join(root,name);
  const args=['-nostdin','-v','error','-n','-i',file,...(filter?['-filter_complex',filter,'-map','[out]']:['-map','0:a:0']),'-c:a','pcm_f32le','-f','f32le',output];
  await run('ffmpeg',args);const bytes=await readFile(output);assert.equal(bytes.length,192000*2*4);
  const values=Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));assert.ok(values.every(Number.isFinite));return values;
};
const a=await extract(source,'source-cuts.f32',sourceFilter),b=await extract(render,'render.f32');
function compare(start,end,sourceChannel,renderChannel,lag=0,stride=1){
  let aa=0,bb=0,ab=0,sumA=0,sumB=0,error=0,count=0;
  for(let i=start;i<end;i+=stride){const x=a[i*2+sourceChannel],y=b[(i+lag)*2+renderChannel];aa+=x*x;bb+=y*y;ab+=x*y;sumA+=x;sumB+=y;error+=(x-y)**2;count++;}
  const denom=Math.sqrt(Math.max(0,aa-sumA**2/count)*Math.max(0,bb-sumB**2/count));
  return {correlation:denom>0?Math.max(-1,Math.min(1,(ab-sumA*sumB/count)/denom)):null,gain:aa>0?ab/aa:null,rmse:Math.sqrt(error/count),sourceRms:Math.sqrt(aa/count),renderRms:Math.sqrt(bb/count),samples:count};
}
const cuts=[];
for(let cut=0;cut<2;cut++){
  const start=cut*96000,end=start+96000,pairs=[];
  for(let sourceChannel=0;sourceChannel<2;sourceChannel++)for(let renderChannel=0;renderChannel<2;renderChannel++){
    const zeroLag=compare(start,end,sourceChannel,renderChannel);
    let best={lagSamples:0,...compare(start+4800,end-4800,sourceChannel,renderChannel,0,8)};
    for(let lag=-4800;lag<=4800;lag+=48){const candidate=compare(start+4800,end-4800,sourceChannel,renderChannel,lag,8);if((candidate.correlation??-2)>(best.correlation??-2))best={lagSamples:lag,...candidate};}
    const coarse=best.lagSamples;
    best={lagSamples:coarse,...compare(start+4800,end-4800,sourceChannel,renderChannel,coarse)};
    for(let lag=Math.max(-4800,coarse-48);lag<=Math.min(4800,coarse+48);lag++){const candidate=compare(start+4800,end-4800,sourceChannel,renderChannel,lag);if((candidate.correlation??-2)>(best.correlation??-2))best={lagSamples:lag,...candidate};}
    pairs.push({sourceChannel,renderChannel,zeroLag,bestLag:best});
  }
  cuts.push({cut,sourceStartSeconds:cut===0?95:110,pairs});
}
const hashArgs=['-c:a','pcm_s24le','-f','hash','-hash','sha256','pipe:1'];
const expectedPcm24Hash=(await run('ffmpeg',['-nostdin','-v','error','-i',source,'-filter_complex',sourceFilter,'-map','[out]',...hashArgs])).trim();
const renderedPcm24Hash=(await run('ffmpeg',['-nostdin','-v','error','-i',render,'-map','0:a:0',...hashArgs])).trim();
assert.equal(await sha256File(source),sourceSha256);assert.equal(await sha256File(render),renderSha256);
const report={source,render,sourceSha256,renderSha256,sourceUnchanged:true,renderUnchanged:true,
  expectedPcm24Hash,renderedPcm24Hash,pcm24SourceClockExactMatch:expectedPcm24Hash===renderedPcm24Hash,
  renderedChannelsIdentical:b.every((value,index)=>index%2===1||value===b[index+1]),
  sourceChannelsIdentical:a.every((value,index)=>index%2===1||value===a[index+1]),
  method:'Source-clock PCM extraction at 48 kHz; each two-second cut compares all channel pairs. Lag search +/-100ms excludes 100ms at each edge, coarse 1ms then nearby single-sample search. Positive lag means matching rendered samples occur later.',
  limitations:['Correlation and fitted gain are diagnostics, not perceptual sync or routing conformance.','A best lag at the search boundary requires wider investigation.','Highly similar channels cannot independently establish channel identity.'],cuts};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
if(process.argv.includes('--require-source-clock-stereo')){assert.equal(report.pcm24SourceClockExactMatch,true);assert.equal(report.renderedChannelsIdentical,false);}
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),pcm24SourceClockExactMatch:report.pcm24SourceClockExactMatch,renderedChannelsIdentical:report.renderedChannelsIdentical,cuts}));
