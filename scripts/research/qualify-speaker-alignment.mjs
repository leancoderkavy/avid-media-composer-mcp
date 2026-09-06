import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`speaker-alignment-${randomUUID()}`);await mkdir(root);
const priorFile=path.resolve('.avid-mcp-analysis/speech-resume-32036e5b-65be-4be4-b9e1-8d0341ba6909/evidence.json'),prior=JSON.parse(await readFile(priorFile,'utf8')).completed.result;
const original=JSON.parse(await readFile(prior.path,'utf8'));assert.equal(original.id,id);assert.deepEqual(original.segments,prior.segments);
const connect=async(readOnly=false)=>{const client=new Client({name:'speaker-alignment-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:readOnly?'inspect':'inspect,export,project-write',...(!readOnly?{AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models')}:{AVID_MCP_MODEL_DIR:''}),...(process.env.AVID_MCP_FFMPEG?{AVID_MCP_FFMPEG:process.env.AVID_MCP_FFMPEG}:{})}}));return client;};
let client=await connect();
const raw=(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:120000});
const call=async(name,args)=>{const response=await raw(name,args);assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
function union(intervals){const sorted=intervals.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);let sum=0,start=0,end=0;for(const [a,b] of sorted){if(a>end){sum+=end-start;start=a;end=b;}else end=Math.max(end,b);}return sum+end-start;}
try{
  await call('avid_index_media',{files:[source]});
  const transcript=await call('avid_import_transcript',{id,segments:original.segments}),transcriptSha256=await sha256File(transcript.path);
  const analysis=await call('avid_diarize_audio',{id,start:60,end:125,options:{speakers:2,threshold:0.5}});
  const reference={analysisId:analysis.analysisId,analysisSha256:analysis.sha256,transcriptRevision:transcript.revision,transcriptSha256};
  await client.close();client=await connect(true);
  const pages=[];let after=-1;do{const page=await call('avid_align_speakers',{...reference,after,limit:3,candidateLimit:1});pages.push(page);after=page.nextAfter;}while(after!==null);
  const aligned=pages.flatMap(page=>page.segments),expected=original.segments.map((segment,index)=>({segment,index})).filter(({segment})=>segment.start<125&&segment.end>60);assert.ok(aligned.length>3);assert.deepEqual(aligned.map(value=>value.index),expected.map(value=>value.index));
  for(const value of aligned){
    assert.deepEqual(value.segment,original.segments[value.index]);
    const intervals=analysis.spans.map(span=>[Math.max(span.start,value.segment.start),Math.min(span.end,value.segment.end)]);
    assert.ok(Math.abs(value.speechSeconds-union(intervals))<1e-9);
    for(const candidate of value.candidates){const times=analysis.spans.filter(span=>span.speaker===candidate.speaker).map(span=>[Math.max(span.start,value.segment.start),Math.min(span.end,value.segment.end)]);assert.ok(Math.abs(candidate.overlapSeconds-union(times))<1e-9);}
  }
  assert.equal((await raw('avid_align_speakers',{...reference,analysisSha256:'0'.repeat(64)})).isError,true);assert.equal((await raw('avid_align_speakers',{...reference,transcriptSha256:'0'.repeat(64)})).isError,true);
  assert.equal(await sha256File(transcript.path),transcriptSha256);assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({reference,analysis,pages,sourceUnchanged:true,transcriptUnchanged:true,inspectOnlyWithoutModelDirectory:true,originalMachineTranscriptEvidence:priorFile,scope:'Actual Sonoma MCP interval alignment against a saved machine transcript; independent interval-union arithmetic checks, pagination and stale references. Transcript contains repetitions and is not a labelled accuracy reference; no word attribution or speaker identity acceptance.'},null,2));console.log(JSON.stringify({passed:true,segments:aligned.length,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
