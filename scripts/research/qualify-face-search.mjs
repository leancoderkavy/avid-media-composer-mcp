import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorPath=process.argv[2];if(!priorPath)throw new Error('Pass qualify-people-range evidence.json');
const prior=JSON.parse(await readFile(priorPath,'utf8')),root=path.dirname(path.resolve(priorPath)),indexId=prior.job.result.indexId;
const record=JSON.parse(await readFile(path.join(root,'avid-mcp-library',`people-${indexId}`,'index.json'),'utf8')),reference=record.faces[0];assert.ok(reference&&record.faces.length>1);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',before=await sha256File(source);
const client=new Client({name:'face-search-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
const call=async options=>{const response=await client.callTool({name:'avid_find_similar_faces',arguments:{referenceIndexId:indexId,referenceFaceId:reference.faceId,options}});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  const discoveryResponse=await client.callTool({name:'avid_people_indices',arguments:{mediaId:reference.mediaId}});assert.ok(!discoveryResponse.isError,JSON.stringify(discoveryResponse));const discovery=discoveryResponse.structuredContent.data;assert.ok(discovery.indices.some(row=>row.indexId===indexId&&row.state==='available'));
  const result=await call({threshold:-1,limit:100});assert.equal(result.matches.length,record.faces.length-1);assert.equal(result.identityVerified,false);assert.ok(result.matches.every(row=>!('embedding' in row)));
  const norm=values=>Math.sqrt(values.reduce((sum,value)=>sum+value*value,0));
  const expected=record.faces.filter(face=>face.faceId!==reference.faceId).map(face=>({faceId:face.faceId,time:face.time,score:face.embedding.reduce((sum,value,i)=>sum+value*reference.embedding[i],0)/(norm(face.embedding)*norm(reference.embedding))})).sort((a,b)=>b.score-a.score||a.faceId.localeCompare(b.faceId));
  assert.deepEqual(result.matches.map(row=>row.faceId),expected.map(row=>row.faceId));for(let i=0;i<expected.length;i++)assert.ok(Math.abs(result.matches[i].score-expected[i].score)<1e-10);
  const bounded=await call({threshold:-1,limit:5});assert.equal(bounded.matches.length,5);assert.equal(bounded.hasMore,true);
  const start=expected[0].time,end=start+0.1,filtered=await call({threshold:-1,range:{start,end},limit:100});assert.deepEqual(filtered.matches.map(row=>row.faceId),expected.filter(row=>row.time>=start&&row.time<end).map(row=>row.faceId));
  assert.equal(await sha256File(source),before);
  const output=path.resolve('.avid-mcp-analysis',`face-search-${randomUUID()}`);await mkdir(output);await writeFile(path.join(output,'evidence.json'),JSON.stringify({priorPath,discovery,result,bounded,filtered,sourceUnchanged:true,scope:'Fresh-session read-only MCP index discovery and feature ranking/filtering verified independently on saved Sonoma detections; not identity/recognition accuracy'},null,2));
  console.log(JSON.stringify({passed:true,matches:result.matches.length,evidence:path.join(output,'evidence.json')}));
}finally{await client.close();}
