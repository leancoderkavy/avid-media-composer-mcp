// Full-raster diagnostics for the two existing Sonoma render variants.
// No media, range tags, editor state or preset is changed.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const variants=[
 {name:'native',file:path.resolve('.avid-mcp-analysis/native-render-mcp-e0f60e5d-67c3-49ac-9ba0-7de71d73453c/native-export-2984bde7-47e5-4d40-a287-886f9aeb454d/export/render.mp4'),sha256:'8fd3fb4c04d24f3fd2200e600dab3e16edb1ad0329384a6814d1cb22d5f85cc0'},
 {name:'tagged',file:path.resolve('.avid-mcp-analysis/render-range-tags-7a26beb3-2085-44f1-97f5-bdb413f52ace/render-full-range.mp4'),sha256:'c6e125caaeb2c2321f8fd7f762447c0621bbf325d1b528ca9140b914f56d5bca'}
];
const sourceSha256=await sha256File(source);assert.equal(sourceSha256,'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
for(const variant of variants)assert.equal(await sha256File(variant.file),variant.sha256);
const root=path.resolve('.avid-mcp-analysis',`full-resolution-${randomUUID()}`);await mkdir(root);
const results=[];
for(const variant of variants){
 const filter=`[0:v:0]select=between(n\\,2849\\,2908)+between(n\\,3299\\,3358),setpts=N/(30*TB),scale=1920:1080:flags=lanczos:in_range=pc:out_range=pc:in_color_matrix=bt709,format=gbrp,split=2[r1][r2];[1:v:0]setpts=N/(30*TB),format=gbrp,split=2[t1][t2];[t1][r1]ssim=stats_file=${variant.name}-ssim.log:shortest=1[s];[t2][r2]psnr=stats_file=${variant.name}-psnr.log:shortest=1[p]`;
 const args=['-nostdin','-hide_banner','-v','info','-i',source,'-i',variant.file,'-filter_complex',filter,'-map','[s]','-map','[p]','-an','-fps_mode','passthrough','-f','null','-'];
 await writeFile(path.join(root,`${variant.name}-command.json`),JSON.stringify({executable:'ffmpeg',args,cwd:root},null,2),{flag:'wx'});
 const process=await runProcess('ffmpeg',args,{cwd:root,timeoutMs:120000,maxOutputBytes:1048576});
 await writeFile(path.join(root,`${variant.name}-decode.log`),process.stderr,{flag:'wx'});assert.equal(process.exitCode,0,process.stderr.slice(-2000));
 const ssim=(await readFile(path.join(root,`${variant.name}-ssim.log`),'utf8')).trim().split(/\r?\n/);
 const psnr=(await readFile(path.join(root,`${variant.name}-psnr.log`),'utf8')).trim().split(/\r?\n/);
 assert.equal(ssim.length,120);assert.equal(psnr.length,120);
 const frames=ssim.map((line,index)=>{
  assert.equal(Number(line.match(/n:(\d+)/)?.[1]),index+1);assert.equal(Number(psnr[index].match(/n:(\d+)/)?.[1]),index+1);
  const structural=Number(line.match(/All:([\d.]+)/)?.[1]),mse=Number(psnr[index].match(/mse_avg:([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(structural)&&structural>=0&&structural<=1&&Number.isFinite(mse)&&mse>=0);
  return {outputFrame:index,sourceFrame:index<60?2849+index:3299+index-60,ssim:structural,mse};
 });
 const meanMse=frames.reduce((sum,frame)=>sum+frame.mse,0)/120;
 results.push({...variant,frames,meanSsim:frames.reduce((sum,frame)=>sum+frame.ssim,0)/120,minSsim:Math.min(...frames.map(frame=>frame.ssim)),rgbRmse:Math.sqrt(meanMse),aggregatePsnrDb:meanMse?10*Math.log10(255**2/meanMse):null,cutBoundary:frames.filter(frame=>[59,60].includes(frame.outputFrame))});
}
assert.equal(await sha256File(source),sourceSha256);for(const variant of variants)assert.equal(await sha256File(variant.file),variant.sha256);
const report={source,sourceSha256,filesUnchanged:true,results,method:'All 120 frames at 1920x1080 planar 8-bit RGB, ordinary render metadata interpretation, matching source presentation-time frame indices, source upscaled with Lanczos. Per-frame SSIM/MSE and PSNR from aggregate MSE.',limitations:['Avid and Lanczos scaling kernels may differ.','SSIM/PSNR do not certify perceptual quality or color mastering.','Only the owned four-second two-cut fixture is covered.','Native preset and files remain unchanged.']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),results:results.map(({name,meanSsim,minSsim,rgbRmse,aggregatePsnrDb,cutBoundary})=>({name,meanSsim,minSsim,rgbRmse,aggregatePsnrDb,cutBoundary})),filesUnchanged:true}));
