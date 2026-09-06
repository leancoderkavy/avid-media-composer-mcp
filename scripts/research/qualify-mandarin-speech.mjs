// Synthetic Mandarin accuracy probe; requires the installed Huihui Desktop voice.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {runProcess} from '../../dist/process.js';
const reference='今天我们去公园拍摄视频。请检查声音和画面，然后把最好的片段放在一起。明天上午九点开始工作。';
const root=path.resolve('.avid-mcp-analysis',`mandarin-speech-${randomUUID()}`);await mkdir(root);
const source=path.join(root,'mandarin.wav');
const encoded=Buffer.from(reference,'utf8').toString('base64');
const ps=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $speechFixture=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $speechFixture.SelectVoice('Microsoft Huihui Desktop'); $speechFixture.SetOutputToWaveFile('${source.replaceAll("'","''")}'); $speechFixture.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))) } finally { $speechFixture.Dispose() }`;
const generated=await runProcess('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{timeoutMs:30000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
const id=await sha256File(source);
const probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',source],{timeoutMs:10000});assert.equal(probe.exitCode,0);const end=Number(JSON.parse(probe.stdout).format.duration);
const client=new Client({name:'mandarin-speech-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  await call('avid_index_media',{files:[source]});
  const transcript=await call('avid_transcribe_media',{id,start:0,end,options:{model:'tiny',language:'zh'}});
  const hypothesis=transcript.segments.map(segment=>segment.text).join('');
  const normalize=text=>[...text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')];
  const a=normalize(reference),b=normalize(hypothesis);let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  const edits=row[b.length],characterErrorRate=edits/a.length;
  assert.equal(transcript.language,'zh');assert.ok(b.length>0);assert.equal(await sha256File(source),id);
  const evidence={reference,hypothesis,normalization:'NFKC; remove punctuation and whitespace; no numeral or script conversion',referenceCharacters:a.length,edits,characterErrorRate,transcript,sourceSha256:id,sourceUnchanged:true,voice:'Microsoft Huihui Desktop',scope:'One synthetic Mandarin fixture; no general language accuracy claim'};
  await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({passed:true,referenceCharacters:a.length,edits,characterErrorRate,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
