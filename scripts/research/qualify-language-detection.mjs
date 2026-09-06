import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadSpeechModel} from '../../dist/library/speech.js';
import {speechModels} from '../../dist/library/speech-options.js';
import {modelRuntime} from '../../dist/library/model-runtime.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
// Original JS experiment implementing the public Whisper language-token method.
// Reference: https://github.com/openai/whisper/blob/main/whisper/decoding.py
const root=path.resolve('.avid-mcp-analysis',`language-detection-${randomUUID()}`);await mkdir(root);
const english=path.join(root,'english.wav'),reference='The editor selected the vineyard arrival footage. Please check the sound and picture before the final delivery tomorrow morning.';
const ps=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $voice=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $voice.SelectVoice('Microsoft David Desktop'); $voice.SetOutputToWaveFile('${english.replaceAll("'","''")}'); $voice.Speak('${reference}') } finally { $voice.Dispose() }`;
const generated=await runProcess('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{timeoutMs:30000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
const cache=path.resolve('.avid-mcp-analysis/models'),{Tensor}=await modelRuntime(cache),model=await loadSpeechModel(cache,false,'tiny'),results=[];
try{
  const config=model.model.generation_config;assert.ok(Number.isInteger(config.decoder_start_token_id));assert.ok(config.lang_to_id);
  const fixtures=[{name:'english',file:english,expected:'en'},{name:'mandarin',file:path.resolve('.avid-mcp-analysis/mandarin-speech-7a93457a-4f17-41dc-ad96-2044b8fe70ca/mandarin.wav'),expected:'zh'},{name:'silence'}];
  for(const fixture of fixtures){
    let samples,sourceHash;
    if(fixture.file){sourceHash=await sha256File(fixture.file);const audio=path.join(root,`${fixture.name}.f32`),extracted=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',fixture.file,'-t','30','-vn','-ac','1','-ar','16000','-f','f32le',audio],{timeoutMs:30000,maxOutputBytes:8192});assert.equal(extracted.exitCode,0);const bytes=await readFile(audio);samples=new Float32Array(bytes.length/4);for(let i=0;i<samples.length;i++)samples[i]=bytes.readFloatLE(i*4);}
    else samples=new Float32Array(16000*10);
    const started=Date.now(),features=await model.processor(samples);
    const output=await model.model({input_features:features.input_features,decoder_input_ids:new Tensor('int64',BigInt64Array.from([BigInt(config.decoder_start_token_id)]),[1,1])});
    const logits=output.logits;assert.equal(logits.dims.length,3);assert.equal(logits.dims[0],1);assert.equal(logits.dims[1],1);
    const ranked=Object.entries(config.lang_to_id).map(([token,id])=>{assert.ok(Number.isInteger(id)&&id>=0&&id<logits.data.length);const logit=Number(logits.data[id]);assert.ok(Number.isFinite(logit));return {language:token.slice(2,-2),logit};}).sort((a,b)=>b.logit-a.logit);
    const max=ranked[0].logit,total=ranked.reduce((sum,value)=>sum+Math.exp(value.logit-max),0),probabilities=ranked.map(value=>({...value,probability:Math.exp(value.logit-max)/total}));
    const result={...fixture,sourceHash,sampleSeconds:samples.length/16000,language:ranked[0].language,top:probabilities.slice(0,5),elapsedMs:Date.now()-started,expectedMatched:fixture.expected?ranked[0].language===fixture.expected:null};results.push(result);
    if(fixture.file)assert.equal(await sha256File(fixture.file),sourceHash);
  }
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({model:speechModels.tiny,runtime:'4.2.0',reference,results,scope:'Single-token language ranking on two synthetic voices and silence; probabilities are model scores, not calibrated confidence; research only'},null,2));
  console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),results}));
}finally{await model.dispose();}
