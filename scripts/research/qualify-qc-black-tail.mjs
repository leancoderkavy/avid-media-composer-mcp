import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-black-tail-${randomUUID()}`);await mkdir(root);
const file=path.join(root,'tail.mkv');
const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-f','lavfi','-i',"nullsrc=s=160x90:r=30:d=4,format=yuv420p,geq=lum='if(gte(N,60),16,235)':cb=128:cr=128,setparams=range=tv",'-c:v','ffv1',file],{timeoutMs:30000});assert.equal(generated.exitCode,0,generated.stderr);
const id=await sha256File(file),client=new Client({name:'qc-black-tail-proof',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[file]});
 for(const end of [2.5,2.75,3,4]){
  const report=await call('avid_media_qc',{id,options:{end,audioStream:null,blackSeconds:0.5}});
  const saved=await call('avid_read_qc_report',{id,revision:report.revision});assert.deepEqual(saved.report.findings.black,report.findings.black);
  assert.equal(report.findings.blackOpenAtProcessingEnd.start,2);assert.equal(report.findings.blackOpenAtProcessingEnd.end,null);assert.equal(report.findings.blackOpenAtProcessingEnd.minimumDurationVerified,false);
  assert.deepEqual(saved.report.findings.blackOpenAtProcessingEnd,report.findings.blackOpenAtProcessingEnd);
  results.push({end,black:report.findings.black,openBlack:report.findings.blackOpenAtProcessingEnd,frames:report.videoCoverage.decodedFrames});
 }
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,sourceUnchanged:true,scope:'Synthetic black from source second 2 through end at 30fps; tests observed detector endpoint, not perceptual darkness or general tail completeness.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,results}));
}finally{await client.close();}
