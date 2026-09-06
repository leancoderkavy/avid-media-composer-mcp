// Explicit local model setup qualification; may download missing optional dependencies/weights.
import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';import {installModelNotice} from '../../dist/library/model-notices.js';
import {VISUAL_MODEL,VISUAL_REVISION} from '../../dist/library/visual.js';import {CAPTION_MODEL,CAPTION_REVISION} from '../../dist/library/captions.js';import {speechModels} from '../../dist/library/speech-options.js';
const cache=process.argv[2];assert.ok(cache&&path.isAbsolute(cache),'Pass the absolute model-cache path; explicit setup may download missing weights');
const root=path.resolve('.avid-mcp-analysis',`model-notice-setup-${randomUUID()}`);await mkdir(root);
const cases=[{model:VISUAL_MODEL,revision:VISUAL_REVISION,args:[]},...Object.entries(speechModels).map(([name,value])=>({...value,args:['--speech','--speech-model',name]})),{model:CAPTION_MODEL,revision:CAPTION_REVISION,args:['--captions']}],results=[];
for(const item of cases){
 const started=Date.now(),result=await runProcess(process.execPath,[path.resolve('dist/cli.js'),'--download-models','--model-dir',cache,...item.args],{timeoutMs:300000,maxOutputBytes:2*1024*1024});
 await writeFile(path.join(root,`${results.length}-response.json`),JSON.stringify(result,null,2),{flag:'wx'});assert.equal(result.exitCode,0,result.stderr);
 const output=JSON.parse(result.stdout);assert.equal(output.downloaded,item.model);assert.equal(output.revision,item.revision);
 const notice=await installModelNotice(cache,item.model,item.revision);assert.equal(notice.created,false,'CLI must have retained the notice before this verification');
 results.push({model:item.model,revision:item.revision,milliseconds:Date.now()-started,notice,setupPassed:true});
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,scope:'Actual CLI setup and model loading/disposal using the selected cache; cache-hit/network transfer amounts and inference accuracy not measured'},null,2));
 console.log(JSON.stringify({model:item.model,passed:true,root}));
}
