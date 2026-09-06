import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {VisualSearch} from '../../dist/library/visual.js';
import {MediaLibrary} from '../../dist/library/media-library.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const root=path.resolve('.avid-mcp-analysis',`visual-shutdown-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),id);
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'});
await new MediaLibrary(config).index([source]);
const visual=new VisualSearch(config),events=[];
try{
 const indexing=visual.index([id],2).then(result=>{events.push('index-completed');return result;});
 const disposal=visual.dispose().then(()=>{events.push('dispose-completed');});
 await assert.rejects(visual.index([id],1),/closing/);
 const [result]=await Promise.all([indexing,disposal]);
 assert.deepEqual(events,['index-completed','dispose-completed']);assert.equal(result.samples,2);
 const checkpoint=await visual.checkpoints.status(result.runId);assert.equal(checkpoint.state,'completed');
 await assert.rejects(visual.search(result.indexId,{text:'vineyard'},1),/closing/);
 await visual.dispose();assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,checkpoint,events,sourceUnchanged:true,passed:true,scope:'Real cached CLIP models and Sonoma two-frame indexing admitted before immediate shutdown. Index/checkpoint completed before disposal resolved; subsequent inference refused. No model downloads, forced failure, OS shutdown or allocator-leak measurement.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{await visual.dispose();}
