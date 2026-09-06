import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorPath=process.argv[2];if(!priorPath)throw new Error('Pass qualify-language-detection evidence.json');
const prior=JSON.parse(await readFile(priorPath,'utf8')),root=path.resolve('.avid-mcp-analysis',`language-mcp-${randomUUID()}`);await mkdir(root);
const silence=path.join(root,'silence.wav'),generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','2',silence],{timeoutMs:10000,maxOutputBytes:8192});assert.equal(generated.exitCode,0);
const fixtures=prior.results.filter(row=>row.file).map(row=>({file:row.file,expected:row.expected}));fixtures.push({file:silence,expected:null});
const client=new Client({name:'language-detection-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[...new Set(fixtures.map(row=>path.dirname(row.file)))].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
  const results=[];
  for(const fixture of fixtures){const id=await sha256File(fixture.file);await call('avid_index_media',{files:[fixture.file]});const [entry]=await call('avid_library_metadata',{ids:[id]}),end=Math.min(30,Number(entry.metadata.format.duration)),result=await call('avid_detect_speech_language',{id,start:0,end});
    assert.equal(result.language,fixture.expected);assert.equal(result.languageVerified,false);assert.equal(result.transcriptCreated,false);assert.equal(result.reviewRequired,true);assert.equal(await sha256File(fixture.file),id);results.push(result);
  }
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({priorPath,results,sourceUnchanged:true,scope:'Actual stdio MCP detection on known English/Mandarin synthetic voices and digital silence, using inspect/export only. No broad language accuracy claim.'},null,2));
  console.log(JSON.stringify({passed:true,languages:results.map(row=>row.language),evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
