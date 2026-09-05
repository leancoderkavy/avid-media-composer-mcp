import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`people-range-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'people-range-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  await call('avid_index_media',{files:[source]});const started=Date.now(),job=await call('avid_start_analysis_job',{job:{kind:'people',ids:[id],samples:120,threshold:0.45,range:{start:60,end:120}}});let status;const deadline=Date.now()+180000;
  do{await new Promise(resolve=>setTimeout(resolve,500));status=await call('avid_analysis_job_status',{jobId:job.id});if(['completed','cancelled','failed'].includes(status.status))break;}while(Date.now()<deadline);
  assert.equal(status.status,'completed',JSON.stringify(status));const index=status.result;assert.equal(index.samples,120);assert.deepEqual(index.coverage,[{mediaId:id,start:60,end:120,samples:120}]);
  const manifest=JSON.parse(await readFile(path.join(root,'avid-mcp-library',`people-${index.indexId}`,'request.json'),'utf8'));assert.equal(manifest.frames.length,120);assert.equal(manifest.frames[0].time,60.25);assert.equal(manifest.frames.at(-1).time,119.75);
  const faces=[];let after=-1;do{const page=await call('avid_people_faces',{indexId:index.indexId,after,limit:100});faces.push(...page.faces);after=page.nextAfter;}while(after!==null);
  assert.equal(faces.length,index.faces);for(const face of faces)assert.ok(manifest.frames.some(frame=>frame.id===face.mediaId&&frame.time===face.time));
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({job:status,faces:faces.map(({crop,...face})=>face),elapsedMs:Date.now()-started,sourceUnchanged:true,scope:'Actual 120-sample ranged people worker and pagination; requested seek coverage, not exhaustive appearances or recognition accuracy'},null,2));
  console.log(JSON.stringify({passed:true,samples:index.samples,faces:index.faces,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
