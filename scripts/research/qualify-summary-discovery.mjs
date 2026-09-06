import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`summary-discovery-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'summary-discovery-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  await call('avid_index_media',{files:[source]});
  const old=await call('avid_import_transcript',{id,segments:[{start:0,end:5,text:'Synthetic older notes. The editor reviews the vineyard arrival.'}]}),oldRun=await call('avid_generate_summary',{id,transcriptRevision:old.revision});
  const current=await call('avid_import_transcript',{id,segments:[{start:0,end:5,text:'Synthetic newer notes. The producer approves the final review.'}]}),currentRun=await call('avid_generate_summary',{id,transcriptRevision:current.revision});
  const revision=(await call('avid_transcript_revisions',{id})).revisions.find(value=>value.revision===old.revision);assert.ok(revision);
  await call('avid_delete_transcript_revision',{id,revision:old.revision,expectedSha256:revision.sha256});
  const first=await call('avid_summary_runs',{id,limit:1});assert.ok(first.nextAfter);const second=await call('avid_summary_runs',{id,after:first.nextAfter,limit:1});assert.equal(second.nextAfter,null);
  const rows=[...first.runs,...second.runs];assert.equal(rows.length,2);assert.equal(rows.find(value=>value.runId===oldRun.runId).state,'unavailable');assert.equal(rows.find(value=>value.runId===currentRun.runId).state,'completed');
  const direct=await client.callTool({name:'avid_summary_run',arguments:{runId:oldRun.runId}});assert.ok(direct.isError);
  assert.equal(await sha256File(source),id);
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({oldRun,currentRun,first,second,direct,sourceUnchanged:true,scope:'Disposable synthetic transcript deletion; no source media or prior qualification records modified'},null,2));
  console.log(JSON.stringify({passed:true,unavailableRunVisible:true,healthyRunVisible:true,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
