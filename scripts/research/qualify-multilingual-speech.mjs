import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`speech-options-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'speech-options-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  await call('avid_index_media',{files:[source]});
  const direct=await call('avid_transcribe_media',{id,start:60,end:80,options:{model:'tiny',language:'en'}});
  assert.equal(direct.model,'onnx-community/whisper-tiny');assert.equal(direct.language,'en');assert.equal(direct.modelRevision,'ff4177021cc41f7db950912b73ea4fdf7d01d8e7');
  for(const segment of direct.segments){assert.ok(segment.start>=60&&segment.end<=80);}
  const job=await call('avid_start_analysis_job',{job:{kind:'speech',id,start:60,end:80,options:{model:'tiny',language:'auto'}}});
  let status;const deadline=Date.now()+120000;
  do{await new Promise(resolve=>setTimeout(resolve,1000));status=await call('avid_analysis_job_status',{jobId:job.id});if(['completed','failed','cancelled'].includes(status.status))break;}while(Date.now()<deadline);
  assert.equal(status.status,'completed',JSON.stringify(status));assert.equal(status.result.language,null);assert.equal(status.result.languageRequested,'auto');assert.equal(status.result.languageDetectionVerified,false);
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({direct,job:status,sourceUnchanged:true,scope:'Multilingual model runtime on Sonoma audio; not non-English recognition accuracy or language-detection validation'},null,2));
  console.log(JSON.stringify({passed:true,directSegments:direct.segments.length,jobSegments:status.result.segments.length,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
