import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-black-depth-${randomUUID()}`);await mkdir(root);
const fixtures=[];
for(const depth of [8,10])for(const range of ['tv','pc']){
 const format=depth===8?'yuv420p':'yuv420p10le',scale=2**(depth-8),low=range==='tv'?16*scale:0,high=range==='tv'?235*scale:2**depth-1,neutral=128*scale;
 const file=path.join(root,`${depth}-${range}.mkv`);
 const filter=`nullsrc=s=160x90:r=30:d=4,format=${format},geq=lum='if(lt(mod(N,60),30),${low},${high})':cb=${neutral}:cr=${neutral},setparams=range=${range}`;
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i',filter,'-c:v','ffv1','-pix_fmt',format,'-color_range',range,file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
 const decoded=spawnSync('ffmpeg',['-nostdin','-v','error','-i',file,'-map','0:v:0','-pix_fmt',format,'-f','rawvideo','-'],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 assert.ifError(decoded.error);assert.equal(decoded.status,0,String(decoded.stderr));
 const frameBytes=160*90*3/2*(depth===8?1:2);assert.equal(decoded.stdout.length,frameBytes*120);
 const luma=[0,30,60,90].map(frame=>depth===8?decoded.stdout[frame*frameBytes]:decoded.stdout.readUInt16LE(frame*frameBytes));assert.deepEqual(luma,[low,high,low,high]);
 fixtures.push({file,id:await sha256File(file),depth,range,format,low,high,luma});
}
const client=new Client({name:'qc-black-depth-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const results=[];
try{
 await call('avid_index_media',{files:fixtures.map(f=>f.file)});
 for(const fixture of fixtures)for(const start of [0,0.5]){
  const end=start===0?4:3.5;
  const report=await call('avid_media_qc',{id:fixture.id,options:{start,end,audioStream:null,blackSeconds:0.5}});
  results.push({fixture,report});await writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2));
  assert.deepEqual(report.findings.black,[{start,end:1},{start:2,end:3}]);assert.equal(report.videoCoverage.decodedFrames,(end-start)*30);
  assert.equal(report.streamDetails.video.pix_fmt,fixture.format);assert.equal(report.streamDetails.video.color_range,fixture.range);
  const saved=await call('avid_read_qc_report',{id:fixture.id,revision:report.revision});assert.deepEqual(saved.report.findings.black,report.findings.black);
  assert.equal(await sha256File(fixture.file),fixture.id);
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Known black/white integer luma, 8/10-bit planar 4:2:0, full/limited ranges, FFV1 on this host. Not HDR EOTF, perceptual darkness, threshold boundary, alpha or camera-media qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,cases:results.length}));
}finally{await client.close();}
