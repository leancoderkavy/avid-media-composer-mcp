import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`caption-batch-${randomUUID()}`);await mkdir(root);
const connect=async()=>{const c=new Client({name:'caption-lifecycle-proof',version:'1.0'});await c.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));return c;};let client=await connect();
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:180000});assert.ok(!r.isError,JSON.stringify(r));if(name==="avid_read_caption"){const image=r.content.find(block=>block.type==="image");assert.ok(image);assert.equal(image.mimeType,"image/jpeg");assert.equal(createHash("sha256").update(Buffer.from(image.data,"base64")).digest("hex"),r.structuredContent.data.imageSha256);}return r.structuredContent.data;};
async function until(fn,predicate){const deadline=Date.now()+240000;while(Date.now()<deadline){const value=await fn();if(predicate(value))return value;await new Promise(r=>setTimeout(r,300));}throw new Error("Timed out");}
try{
 const times=[2,20,40,60,80,100,111.2,130,150,164.866667,180,189];
 await call('avid_index_media',{files:[source]});
 const started=await call('avid_start_analysis_job',{job:{kind:'caption_batch',id,times}});
 const run=await until(async()=>(await call('avid_caption_runs',{id})).runs[0],v=>v?.completedCaptions>=1);
 assert.ok(run.completedCaptions<times.length);
 await call('avid_cancel_analysis_job',{jobId:started.id});
 const cancelled=await until(()=>call('avid_analysis_job_status',{jobId:started.id}),v=>['cancelled','completed','failed'].includes(v.status));assert.equal(cancelled.status,'cancelled');
 const before=await call('avid_caption_run',{runId:run.runId});
 const parent=path.join(root,'avid-mcp-library',`caption-run-${run.runId}`);
 const manifest=await readFile(path.join(parent,'manifest.json'),'utf8');
 const checkpointBytes=await Promise.all(before.captions.map((_,i)=>readFile(path.join(parent,`${i}.json`),'utf8')));
 await client.close();client=await connect();
 assert.deepEqual(await call('avid_caption_run',{runId:run.runId}),before);
 const resumed=await call('avid_start_analysis_job',{job:{kind:'caption_resume',runId:run.runId}});
 const completed=await until(()=>call('avid_analysis_job_status',{jobId:resumed.id}),v=>['cancelled','completed','failed'].includes(v.status));assert.equal(completed.status,'completed',JSON.stringify(completed));
 assert.equal(completed.result.reusedCaptions,before.completedCaptions);assert.equal(completed.result.completedCaptions,times.length);
 assert.deepEqual(completed.result.captions.slice(0,before.completedCaptions),before.captions);
 const records=[];for(const item of completed.result.captions){const record=await call('avid_read_caption',{captionId:item.captionId});assert.equal(record.sha256,item.sha256);records.push(record);}
 assert.equal(await readFile(path.join(parent,'manifest.json'),'utf8'),manifest);
 assert.deepEqual(await Promise.all(before.captions.map((_,i)=>readFile(path.join(parent,`${i}.json`),'utf8'))),checkpointBytes);
 assert.equal(await sha256File(source),id);
 const baselineJob=await call('avid_start_analysis_job',{job:{kind:'caption_batch',id,times}});
 const baseline=await until(()=>call('avid_analysis_job_status',{jobId:baselineJob.id}),v=>['cancelled','completed','failed'].includes(v.status));assert.equal(baseline.status,'completed',JSON.stringify(baseline));
 const baselineRecords=[];for(const item of baseline.result.captions)baselineRecords.push(await call('avid_read_caption',{captionId:item.captionId}));
 assert.deepEqual(records.map(r=>({time:r.time,text:r.machineText,imageSha256:r.imageSha256})),baselineRecords.map(r=>({time:r.time,text:r.machineText,imageSha256:r.imageSha256})));
 assert.equal(await sha256File(source),id);
 const rejected=await client.callTool({name:'avid_resume_captions',arguments:{runId:completed.result.runId}});assert.equal(rejected.isError,true);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({cancelled,before,completed,records,baseline,baselineRecords,baselineTextAndImagesEqual:true,parentUnchanged:true,sourceUnchanged:true,reconnectEqual:true,completedResumeRejected:true,scope:'Actual Sonoma caption worker cancellation, reconnect and prefix reuse; not caption accuracy, concurrent edits or long-media resource acceptance'},null,2));
 console.log(JSON.stringify({passed:true,reused:before.completedCaptions,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
