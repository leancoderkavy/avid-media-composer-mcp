import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {SpeechAnalysis} from '../../dist/library/speech.js';
import {FrameCaptions} from '../../dist/library/captions.js';
import {MediaLibrary} from '../../dist/library/media-library.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const mode=process.argv[2];assert.ok(['speech','caption'].includes(mode));assert.equal(process.argv.length,3);
const root=path.resolve('.avid-mcp-analysis',`${mode}-shutdown-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';assert.equal(await sha256File(source),id);
const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'});
await new MediaLibrary(config).index([source]);
const service=mode==='speech'?new SpeechAnalysis(config):new FrameCaptions(config),events=[];
const run=time=>mode==='speech'?service.transcribe(id,time,time+1,{model:'tiny.en',language:'en'}):service.generate(id,time);
try{
 const first=run(0).then(result=>{events.push('first-completed');return result;}),second=run(1).then(result=>{events.push('second-completed');return result;});
 const disposal=service.dispose().then(()=>{events.push('dispose-completed');});
 await assert.rejects(run(2),/closing/);
 const [a,b]=await Promise.all([first,second,disposal]);assert.deepEqual(events,['first-completed','second-completed','dispose-completed']);
 const verified=[];for(const result of [a,b])verified.push(mode==='speech'?await service.checkpoints.status(result.runId):await service.read(result.captionId));
 await service.dispose();assert.equal(await sha256File(source),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({mode,events,results:[a,b],verified,sourceUnchanged:true,passed:true,scope:'Two real cached-model operations admitted before immediate disposal; queue drains and new work refuses. Output records remain inspectable. No downloads, factual-quality claim, memory-leak measurement or operating-system shutdown qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,mode,passed:true}));
}finally{await service.dispose();}
