import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-coverage-${randomUUID()}`);await mkdir(root);
const file=path.join(root,'short-audio.mkv');
const generated=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=4','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=1','-map','0:v','-map','1:a','-c:v','ffv1','-c:a','pcm_s16le',file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(generated.exitCode,0,generated.stderr);
const id=await sha256File(file),client=new Client({name:'qc-coverage-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
try{
 const index=await client.callTool({name:'avid_index_media',arguments:{files:[file]}});assert.ok(!index.isError);
 const full=await client.callTool({name:'avid_media_qc',arguments:{id,options:{end:4}}},undefined,{timeout:120000});
 assert.ok(!full.isError);assert.deepEqual(full.structuredContent.data.audioCoverage,{samplesPerChannel:48000,sampleRate:48000,decodedSeconds:1,requestedSeconds:4,amountMatchesRequestedDuration:false,meaning:'Sample amount at the declared rate before loudness normalization. Does not prove continuous timestamp coverage or perceptual synchronization.'});
 const reportsBefore=(await readdir(path.join(root,'avid-mcp-library'))).filter(name=>/^qc-/.test(name)).sort();
 const emptyAudio=await client.callTool({name:'avid_media_qc',arguments:{id,options:{start:3,end:4,videoStream:null}}},undefined,{timeout:120000});
 assert.equal(emptyAudio.isError,true);assert.match(emptyAudio.structuredContent.error.message,/decoded no samples/);
 assert.deepEqual((await readdir(path.join(root,'avid-mcp-library'))).filter(name=>/^qc-/.test(name)).sort(),reportsBefore);
 assert.equal(await sha256File(file),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({id,full,emptyAudio,sourceUnchanged:true},null,2));
 console.log(JSON.stringify({root,fullError:full.isError??false,emptyAudioError:emptyAudio.isError??false,emptyAudio:emptyAudio.structuredContent}));
}finally{await client.close();}
