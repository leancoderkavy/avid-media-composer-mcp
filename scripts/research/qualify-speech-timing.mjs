import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
import {alignSpeakerSegment} from '../../dist/library/speaker-alignment.js';
assert.equal(process.argv.length,3,'Pass positive-language evidence.json');
const positives=JSON.parse(await readFile(process.argv[2],'utf8')).results.filter(row=>row.file);
assert.ok(positives.length>0);
const root=path.resolve('.avid-mcp-analysis',`speech-timing-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'speech-timing-probe',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 for(const [index,fixture] of positives.entries()){
  const sourceHash=await sha256File(fixture.file),file=path.join(root,`positive-${index}.wav`);
  const probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',fixture.file],{timeoutMs:10000});assert.equal(probe.exitCode,0);
  const duration=Number(JSON.parse(probe.stdout).format.duration);assert.ok(duration>0&&duration<25);
  const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',fixture.file,'-af','adelay=2000:all=1,apad=pad_dur=2','-ar','16000','-ac','1','-c:a','pcm_s16le',file],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
  const pcmFile=path.join(root,`positive-${index}.pcm`),decoded=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',file,'-f','s16le','-acodec','pcm_s16le',pcmFile],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(decoded.exitCode,0,decoded.stderr);
  const pcm=await readFile(pcmFile),paddingBytes=2*16000*2;
  assert.ok(pcm.length>paddingBytes*2);
  assert.ok(pcm.subarray(0,paddingBytes).every(value=>value===0),'Leading reference must be digital silence');
  assert.ok(pcm.subarray(-paddingBytes).every(value=>value===0),'Trailing reference must be digital silence');
  const id=await sha256File(file);await call('avid_index_media',{files:[file]});
  const record=await call('avid_diarize_audio',{id,start:0,end:duration+4}),analysis=await call('avid_speaker_analysis',{analysisId:record.analysisId,limit:100});
  assert.equal(analysis.nextOffset,null,'Benchmark requires complete span retrieval');
  const range={start:0,end:analysis.analyzedSeconds};
  const windows=[{name:'leading-silence',start:0,end:2},{name:'speech-container',start:2,end:duration+2},{name:'trailing-silence',start:duration+2,end:duration+4}];
  const coverage=windows.map(window=>({window,...alignSpeakerSegment(window,range,analysis.spans,0)}));
  assert.equal(await sha256File(file),id);assert.equal(await sha256File(fixture.file),sourceHash);
  results.push({language:fixture.expected,source:fixture.file,sourceHash,file,id,duration,paddingVerifiedPcm:true,record,analysis,coverage});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Known two-second digital silence before and after synthetic speech. Speech-container coverage is not word recall: source fixtures may contain natural pauses. Report silence overlap without imposing an uncalibrated acceptance threshold.'},null,2));
 console.log(JSON.stringify({root,results:results.map(row=>({language:row.language,spans:row.analysis.totalSpans,coverage:row.coverage.map(item=>({window:item.window.name,seconds:item.speechSeconds,fraction:item.speechFractionOfSegment}))}))}));
}finally{await client.close();}
