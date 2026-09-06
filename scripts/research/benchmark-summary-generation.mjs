import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadSummaryModel,SUMMARY_MODEL,SUMMARY_REVISION} from '../../dist/library/summaries.js';
const root=path.resolve('.avid-mcp-analysis',`summary-generation-${randomUUID()}`);await mkdir(root);
const fixtures=[
  {name:'editorial-decisions',text:'The production meeting ended with three decisions. Maya will deliver a ninety-second vineyard film on Friday. Leo will remove the interview recorded beside the noisy road. The cellar sequence remains in the cut, but its music must be quieter so the dialogue is clear. The producer rejected a drone reshoot because the existing aerial footage is sufficient.'},
  {name:'negation-and-numbers',text:'The client approved version two, not version three. The approved film is forty-five seconds long. Do not publish the draft on social media. Delivery is Monday, September seventh, at nine in the morning. Nina is responsible for reviewing captions. Omar is responsible for checking the stereo mix. No new filming has been approved.'},
  {name:'repeated-notes',text:('The editor selects the vineyard arrival footage. The producer requests clear location context. The sound editor reviews dialogue against music. ').repeat(10)},
];
const variants={baseline:{max_new_tokens:80,min_new_tokens:8,do_sample:false,num_beams:1},candidate:{max_new_tokens:160,min_new_tokens:8,do_sample:false,num_beams:4,no_repeat_ngram_size:3,early_stopping:true}};
const model=await loadSummaryModel(path.resolve('.avid-mcp-analysis/models'));
const observed=[];
const originalGenerate=model.model.generate.bind(model.model);
model.model.generate=async options=>{
  const effective=model.model._prepare_generation_config(options.generation_config,options);
  observed.push({requested:{max_new_tokens:options.max_new_tokens,num_beams:options.num_beams,no_repeat_ngram_size:options.no_repeat_ngram_size},effective:{max_new_tokens:effective.max_new_tokens,max_length:effective.max_length,num_beams:effective.num_beams,no_repeat_ngram_size:effective.no_repeat_ngram_size}});
  return originalGenerate(options);
};
try{
  const results=[];
  for(const fixture of fixtures)for(const [variant,options] of Object.entries(variants)){
    const started=Date.now(),output=await model(fixture.text,options),text=output[0].summary_text.trim();
    assert.equal(observed.at(-1).effective.max_new_tokens,options.max_new_tokens);
    assert.equal(observed.at(-1).effective.num_beams,options.num_beams);
    const words=text.toLowerCase().match(/[a-z0-9]+/g)??[],grams=words.slice(0,-3).map((_,i)=>words.slice(i,i+4).join(' '));
    results.push({fixture:fixture.name,variant,text,elapsedMs:Date.now()-started,generation:observed.at(-1),hasTerminalPunctuation:/[.!?]["']?$/.test(text),repeatedFourGrams:grams.length-new Set(grams).size});
  }
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({model:SUMMARY_MODEL,modelRevision:SUMMARY_REVISION,fixtures,variants,results,scope:'Three original synthetic fixtures; diagnostics and manual review, not a general accuracy benchmark'},null,2));
  console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),results}));
}finally{await model.dispose();}
