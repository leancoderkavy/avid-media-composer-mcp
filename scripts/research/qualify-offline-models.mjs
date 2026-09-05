import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadVisualModels} from '../../dist/library/visual.js';
import {loadSpeechModel} from '../../dist/library/speech.js';
import {loadSummaryModel} from '../../dist/library/summaries.js';
import {loadCaptionModel,CAPTION_TASK} from '../../dist/library/captions.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const cache=path.resolve('.avid-mcp-analysis/models'),root=path.resolve('.avid-mcp-analysis',`offline-models-${randomUUID()}`);await mkdir(root);
const file=path.resolve('.avid-mcp-analysis/caption-batch-0e41594b-4081-40aa-a918-dbfca87795b5/avid-mcp-library/caption-beba8d89-ac6d-49c2-9950-be500b8811f0/frame.jpg'),imageSha=await sha256File(file);
let fetchAttempts=0;globalThis.fetch=async()=>{fetchAttempts++;throw new Error('Network blocked for cached model qualification');};
const results={};
const visual=await loadVisualModels(cache);try{const tokens=await visual.tokenizer('Rows of grapevines.'),text=await visual.text(tokens),image=await visual.RawImage.read(file),inputs=await visual.processor(image),picture=await visual.vision(inputs);assert.equal(text.text_embeds.data.length,512);assert.equal(picture.image_embeds.data.length,512);results.visual={textDimensions:512,imageDimensions:512};}finally{await visual.text.dispose();await visual.vision.dispose();}
for(const selection of ['tiny.en','tiny']){const speech=await loadSpeechModel(cache,false,selection);try{const result=await speech(new Float32Array(16000),{...(selection==='tiny'?{language:'en'}:{}),return_timestamps:true,max_new_tokens:20});assert.equal(typeof result.text,'string');results[selection]={output:result,scope:'One second of digital silence; loader/inference qualification only, not transcription accuracy'};}finally{await speech.dispose();}}
const summary=await loadSummaryModel(cache);try{results.summary=await summary('A person grips holds on an indoor climbing wall.',{max_new_tokens:40,min_new_tokens:8,do_sample:false,num_beams:1});assert.ok(results.summary[0].summary_text);}finally{await summary.dispose();}
const caption=await loadCaptionModel(cache);try{const image=await caption.RawImage.read(file),inputs=await caption.processor(image,caption.processor.construct_prompts(CAPTION_TASK));const output=await caption.model.generate({...inputs,max_new_tokens:128,do_sample:false,num_beams:1});assert.ok(output instanceof caption.Tensor);results.caption=caption.processor.post_process_generation(caption.processor.batch_decode(output,{skip_special_tokens:false})[0],CAPTION_TASK,image.size);}finally{await caption.model.dispose();}
assert.equal(fetchAttempts,0);assert.equal(await sha256File(file),imageSha);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({fetchAttempts,networkHook:'globalThis.fetch rejects and counts every attempt',results,imageUnchanged:true,scope:'Actual cached CLIP text/image, English/multilingual Whisper, DistilBART and Florence loader/inference calls with fetch prohibited. No model accuracy claim or native OS packet capture.'},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
