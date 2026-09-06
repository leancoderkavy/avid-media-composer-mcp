import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const input=process.argv[2];assert.ok(input,'Pass non-speech evidence.json');
const prior=JSON.parse(await readFile(input,'utf8')),fixtures=prior.results.filter(row=>row.hasFalseSpeechText);
assert.ok(fixtures.length,'No false-speech cases to review');
const root=path.resolve('.avid-mcp-analysis',`nonspeech-review-${randomUUID()}`);await mkdir(root);
async function connect(readOnly){const client=new Client({name:'nonspeech-review-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[...new Set(fixtures.map(row=>path.dirname(row.file)))].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:readOnly?'inspect':'inspect,export,project-write',...(!readOnly?{AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models')}:{})}}));return client;}
let client=await connect(false);const records=[];
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 for(const fixture of fixtures){
  const transcript=fixture.transcription.structuredContent.data,id=await sha256File(fixture.file);assert.equal(id,fixture.sha256);
  await call('avid_index_media',{files:[fixture.file]});
  const imported=await call('avid_import_transcript',{id,segments:transcript.segments}),hash=await sha256File(imported.path);
  const analysis=await call('avid_diarize_audio',{id,start:0,end:8});
  records.push({name:fixture.name,file:fixture.file,id,imported,hash,analysis});
 }
 await client.close();client=await connect(true);
 for(const record of records){
  const alignment=await call('avid_align_speakers',{analysisId:record.analysis.analysisId,analysisSha256:record.analysis.sha256,transcriptRevision:record.imported.revision,transcriptSha256:record.hash});
  assert.ok(alignment.segments.length);assert.ok(alignment.segments.every(segment=>segment.status==='no_speech_overlap'&&segment.speechSeconds===0&&segment.candidates.length===0));
  assert.equal(await sha256File(record.imported.path),record.hash);assert.equal(await sha256File(record.file),record.id);record.alignment=alignment;
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({records,scope:'Actual false-transcript revisions reviewed against empty diarization evidence after inspect-only reconnect. Text preserved; no automatic suppression or proof of no speech in arbitrary recordings.'},null,2));
 console.log(JSON.stringify({root,reviewed:records.map(row=>row.name)}));
}finally{await client.close();}
