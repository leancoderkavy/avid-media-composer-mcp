import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {runProcess} from '../../dist/process.js';import {sha256File} from '../../dist/analysis/file-inventory.js';
const fixture=JSON.parse(await readFile('.avid-mcp-analysis/speech-english-fixtures-d6ae59e4-b323-4927-8907-27fe6c6ab59a/clean.json','utf8')),source=fixture.file,id=await sha256File(source);assert.equal(id,fixture.sourceSha256);
const cache=path.resolve('.avid-mcp-analysis/models'),root=path.resolve('.avid-mcp-analysis',`speech-base-mcp-${randomUUID()}`);await mkdir(root);
const setup=await runProcess(process.execPath,['dist/cli.js','--download-models','--model-dir',cache,'--speech','--speech-model','base'],{timeoutMs:300000,maxOutputBytes:1024*1024});await writeFile(path.join(root,'setup.json'),JSON.stringify(setup,null,2));assert.equal(setup.exitCode,0,setup.stderr);
const probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',source],{timeoutMs:10000});assert.equal(probe.exitCode,0);const end=Number(JSON.parse(probe.stdout).format.duration);
const client=new Client({name:'base-production-qualification',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:cache,AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const records=[];const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,response});await writeFile(path.join(root,'records.json'),JSON.stringify(records,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[source]});
 for(const language of ['en','auto']){
  const transcript=await call('avid_transcribe_media',{id,start:0,end,options:{model:'base',language}});
  assert.equal(transcript.model,'onnx-community/whisper-base');assert.equal(transcript.modelRevision,'1846881b6b3a3024392c1eea3ad983695bc23925');assert.equal(transcript.language,'en');assert.equal(transcript.languageSelection,language==='auto'?'model_candidate':'explicit');assert.ok(transcript.segments.length);
  const status=await call('avid_speech_run',{runId:transcript.runId});assert.equal(status.state,'completed');assert.equal(status.options.model,'base');assert.equal(status.options.language,language);await writeFile(path.join(root,`status-${language}.json`),JSON.stringify(status,null,2));
 }
 assert.equal(await sha256File(source),id);console.log(JSON.stringify({root,explicitAndAutoPassed:true,sourceUnchanged:true}));
}finally{await client.close();}
