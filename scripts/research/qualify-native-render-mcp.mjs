import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
assert.ok(process.argv.slice(2).every(value=>['--stereo-legal','--pcm-selects'].includes(value)), 'Only owned fixture variants are supported');
const pcmSelects=process.argv.includes('--pcm-selects');
const stereoLegal=process.argv.includes('--stereo-legal')||pcmSelects;
const root=path.resolve('.avid-mcp-analysis',`native-render-mcp-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'native-render-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects/MCP_Sonoma_30p_20260905',AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  const operation={action:'export_mp4',bin:'MCP_AAF_Selects_20260905.avb',mobId:'060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9',preset:'MCP_H264_Qualification',expected:{videoCodec:'h264',width:1920,height:1080,frames:120,rate:{num:30,den:1},audio:[{codec:'pcm_s24le',channels:1,sampleRate:48000}]}};
  if(stereoLegal){operation.preset='MCP_H264_Stereo_Legal_20260905';operation.expected.audio[0].channels=2;}
  if(pcmSelects){operation.bin='MCP_PCMAAF_dcf153d5.avb';operation.mobId='060a2b340101010501010f1013-000000-a376a03c12888806-8062d8bbc16d-18d9';}
  operation.expected.color={range:stereoLegal?'tv':'pc',space:'bt709',transfer:'bt709',primaries:'bt709'};
  const preview=await call('avid_native_preview',{operation});await writeFile(path.join(root,'preview.json'),JSON.stringify(preview,null,2));
  const applied=await call('avid_native_apply',{token:preview.token});assert.equal(applied.outputVerified,true);assert.equal(applied.verification.decodedFrames,120);
  assert.equal(applied.verification.colorTagsChecked,true);
  const replay=await client.callTool({name:'avid_native_apply',arguments:{token:preview.token}});assert.ok(replay.isError);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({preview,applied,replayRejected:true},null,2));console.log(JSON.stringify({passed:true,output:applied.verification.output,sha256:applied.verification.sha256,decodedFrames:120,replayRejected:true}));
}finally{await client.close();}
