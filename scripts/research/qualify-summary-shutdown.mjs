import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {MediaSummaries} from '../../dist/library/summaries.js';
import {VisualSummaries} from '../../dist/library/visual-summaries.js';
import {FrameCaptions} from '../../dist/library/captions.js';
import {MediaLibrary} from '../../dist/library/media-library.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const mode=process.argv[2];assert.ok(['transcript','visual'].includes(mode));assert.equal(process.argv.length,3);
const root=path.resolve('.avid-mcp-analysis',`${mode}-summary-shutdown-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),id);
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,project-write'}),library=new MediaLibrary(config);await library.index([source]);
let input;
if(mode==='transcript'){
 const topics=['Review vineyard arrival footage.','Check music and dialogue levels.','Keep alternate endings for review.'];
 input=(await library.importTranscript(id,topics.map((topic,index)=>({start:index*20,end:(index+1)*20,text:(topic+' Synthetic qualification notes, not source-video dialogue. ').repeat(14)})))).revision;
}else{
 const prior=path.resolve('.avid-mcp-analysis/caption-shutdown-d686be73-0fbf-402a-91da-91b37908f9ab'),evidence=JSON.parse(await readFile(path.join(prior,'evidence.json'),'utf8'));
 const captions=new FrameCaptions(config);input=[];
 for(const result of evidence.results){assert.match(result.captionId,/^[a-f0-9-]{36}$/);await cp(path.join(prior,'avid-mcp-library',`caption-${result.captionId}`),path.join(await library.directory(),`caption-${result.captionId}`),{recursive:true,errorOnExist:true,force:false});const record=await captions.read(result.captionId);assert.equal(record.id,id);input.push({captionId:record.captionId,sha256:record.sha256});}
 await captions.dispose();
}
const service=mode==='transcript'?new MediaSummaries(config):new VisualSummaries(config),events=[];
try{
 const first=service.generate(id,input).then(result=>{events.push('first-completed');return result;}),second=service.generate(id,input).then(result=>{events.push('second-completed');return result;});
 const disposal=service.dispose().then(()=>{events.push('dispose-completed');});await assert.rejects(service.generate(id,input),/closing/);
 const [a,b]=await Promise.all([first,second,disposal]);assert.deepEqual(events,['first-completed','second-completed','dispose-completed']);
 assert.ok(a.nodes>1&&b.nodes>1);const verified=[await service.node(a.revision),await service.node(b.revision)];
 await service.dispose();assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({mode,input,events,results:[a,b],verified,sourceUnchanged:true,passed:true,scope:'Real cached summary model, two admitted trees followed by immediate disposal and new-work refusal. Transcript mode uses explicitly synthetic notes; visual mode reuses hash-verified prior Florence captions. Not factual accuracy, allocator-leak, whole-batch or operating-system shutdown proof.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,mode,passed:true}));
}finally{await service.dispose();}
