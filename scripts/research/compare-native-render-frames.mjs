// Diagnostic only: compare every frame of the owned two-cut Sonoma fixture.
// No export, host mutation, automatic color correction or conformance assertion.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const render = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2] && path.extname(render).toLowerCase() === '.mp4', 'Supply the existing four-second Sonoma render');
assert.ok(process.argv.slice(3).every(value=>['--render-range-full','--repeat-first-cut'].includes(value)),'Unsupported diagnostic option');
const sourceStarts=process.argv.includes('--repeat-first-cut')?[2850,2850]:[2850,3300];
const renderRangeFull=process.argv.includes('--render-range-full');
const source = 'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceSha256 = await sha256File(source), renderSha256 = await sha256File(render);
assert.equal(sourceSha256, '3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root = path.join(path.dirname(render), `frame-comparison-${randomUUID()}`);
await mkdir(root);
const run = async (executable, args, maxOutputBytes = 1048576) => {
  const result = await runProcess(executable, args, {timeoutMs:120000, maxOutputBytes});
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
};
const probe = async file => JSON.parse(await run('ffprobe', ['-v','error','-show_streams','-of','json',file]));
const original = await probe(source), output = await probe(render);
assert.equal(original.streams.find(stream=>stream.codec_type==='video').avg_frame_rate,'30/1');
const video = output.streams.find(stream => stream.codec_type === 'video');
assert.equal(Number(video.nb_frames), 120);
assert.equal(video.avg_frame_rate, '30/1');
assert.equal(video.width, 1920); assert.equal(video.height, 1080);
const sourceFrames = [...Array.from({length:66}, (_,i) => 2847+i), ...Array.from({length:66}, (_,i) => 3297+i)];
const selection = 'select=between(n\\,2847\\,2912)+between(n\\,3297\\,3362),';
const extract = async (input, name, filter, forceFull=false) => {
  const destination = path.join(root, name);
  await run('ffmpeg', ['-nostdin','-v','error','-n','-i',input,'-map','0:v:0','-an','-vf',`${filter}scale=96:54:flags=area${forceFull?':in_range=pc':''},format=rgb24`,'-fps_mode','passthrough','-f','rawvideo',destination]);
  return readFile(destination);
};
const sourcePixels = await extract(source, 'source.rgb', selection);
const renderPixels = await extract(render, 'render.rgb', '',renderRangeFull);
const sourceTimestamps=JSON.parse(await run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',source])).frames;
const frameBytes = 96*54*3;
assert.equal(sourcePixels.length, sourceFrames.length*frameBytes);
assert.equal(renderPixels.length, 120*frameBytes);
const pixels = (buffer, index) => buffer.subarray(index*frameBytes, (index+1)*frameBytes);
function compare(a,b) {
  let squaredError=0, sourceMean=0, renderMean=0, cross=0, sourceSquares=0, renderSquares=0;
  for(let i=0;i<a.length;i++) {
    squaredError+=(a[i]-b[i])**2; sourceMean+=a[i]; renderMean+=b[i];
    cross+=a[i]*b[i]; sourceSquares+=a[i]**2; renderSquares+=b[i]**2;
  }
  const denominator=Math.sqrt(Math.max(0,sourceSquares-sourceMean**2/a.length)*Math.max(0,renderSquares-renderMean**2/a.length));
  return {rmse:Math.sqrt(squaredError/a.length), meanRgbShift:(renderMean-sourceMean)/a.length,
    correlation:denominator>0 ? (cross-sourceMean*renderMean/a.length)/denominator : null};
}
const frames=[];
for(let index=0;index<120;index++) {
  const expectedSourceFrame=sourceStarts[index<60?0:1]+(index%60);
  const candidates=[];
  for(let offset=-3;offset<=3;offset++) {
    const sourceFrame=expectedSourceFrame+offset;
    candidates.push({sourceFrame,offset,...compare(pixels(sourcePixels,sourceFrames.indexOf(sourceFrame)),pixels(renderPixels,index))});
  }
  const expected=candidates.find(candidate=>candidate.offset===0);
  candidates.sort((a,b)=>(b.correlation??-2)-(a.correlation??-2));
  const intendedSourceSeconds=expectedSourceFrame/30;
  const bestSourceTimestamp=Number(sourceTimestamps[candidates[0].sourceFrame]?.best_effort_timestamp_time);
  assert.ok(Number.isFinite(bestSourceTimestamp));
  frames.push({outputFrame:index,expectedSourceFrame,intendedSourceSeconds,bestSourceTimestamp,
    bestTimestampResidualSeconds:bestSourceTimestamp-intendedSourceSeconds,
    expected,best:candidates[0],correlationMargin:candidates[0].correlation===null||candidates[1].correlation===null ? null : candidates[0].correlation-candidates[1].correlation});
}
const checksums = await run('ffmpeg',['-nostdin','-v','error','-i',render,'-map','0:v:0','-map','0:a?','-f','framemd5','pipe:1']);
await writeFile(path.join(root,'decoded.framemd5'),checksums,{flag:'wx'});
assert.equal(await sha256File(source),sourceSha256);
assert.equal(await sha256File(render),renderSha256);
const audio = streams=>streams.filter(stream=>stream.codec_type==='audio').map(({codec_name,channels,sample_rate})=>({codec:codec_name,channels,sampleRate:sample_rate}));
const report={source,render,sourceSha256,renderSha256,sourceStarts,sourceUnchanged:true,renderUnchanged:true,
  renderDecodeRange:renderRangeFull?'forced-full-diagnostic':'declared-metadata',
  method:'Zero-based decoded frames, 96x54 area-resampled RGB, expected source plus/minus three frames; highest Pearson correlation across RGB samples. Diagnostic ranking, not a fidelity pass or automatic correction.',
  expectedBestCount:frames.filter(frame=>frame.best.offset===0).length,
  bestOffsets:frames.reduce((counts,frame)=>{counts[frame.best.offset]=(counts[frame.best.offset]??0)+1;return counts;},{}),
  meanExpectedRmse:frames.reduce((sum,frame)=>sum+frame.expected.rmse,0)/120,
  meanExpectedRgbShift:frames.reduce((sum,frame)=>sum+frame.expected.meanRgbShift,0)/120,
  meanBestRmse:frames.reduce((sum,frame)=>sum+frame.best.rmse,0)/120,
  meanBestRgbShift:frames.reduce((sum,frame)=>sum+frame.best.meanRgbShift,0)/120,
  sourceVideoStartTime:original.streams.find(stream=>stream.codec_type==='video').start_time,
  maxBestTimestampResidualSeconds:Math.max(...frames.map(frame=>Math.abs(frame.bestTimestampResidualSeconds))),
  sourceAudio:audio(original.streams),renderAudio:audio(output.streams),
  decodedFrameChecksumSha256:await sha256File(path.join(root,'decoded.framemd5')),
  limitations:['Downsampling and correlation cannot establish exact frame or color conformance.','Repeated or near-identical frames can make rankings ambiguous.','Audio waveform, channel routing and perceptual sync are not compared.'],frames};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),renderDecodeRange:report.renderDecodeRange,expectedBestCount:report.expectedBestCount,bestOffsets:report.bestOffsets,maxBestTimestampResidualSeconds:report.maxBestTimestampResidualSeconds,meanBestRmse:report.meanBestRmse,meanBestRgbShift:report.meanBestRgbShift,meanExpectedRmse:report.meanExpectedRmse,meanExpectedRgbShift:report.meanExpectedRgbShift,sourceAudio:report.sourceAudio,renderAudio:report.renderAudio,decodedFrameChecksumSha256:report.decodedFrameChecksumSha256}));
