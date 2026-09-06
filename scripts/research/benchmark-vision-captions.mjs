import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {modelRuntime} from '../../dist/library/model-runtime.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const selection=process.argv.find(arg=>arg.startsWith('--model='))?.slice(8)??'smol';assert.ok(['smol','florence'].includes(selection),'Model must be smol or florence');
const florence=selection==='florence',modelId=florence?'onnx-community/Florence-2-base-ft':'HuggingFaceTB/SmolVLM-256M-Instruct',revision=florence?'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f':'7e3e67edbbed1bf9888184d9df282b700a323964',dtype='q4',download=process.argv.includes('--download'),cache=path.resolve('.avid-mcp-analysis/models');
const prior=JSON.parse(await readFile('.avid-mcp-analysis/sonoma-library-20260905/visual-shots.json','utf8')),labels=JSON.parse(await readFile(new URL('./sonoma-visual-labels.json',import.meta.url),'utf8')),indices=[0,6,13,14,18,21,26,29],source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';assert.equal(await sha256File(source),labels.sourceId);
const root=path.resolve('.avid-mcp-analysis',`vision-caption-${randomUUID()}`);await mkdir(root);
const {AutoProcessor,AutoModelForVision2Seq,Florence2ForConditionalGeneration,RawImage}=await modelRuntime(cache),options={cache_dir:cache,revision,local_files_only:!download};
console.log(JSON.stringify({stage:'loading',modelId,revision,download}));const loadStart=Date.now(),processor=await AutoProcessor.from_pretrained(modelId,options),model=await (florence?Florence2ForConditionalGeneration:AutoModelForVision2Seq).from_pretrained(modelId,{...options,dtype});
const loadMs=Date.now()-loadStart,promptText=florence?(process.argv.includes('--more-detailed')?'<MORE_DETAILED_CAPTION>':'<DETAILED_CAPTION>'):'Describe only what is directly visible in this image in two short sentences. Do not guess names, places, intentions, or events outside the image.',results=[];let peakRss=process.memoryUsage().rss;const monitor=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);
try{
 for(const index of indices){
  const sample=prior.samples.find(row=>row.index===index);assert.ok(sample);const imageSha256=await sha256File(sample.image),image=await RawImage.read(sample.image),prompt=florence?processor.construct_prompts(promptText):processor.apply_chat_template([{role:'user',content:[{type:'image'},{type:'text',text:promptText}]}],{add_generation_prompt:true,tokenize:false}),started=Date.now(),inputs=florence?await processor(image,prompt):await processor(prompt,[image]);
  const output=await model.generate({...inputs,max_new_tokens:128,do_sample:false}),tokens=output.tolist()[0],inputLength=florence?0:inputs.input_ids.dims[1];assert.ok(tokens.length>=inputLength);const text=florence?processor.post_process_generation(processor.batch_decode(output,{skip_special_tokens:false})[0],promptText,image.size)[promptText]:processor.batch_decode([tokens.slice(inputLength)],{skip_special_tokens:true})[0];assert.ok(text.trim());
  assert.equal(await sha256File(sample.image),imageSha256);const result={index,time:sample.time,image:sample.image,imageSha256,labels:labels.queries.filter(row=>row.relevant.includes(index)).map(row=>row.text),text,generatedTokens:tokens.length-inputLength,elapsedMs:Date.now()-started};results.push(result);console.log(JSON.stringify(result));
 }
 assert.equal(await sha256File(source),labels.sourceId);await writeFile(path.join(root,'evidence.json'),JSON.stringify({modelId,revision,dtype,runtime:'4.2.0',promptText,loadMs,peakRss,sourceUnchanged:true,results,scope:'Local original-caption candidate evaluation on eight pre-inspected Sonoma frames; no production integration or broad accuracy acceptance'},null,2));console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),peakRss}));
}finally{clearInterval(monitor);await model.dispose();}
