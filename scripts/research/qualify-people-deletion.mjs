import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const input=process.argv[2];assert.ok(input,'Pass recovery evidence.json');
const root=path.dirname(path.resolve(input)),prior=JSON.parse(await readFile(input,'utf8')),indexId=prior.completed.result.indexId,dir=path.join(root,'avid-mcp-library',`people-${indexId}`),source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const record=JSON.parse(await readFile(path.join(dir,'index.json'),'utf8')),face=record.faces[0];assert.ok(face);
const before=await readdir(dir),checkpoints=before.filter(n=>/^faces-\d+\.json$/.test(n));assert.equal(checkpoints.length,120);
const frameHashes=Object.fromEntries(await Promise.all(before.filter(n=>/^frame-\d+\.jpg$/.test(n)).map(async n=>[n,await sha256File(path.join(dir,n))]))),sourceHash=await sha256File(source);
const client=new Client({name:'people-deletion-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
try {
 const reply=await client.callTool({name:'avid_edit_people',arguments:{indexId,expectedRevision:record.revision,operation:{action:'remove_face',faceId:face.faceId}}});assert.ok(!reply.isError,JSON.stringify(reply));
 const result=reply.structuredContent.data;assert.equal(result.analysisCheckpointsRemoved,120);
 const after=await readdir(dir);assert.equal(after.filter(n=>/^faces-\d+\.json$/.test(n)).length,0);assert.ok(!after.includes(face.crop));
 const edited=JSON.parse(await readFile(path.join(dir,'index.json'),'utf8'));assert.equal(edited.faces.length,37);assert.ok(!edited.faces.some(f=>f.faceId===face.faceId));
 for(const [name,hash] of Object.entries(frameHashes))assert.equal(await sha256File(path.join(dir,name)),hash);
 assert.equal(await sha256File(source),sourceHash);
 const status=await client.callTool({name:'avid_people_run',arguments:{indexId}});assert.equal(status.isError,true);
 const evidence={indexId,removedFace:face.faceId,result,checkpointsRemoved:120,sampledFramesUnchanged:true,sourceUnchanged:true,originalCompletionInvalidated:true};
 await writeFile(path.join(root,'deletion-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} finally {await client.close();}
