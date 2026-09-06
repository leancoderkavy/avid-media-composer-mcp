import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {VISUAL_MODEL,VISUAL_REVISION} from '../../dist/library/visual.js';
import {SUMMARY_MODEL,SUMMARY_REVISION} from '../../dist/library/summaries.js';
import {CAPTION_MODEL,CAPTION_REVISION} from '../../dist/library/captions.js';
import {speechModels} from '../../dist/library/speech-options.js';
const root=path.resolve('.avid-mcp-analysis',`model-provenance-${randomUUID()}`);await mkdir(root);
const models=[{model:VISUAL_MODEL,revision:VISUAL_REVISION},{model:SUMMARY_MODEL,revision:SUMMARY_REVISION},{model:CAPTION_MODEL,revision:CAPTION_REVISION},...Object.values(speechModels)];
async function bounded(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok||!response.body)throw new Error(`Metadata fetch failed ${response.status}: ${url}`);const chunks=[];let size=0;const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Metadata exceeds 2 MiB');chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}return Buffer.concat(chunks);}
const rows=await Promise.all(models.map(async({model,revision})=>{
 const url=`https://huggingface.co/api/models/${model}/revision/${revision}`,bytes=await bounded(url),metadata=JSON.parse(bytes.toString('utf8'));
 if(metadata.sha!==revision)throw new Error(`Revision mismatch: ${model}`);
 const files=(metadata.siblings??[]).map(s=>s.rfilename).filter(name=>/(^|\/)(license[^/]*|notice[^/]*|readme\.md)$/i.test(name));
 const notices=[];
 for(const file of files){const source=`https://huggingface.co/${model}/raw/${revision}/${file.split('/').map(encodeURIComponent).join('/')}`,content=await bounded(source);notices.push({file,source,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});}
 const baseModel=metadata.cardData?.base_model;
 if(typeof baseModel!== 'string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(baseModel)||baseModel.split('/').some(part=>part==='.'||part==='..'))throw new Error(`Expected one explicit upstream repository: ${model}`);
 const upstreamMetadata=JSON.parse((await bounded(`https://huggingface.co/api/models/${baseModel}`)).toString('utf8'));
 const upstreamRevision=upstreamMetadata.sha;if(!/^[a-f0-9]{40}$/.test(upstreamRevision))throw new Error('Invalid upstream revision');
 const upstreamNotices=[];
 for(const file of (upstreamMetadata.siblings??[]).map(s=>s.rfilename).filter(name=>/(^|\/)(license[^/]*|notice[^/]*|readme\.md)$/i.test(name))){
  const source=`https://huggingface.co/${baseModel}/raw/${upstreamRevision}/${file.split('/').map(encodeURIComponent).join('/')}`,content=await bounded(source);
  upstreamNotices.push({file,source,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
 }
 return {model,revision,metadataUrl:url,declaredLicense:metadata.cardData?.license??null,notices,upstream:{model:baseModel,observedRevision:upstreamRevision,declaredLicense:upstreamMetadata.cardData?.license??null,notices:upstreamNotices,scope:'Current upstream revision observed during audit; conversion metadata does not identify its exact originating upstream revision'},scope:'Pinned repository metadata and notice inventory; model-card declarations are not a complete upstream license or training-data audit'};
}));
await writeFile(path.join(root,'evidence.json'),JSON.stringify({models:rows},null,2),{flag:'wx'});console.log(JSON.stringify({root,models:rows}));
