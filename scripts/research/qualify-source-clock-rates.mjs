// Fractional-rate preparation evidence using owned derivatives of the Sonoma MP4.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const original='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const originalSha256='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(original),originalSha256);
const root=path.resolve('.avid-mcp-analysis',`source-clock-rates-${randomUUID()}`);await mkdir(root);
const ffmpeg=process.env.AVID_MCP_FFMPEG??'ffmpeg',ffprobe=process.env.AVID_MCP_FFPROBE??'ffprobe';
const run=async(binary,args)=>{const result=await runProcess(binary,args,{timeoutMs:120000,maxOutputBytes:8*1024*1024});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
const client=new Client({name:'source-clock-rate-qualification',version:'1.0'});
const evidence={original,originalSha256,results:[],limitations:['Owned short reencoded derivatives; no original footage rate conversion claim','Preparation preserves each video rate; not mixed-rate Avid timeline qualification','No color, perceptual sync or long-media acceptance']};
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export',AVID_MCP_COMMAND_TIMEOUT_MS:'120000',AVID_MCP_FFMPEG:ffmpeg,AVID_MCP_FFPROBE:ffprobe}}));
try{
  for(const rate of ['24000/1001','25','30000/1001']){
    const file=path.join(root,`fixture-${rate.replace('/','-')}.mp4`);
    await run(ffmpeg,['-nostdin','-v','error','-n','-ss','95','-i',original,'-t','2','-map','0:v:0','-map','0:a:0','-vf',`scale=320:180,fps=${rate}`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2',file]);
    const expectedSha256=await sha256File(file);
    const result=await client.callTool({name:'avid_prepare_source_clock_media',arguments:{options:{file,expectedSha256,videoStream:0,audioStream:1}}},undefined,{timeout:180000});
    evidence.results.push({rate,file,expectedSha256,result});
    await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));
    assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
    assert.equal(data.verified,true);assert.equal(data.hostImportVerified,false);
    const video=data.prepared.streams.find(s=>s.codec_type==='video');
    assert.equal(video.avg_frame_rate,rate.includes('/')?rate:`${rate}/1`);
    const decode=JSON.parse(await run(ffprobe,['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',data.output]));
    assert.equal(Number(decode.streams[0].nb_read_frames),Number(video.nb_frames));
    assert.equal(await sha256File(file),expectedSha256);assert.equal(await sha256File(data.output),data.outputSha256);
    Object.assign(evidence.results.at(-1),{decodedFrames:Number(decode.streams[0].nb_read_frames),sourceUnchanged:true,outputHashVerified:true});
  }
  assert.equal(await sha256File(original),originalSha256);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({...evidence,ok:true,originalUnchanged:true},null,2));
  console.log(JSON.stringify({ok:true,root,rates:evidence.results.map(r=>({rate:r.rate,frames:r.decodedFrames}))}));
}finally{await client.close();}
