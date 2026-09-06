import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadSummaryModel,SUMMARY_MODEL,SUMMARY_REVISION} from '../../dist/library/summaries.js';
const root=path.resolve('.avid-mcp-analysis',`summary-repetition-${randomUUID()}`);await mkdir(root);
const fixtures=JSON.parse(await readFile(new URL('./fixtures/summary-evidence.json',import.meta.url),'utf8'));
fixtures.push({name:'short-observation',text:'A person grips holds on an indoor climbing wall.',reviewCriteria:['One person grips holds on an indoor climbing wall','Do not invent intentions, repeated actions or extra people']});
const variants={baseline:{max_new_tokens:80,min_new_tokens:8,do_sample:false,num_beams:1},candidate:{max_new_tokens:80,min_new_tokens:0,do_sample:false,num_beams:1,no_repeat_ngram_size:2,repetition_penalty:1.2},lengthOnly:{max_new_tokens:80,min_new_tokens:0,min_length:0,do_sample:false,num_beams:1},combined:{max_new_tokens:80,min_new_tokens:0,min_length:0,do_sample:false,num_beams:1,no_repeat_ngram_size:2,repetition_penalty:1.2}};
const model=await loadSummaryModel(path.resolve('.avid-mcp-analysis/models'));
const results=[];let effective;
const original=model.model.generate.bind(model.model);
model.model.generate=async options=>{
 const config=model.model._prepare_generation_config(options.generation_config,options);
 effective=Object.fromEntries(['max_new_tokens','min_new_tokens','min_length','num_beams','no_repeat_ngram_size','repetition_penalty'].map(key=>[key,config[key]]));
 return original(options);
};
try{
 for(const fixture of fixtures)for(const [variant,options] of Object.entries(variants)){
  const started=Date.now(),output=await model(fixture.text,options),text=output[0].summary_text.trim();
  for(const [key,value] of Object.entries(options))if(key!=='do_sample')assert.equal(effective[key],value);
  results.push({fixture:fixture.name,variant,text,effective,elapsedMs:Date.now()-started});
  await writeFile(path.join(root,'progress.json'),JSON.stringify({fixtures,variants,results},null,2));
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({model:SUMMARY_MODEL,revision:SUMMARY_REVISION,fixtures,variants,results,scope:'Synthetic editorial fixture comparison; manual claim-level review required. No production recipe changes.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,results}));
}finally{await model.dispose();}
