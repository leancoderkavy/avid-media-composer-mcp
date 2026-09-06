import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
assert.equal(process.argv.length,4,'Pass negative-probe evidence.json and positive-language evidence.json');
const negatives=JSON.parse(await readFile(process.argv[2],'utf8')),positives=JSON.parse(await readFile(process.argv[3],'utf8'));
const fixtures=[...negatives.results.map(row=>({name:row.name,file:row.file,speech:false})),...positives.results.filter(row=>row.file).map(row=>({name:row.expected,file:row.file,speech:true}))];
const root=path.resolve('.avid-mcp-analysis',`speech-presence-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'speech-presence-probe',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[...new Set(fixtures.map(row=>path.dirname(row.file)))].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const results=[];
try{
 for(const fixture of fixtures){
  const id=await sha256File(fixture.file),probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',fixture.file],{timeoutMs:10000});assert.equal(probe.exitCode,0);
  const end=Math.min(30,Number(JSON.parse(probe.stdout).format.duration));await call('avid_index_media',{files:[fixture.file]});
  const generated=await call('avid_diarize_audio',{id,start:0,end}),analysis=await call('avid_speaker_analysis',{analysisId:generated.analysisId,limit:100});
  assert.equal(await sha256File(fixture.file),id);
  results.push({...fixture,id,end,generated,analysis,detectedAnySpeech:analysis.totalSpans>0});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Existing anonymous diarization segmentation on three synthetic negatives and two synthetic speech positives. Not a calibrated VAD benchmark or automatic transcription gate.'},null,2));
 console.log(JSON.stringify({root,results:results.map(row=>({name:row.name,referenceSpeech:row.speech,spans:row.analysis.totalSpans}))}));
}finally{await client.close();}
