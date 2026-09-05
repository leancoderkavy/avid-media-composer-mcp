import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorRoot=path.resolve('.avid-mcp-analysis/speaker-alignment-e03bb90d-246b-48dd-9ce8-ee64746f7266'),prior=JSON.parse(await readFile(path.join(priorRoot,'evidence.json'),'utf8'));
const root=path.resolve('.avid-mcp-analysis',`speaker-assignments-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),reference=prior.reference;
const parentFile=path.join(priorRoot,'avid-mcp-library',`${id}.transcript-${reference.transcriptRevision}.json`),parent=JSON.parse(await readFile(parentFile,'utf8'));assert.equal(await sha256File(parentFile),reference.transcriptSha256);
const connect=async(readOnly=false)=>{const client=new Client({name:'speaker-assignment-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:priorRoot,AVID_MCP_MODEL_DIR:'',AVID_MCP_CAPABILITIES:readOnly?'inspect':'inspect,project-write'}}));return client;};
let client=await connect();
const raw=(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:120000});
const call=async(name,args)=>{const response=await raw(name,args);assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  const aligned=await call('avid_align_speakers',{...reference,candidateLimit:100});
  const ambiguous=aligned.segments.find(segment=>segment.totalCandidates>1&&segment.outsideAnalysisSeconds===0);assert.ok(ambiguous);
  assert.equal((await raw('avid_assign_transcript_speakers',{...reference,assignments:[{index:ambiguous.index,speaker:ambiguous.candidates[0].speaker}]})).isError,true);
  const chosen=aligned.segments.filter(segment=>segment.totalCandidates>0).slice(0,5);assert.equal(chosen.length,5);
  const assignments=chosen.map(segment=>({index:segment.index,speaker:segment.candidates[0].speaker,displayName:`Review label ${segment.candidates[0].speaker}`,allowAmbiguous:segment.totalCandidates>1,allowPartialRange:segment.outsideAnalysisSeconds>0}));
  const result=await call('avid_assign_transcript_speakers',{...reference,assignments});
  const saved=JSON.parse(await readFile(result.path,'utf8'));assert.equal(saved.parentRevision,reference.transcriptRevision);assert.deepEqual(saved.speakerAssignment,result.speakerAssignment);assert.equal(await sha256File(result.path),result.sha256);
  const assignmentMap=new Map(assignments.map(value=>[value.index,value.displayName]));
  for(let index=0;index<parent.segments.length;index++){const {speaker,...before}=parent.segments[index],{speaker:updated,...after}=saved.segments[index];assert.deepEqual(after,before);assert.equal(updated,assignmentMap.get(index)??speaker);}
  assert.equal(await sha256File(parentFile),reference.transcriptSha256);assert.equal((await call('avid_speaker_analysis',{analysisId:reference.analysisId})).sha256,reference.analysisSha256);
  await client.close();client=await connect(true);const revisions=await call('avid_transcript_revisions',{id});assert.ok(revisions.revisions.some(value=>value.revision===result.revision&&value.parentRevision===reference.transcriptRevision&&value.sha256===result.sha256));
  const retrieved=[];let offset=0;do{const page=await call('avid_transcript_speaker_assignments',{id,revision:result.revision,expectedSha256:result.sha256,offset,limit:2});retrieved.push(...page.assignments);offset=page.nextOffset;}while(offset!==null);assert.deepEqual(retrieved,result.speakerAssignment.assignments);assert.equal((await call('avid_transcript_speaker_assignments',{id,revision:reference.transcriptRevision,expectedSha256:reference.transcriptSha256})).speakerAssignment,null);
  assert.equal((await raw('avid_assign_transcript_speakers',{...reference,assignments})).isError,true);assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({reference,assignments,result,saved,sourceUnchanged:true,parentUnchanged:true,analysisUnchanged:true,scope:'Actual MCP explicit assignment to five Sonoma machine-transcript segments, ambiguity refusal, persisted provenance, reconnect and write-capability denial. Display names are test labels; no human speaker identity or transcript accuracy acceptance.'},null,2));console.log(JSON.stringify({passed:true,assignments:assignments.length,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
