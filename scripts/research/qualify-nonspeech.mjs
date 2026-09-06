import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`nonspeech-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'nonspeech-accuracy-probe',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:180000});
const results=[];
try{
 for(const [name,filter] of [['silence','anullsrc=r=16000:cl=mono'],['tone','sine=frequency=440:sample_rate=16000'],['noise','anoisesrc=color=white:seed=12345:sample_rate=16000:amplitude=0.1']]){
  const file=path.join(root,`${name}.wav`);
  const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i',filter,'-t','8','-ac','1','-c:a','pcm_s16le',file],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
  const id=await sha256File(file);const indexed=await call('avid_index_media',{files:[file]});assert.ok(!indexed.isError,JSON.stringify(indexed));
  const detection=await call('avid_detect_speech_language',{id,start:0,end:8});assert.ok(!detection.isError,JSON.stringify(detection));
  const transcription=await call('avid_transcribe_media',{id,start:0,end:8,options:{model:'tiny',language:'auto'}});
  const segments=transcription.structuredContent?.data?.segments??[];
  const words=segments.map(segment=>segment.text??'').join(' ').trim();
  assert.equal(await sha256File(file),id);
  results.push({name,file,sha256:id,referenceSpeech:false,detection,transcription,emittedText:words,hasFalseSpeechText:words.length>0});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({checkedAt:new Date().toISOString(),results,falseSpeechCases:results.filter(row=>row.hasFalseSpeechText).map(row=>row.name),scope:'Eight-second generated silence, sine and seeded white-noise negative probes. No real-world music/noise, language calibration or broad ASR accuracy claim.'},null,2));
 console.log(JSON.stringify({root,falseSpeechCases:results.filter(row=>row.hasFalseSpeechText).map(row=>row.name),results:results.map(row=>({name:row.name,emittedText:row.emittedText,error:row.transcription.isError??false}))}));
}finally{await client.close();}
