// Research only: explicitly downloads a pinned Whisper-base candidate if absent.
import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {modelRuntime} from '../../dist/library/model-runtime.js';import {loadSpeechModel} from '../../dist/library/speech.js';import {speechModels} from '../../dist/library/speech-options.js';import {speechAudioArguments} from '../../dist/library/speech-audio.js';import {runProcess} from '../../dist/process.js';import {sha256File} from '../../dist/analysis/file-inventory.js';
const priorRoot=path.resolve('.avid-mcp-analysis/mandarin-speech-7a93457a-4f17-41dc-ad96-2044b8fe70ca');
const fixture=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const prior=fixture??JSON.parse(await readFile(path.join(priorRoot,'evidence.json'),'utf8')),source=fixture?.file??path.join(priorRoot,'mandarin.wav'),language=fixture?.language??'zh';
assert.ok(path.isAbsolute(source)&&['en','zh'].includes(language)&&typeof prior.reference==='string'&&prior.reference.length>0&&prior.reference.length<=10000);
assert.equal(await sha256File(source),prior.sourceSha256);
const root=path.resolve('.avid-mcp-analysis',`speech-base-comparison-${randomUUID()}`);await mkdir(root);const audio=path.join(root,'source.f32');
const probe=await runProcess('ffprobe',['-v','error','-show_format','-of','json',source],{timeoutMs:10000});assert.equal(probe.exitCode,0);const end=Number(JSON.parse(probe.stdout).format.duration);
const decoded=await runProcess('ffmpeg',speechAudioArguments(source,audio,0,end),{timeoutMs:30000});assert.equal(decoded.exitCode,0,decoded.stderr);
const bytes=await readFile(audio),samples=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const fixtureDescription=fixture?.description??'retained synthetic Mandarin voice';
const cache=path.resolve('.avid-mcp-analysis/models'),base={model:'onnx-community/whisper-base',revision:'1846881b6b3a3024392c1eea3ad983695bc23925'},results=[];
const normalize=text=>[...text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')];
function metric(hypothesis){const a=normalize(prior.reference),b=normalize(hypothesis);let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}const result={edits:row[b.length],referenceCharacters:a.length,rawCharacterErrorRate:row[b.length]/a.length};
 if(language==='en'){
  const words=text=>text.normalize('NFKC').toLowerCase().replace(/[\p{P}]/gu,' ').trim().split(/\s+/).filter(Boolean);
  const left=words(prior.reference),right=words(hypothesis);let previous=Array.from({length:right.length+1},(_,i)=>i);
  for(let i=1;i<=left.length;i++){const next=[i];for(let j=1;j<=right.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));previous=next;}
  result.wordEdits=previous[right.length];result.referenceWords=left.length;result.rawWordErrorRate=result.wordEdits/left.length;
 }
 return result;}
for(const item of [speechModels.tiny,base]){
 console.log(JSON.stringify({root,loading:item.model}));const started=Date.now();
 const model=item.model===base.model?await (await modelRuntime(cache,true)).pipeline('automatic-speech-recognition',base.model,{revision:base.revision,dtype:'q8'}):await loadSpeechModel(cache,false,'tiny');
 const loadedMs=Date.now()-started,begin=Date.now();let output;
 try{output=await model(samples,{return_timestamps:true,chunk_length_s:30,stride_length_s:5,task:'transcribe',language});}finally{await model.dispose();}
 const inferenceMs=Date.now()-begin,hypothesis=output.chunks.map(chunk=>chunk.text).join('');assert.ok(hypothesis.length);
 results.push({model:item.model,revision:item.revision,dtype:'q8',loadedMs,inferenceMs,hypothesis,output,...metric(hypothesis)});
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({reference:prior.reference,sourceSha256:prior.sourceSha256,language,fixtureDescription,results,scope:'Synthetic voice fixture; raw CER includes script/numeral differences and raw WER includes numeral differences; loading time includes cache/download/runtime setup; research only'},null,2));
 console.log(JSON.stringify({model:item.model,inferenceMs,...metric(hypothesis)}));
}
assert.equal(await sha256File(source),prior.sourceSha256);console.log(JSON.stringify({root,sourceUnchanged:true,passed:true}));
