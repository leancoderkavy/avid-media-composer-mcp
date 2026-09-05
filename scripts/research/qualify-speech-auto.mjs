import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorPath=process.argv[2];assert.ok(priorPath,'Pass language-detection evidence.json');const prior=JSON.parse(await readFile(priorPath,'utf8')),root=path.resolve('.avid-mcp-analysis',`speech-auto-${randomUUID()}`);await mkdir(root);
const silence=path.join(root,'silence.wav'),generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','2',silence],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(generated.exitCode,0);
const fixtures=prior.results.filter(row=>row.file).map(row=>({file:row.file,expected:row.expected}));fixtures.push({file:silence,expected:null});
const client=new Client({name:'auto-transcription-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[...new Set(fixtures.map(row=>path.dirname(row.file)))].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 const results=[];
 for(const fixture of fixtures){
  const id=await sha256File(fixture.file);await call('avid_index_media',{files:[fixture.file]});const [entry]=await call('avid_library_metadata',{ids:[id]}),end=Math.min(30,Number(entry.metadata.format.duration));
  if(fixture.expected===null){const response=await client.callTool({name:'avid_transcribe_media',arguments:{id,start:0,end,options:{model:'tiny',language:'auto'}}});assert.equal(response.isError,true);assert.ok(JSON.stringify(response).includes('SPEECH_LANGUAGE_UNDETERMINED'));results.push({silenceRejected:true});}
  else{
   const automatic=await call('avid_transcribe_media',{id,start:0,end,options:{model:'tiny',language:'auto'}}),explicit=await call('avid_transcribe_media',{id,start:0,end,options:{model:'tiny',language:fixture.expected}});
   assert.equal(automatic.language,fixture.expected);assert.equal(automatic.languageSelection,'model_candidate');assert.equal(automatic.languageDetectionVerified,false);assert.deepEqual(automatic.segments,explicit.segments);
   const status=await call('avid_speech_run',{runId:automatic.runId});assert.deepEqual(status.languageDecision,automatic.languageDecision);results.push({automatic,explicit,identicalSegments:true,persistedDecision:true});
  }
  assert.equal(await sha256File(fixture.file),id);
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({priorPath,results,sourceUnchanged:true,scope:'Actual multilingual auto transcription matches explicit-language output on known English/Mandarin synthetic voices and rejects digital silence; no broad language or transcription accuracy claim.'},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
