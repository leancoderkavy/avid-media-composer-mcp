import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFile,readFile} from 'node:fs/promises';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import assert from 'node:assert/strict';
const id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const client=new Client({name:'transcript-qualification',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{...process.env,AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:'.avid-mcp-analysis/sonoma-library-20260905',AVID_MCP_CAPABILITIES:'inspect,project-write,export'}});
await client.connect(transport);
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  // Deliberately synthetic review text; this does not claim speech accuracy.
  const original=await call('avid_import_transcript',{id,segments:[{start:1,end:2,text:'Qualification draft'}]});
  const revisions=await call('avid_transcript_revisions',{id});
  const first=revisions.revisions.find(item=>item.revision===original.revision);assert.ok(first);
  const corrected=await call('avid_correct_transcript',{id,revision:first.revision,expectedSha256:first.sha256,edits:[{action:'replace',index:0,segment:{start:1,end:2.5,text:'Qualification corrected',speaker:'Reviewer supplied'}}]});
  const range=await call('avid_transcript_range',{id,revision:corrected.revision,start:0,end:3});assert.equal(range.segments[0].text,'Qualification corrected');
  const search=await call('avid_search_media',{ids:[id],query:'Qualification corrected',revisions:{[id]:corrected.revision}});assert.equal(search.results.length,1);
  const exported=await call('avid_export_transcript',{id,revision:corrected.revision,format:'srt'});assert.match(await readFile(exported.output,'utf8'),/00:00:01,000 --> 00:00:02,500/);
  const removed=await call('avid_delete_transcript_revision',{id,revision:first.revision,expectedSha256:first.sha256});assert.equal(removed.deleted,true);
  const invalid=await client.callTool({name:'avid_transcript_range',arguments:{id,revision:first.revision,start:0,end:3}});assert.equal(invalid.isError,true);
  assert.equal(await sha256File('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'),id);
  const evidence={original,corrected,range,exported,removed,sourceUnchanged:true,scope:'Synthetic review text on real media; not speech accuracy'};
  await writeFile('.avid-mcp-analysis/sonoma-library-20260905/transcript-corrections.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({passed:true,transport:'stdio',correctionSearchExportDeletion:true,sourceUnchanged:true}));
}finally{await client.close();}
