import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
assert.ok(process.argv.length===4||process.argv.length===5&&process.argv[4]==='--stress','Pass negative-probe evidence.json and positive-language evidence.json [--stress]');
const negatives=JSON.parse(await readFile(process.argv[2],'utf8')),positives=JSON.parse(await readFile(process.argv[3],'utf8'));
const fixtures=[...negatives.results.map(row=>({name:row.name,file:row.file,speech:false})),...positives.results.filter(row=>row.file).map(row=>({name:row.expected,file:row.file,speech:true}))];
const root=path.resolve('.avid-mcp-analysis',`speech-presence-${randomUUID()}`);await mkdir(root);
if(process.argv[4]==='--stress'){
 for(const fixture of [...fixtures].filter(row=>row.speech)){
  const originalHash=await sha256File(fixture.file);
  for(const variant of ['quiet','noise-mix']){
   const file=path.join(root,`${fixture.name}-${variant}.wav`);
   const effects=variant==='quiet'?['-af','volume=0.01']:['-f','lavfi','-i','anoisesrc=color=white:seed=54321:sample_rate=16000:amplitude=0.03','-filter_complex','[0:a][1:a]amix=inputs=2:duration=first:normalize=0'];
   const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',fixture.file,...effects,'-t','30','-ar','16000','-ac','1','-c:a','pcm_s16le',file],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
   fixtures.push({name:`${fixture.name}-${variant}`,file,speech:true,derivedFrom:fixture.file,originalHash});
  }
  assert.equal(await sha256File(fixture.file),originalHash);
 }
}
const client=new Client({name:'speech-presence-probe',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[...new Set(fixtures.map(row=>path.dirname(row.file)))].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const results=[];
try{
 for(const fixture of fixtures){
  const id=await sha256File(fixture.file),probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',fixture.file],{timeoutMs:10000});assert.equal(probe.exitCode,0);
  const end=Math.min(30,Number(JSON.parse(probe.stdout).format.duration));await call('avid_index_media',{files:[fixture.file]});
  const generated=await call('avid_diarize_audio',{id,start:0,end}),analysis=await call('avid_speaker_analysis',{analysisId:generated.analysisId,limit:100});
  assert.equal(analysis.speechPresence.verified,false);assert.equal(analysis.speechPresence.start,0);
  assert.ok(analysis.speechPresence.coveredSeconds>=0&&analysis.speechPresence.coveredSeconds<=analysis.analyzedSeconds);
  assert.equal(analysis.speechPresence.status,analysis.totalSpans?'spans_present':'no_spans_in_analyzed_audio');
  assert.equal(await sha256File(fixture.file),id);
  results.push({...fixture,id,end,generated,analysis,detectedAnySpeech:analysis.totalSpans>0});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Existing anonymous diarization segmentation on synthetic negatives and speech positives, optionally including quiet/noise-mixed derivatives. Not a calibrated VAD benchmark or automatic transcription gate.'},null,2));
 console.log(JSON.stringify({root,results:results.map(row=>({name:row.name,referenceSpeech:row.speech,spans:row.analysis.totalSpans}))}));
}finally{await client.close();}
