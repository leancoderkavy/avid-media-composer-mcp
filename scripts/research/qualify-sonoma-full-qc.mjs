import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
assert.equal(await sha256File(file),id);
const root=path.resolve('.avid-mcp-analysis',`sonoma-full-qc-${randomUUID()}`);await mkdir(root);
const probed=await runProcess('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames:format=start_time,duration','-of','json',file],{timeoutMs:120000,maxOutputBytes:1048576});assert.equal(probed.exitCode,0,probed.stderr);
const probe=JSON.parse(probed.stdout),end=Number(probe.format.duration),frames=Number(probe.streams[0].nb_read_frames);assert.equal(Number(probe.format.start_time),0);assert.ok(end>0&&end<=600&&Number.isSafeInteger(frames)&&frames>0);
const client=new Client({name:'sonoma-full-qc-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(file),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:240000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[file]});const report=await call('avid_media_qc',{id,options:{end}});
 await writeFile(path.join(root,'report-copy.json'),JSON.stringify(report,null,2),{flag:'wx'});
 assert.equal(report.videoCoverage.decodedFrames,frames);
 const saved=await call('avid_read_qc_report',{id,revision:report.revision});assert.deepEqual(saved.report.findings,report.findings);assert.deepEqual(saved.report.audioTiming,report.audioTiming);
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({probe,report,savedReportSha256:saved.sha256,sourceUnchanged:true,scope:'Full declared Sonoma preview range; independent total video-frame decode and persisted QC readback. Audio amounts/timestamps are QC observations, not independently requalified here. No perceptual sync, playback, HDR or delivery verdict.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,end,frames,black:report.findings.black.length,freeze:report.findings.freeze.length,silence:report.findings.silence.length,audioSamples:report.audioCoverage.samplesPerChannel}));
}finally{await client.close();}
