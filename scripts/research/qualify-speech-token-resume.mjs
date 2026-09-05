import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadSpeechModel} from '../../dist/library/speech.js';
import {speechModels,speechOptions} from '../../dist/library/speech-options.js';
import {modelRuntime} from '../../dist/library/model-runtime.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
// Research-only interception of the pinned runtime's generation boundary.
// No dependency source is edited, and no generated transcript is imported.
const root=path.resolve('.avid-mcp-analysis',`speech-token-resume-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sourceHash=await sha256File(source),start=60,end=125,cache=path.resolve('.avid-mcp-analysis/models');
const options=speechOptions.parse({model:process.argv.find(arg=>arg.startsWith('--model='))?.slice(8)??'tiny.en',language:process.argv.find(arg=>arg.startsWith('--language='))?.slice(11)??'auto'}),selected=speechModels[options.model];
const runtimeVersion=JSON.parse(await readFile(path.join(cache,'runtime/node_modules/@huggingface/transformers/package.json'),'utf8')).version;assert.equal(runtimeVersion,'4.2.0');
const audio=path.join(root,'speech.f32');
const extraction=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-ss',String(start),'-i',source,'-t',String(end-start),'-vn','-ac','1','-ar','16000','-f','f32le',audio],{timeoutMs:60000,maxOutputBytes:1048576});assert.equal(extraction.exitCode,0);
const bytes=await readFile(audio),samples=new Float32Array(bytes.length/4);for(let i=0;i<samples.length;i++)samples[i]=bytes.readFloatLE(i*4);
const settings={return_timestamps:true,chunk_length_s:30,stride_length_s:5,...(selected.multilingual?{task:'transcribe',...(options.language!=='auto'?{language:options.language}:{})}:{})};
const fingerprint=input=>{
  const {inputs,...generation}=input,data=inputs.data;
  return createHash('sha256').update(JSON.stringify({generation,type:inputs.type,dims:inputs.dims})).update(Buffer.from(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
};
const {Tensor}=await modelRuntime(cache,false);
let model=await loadSpeechModel(cache,false,options.model),baselineCalls=0;
try{
  let original=model.model.generate.bind(model.model);
  model.model.generate=async input=>{baselineCalls++;return original(input);};
  const baseline=await model(samples,settings);assert.ok(baselineCalls>=3);
  let calls=0;
  model.model.generate=async input=>{
    if(calls++===1)throw new Error('Intentional interruption before second generation');
    const output=await original(input);
    assert.equal(output.type,'int64');assert.equal(output.dims.length,2);assert.equal(output.dims[0],1);
    await writeFile(path.join(root,'0.json'),JSON.stringify({inputHash:fingerprint(input),dims:output.dims,tokens:Array.from(output.data,String)}),{flag:'wx'});
    return output;
  };
  await assert.rejects(()=>model(samples,settings),/Intentional interruption/);
  const savedBytes=await readFile(path.join(root,'0.json'),'utf8');
  await model.dispose();model=undefined;
  model=await loadSpeechModel(cache,false,options.model);original=model.model.generate.bind(model.model);
  let resumedCalls=0,reused=0,position=0;
  model.model.generate=async input=>{
    if(position++===0){
      const saved=JSON.parse(await readFile(path.join(root,'0.json'),'utf8'));assert.equal(fingerprint(input),saved.inputHash);
      assert.notEqual(fingerprint({...input,num_frames:input.num_frames+1}),saved.inputHash,'Frame-count changes must invalidate replay');
      assert.notEqual(fingerprint({...input,language:'fr'}),saved.inputHash,'Language changes must invalidate replay');
      const changed=input.inputs.clone();changed.data[0]+=1;assert.notEqual(fingerprint({...input,inputs:changed}),saved.inputHash,'Feature changes must invalidate replay');
      reused++;return new Tensor('int64',BigInt64Array.from(saved.tokens,BigInt),saved.dims);
    }
    resumedCalls++;return original(input);
  };
  const resumed=await model(samples,settings);
  assert.deepEqual(resumed,baseline,'Resumed text and segment timestamps must exactly match uninterrupted output');
  assert.equal(reused,1);assert.equal(resumedCalls,baselineCalls-1);assert.equal(await readFile(path.join(root,'0.json'),'utf8'),savedBytes);assert.equal(await sha256File(source),sourceHash);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({model:selected.model,revision:selected.revision,runtimeVersion,options,source,sourceHash,start,end,settings,baselineCalls,resumedCalls,reused,baseline,resumed,sourceUnchanged:true,checkpointUnchanged:true,changedInputsDistinguished:['num_frames','language','input_features'],scope:'Real model reload and exact token replay/merge equivalence on Sonoma; intentional exception, not process termination or production recovery'},null,2));
  console.log(JSON.stringify({passed:true,baselineCalls,resumedCalls,reused,evidence:path.join(root,'evidence.json')}));
}finally{await model?.dispose();}
