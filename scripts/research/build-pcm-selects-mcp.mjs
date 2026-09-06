// Build a new two-cut AAF through MCP from the owned PCM master export.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const template=path.resolve('.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf');
const root=path.resolve('.avid-mcp-analysis',`pcm-selects-mcp-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'pcm-aaf-builder-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const records=[];
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 const inspected=await call('avid_inspect_aaf_template',{template});assert.equal(inspected.sha256,'5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d');assert.equal(inspected.masters.length,1);
 const master=inspected.masters[0];assert.equal(master.name,'Sonoma_SourceClock_Stereo.Exported.01');
 assert.deepEqual(master.slots.map(slot=>[slot.slotId,slot.kind,slot.rate]),[[1,'picture','30'],[2,'sound','30'],[3,'sound','30']]);
 assert.equal(inspected.media.length,1);assert.equal(inspected.media[0].sha256,'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb');
 const request={template,expectedSha256:inspected.sha256,name:'MCP_PCM_AAF_Selects',rate:'30',tracks:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound'},{name:'A2',kind:'sound'}],selects:[2850,3300].map(start=>({mobId:master.mobId,start,length:60,slotIds:[1,2,3]}))};
 const output=await call('avid_build_aaf_selects',{request});assert.equal(output.frames,120);assert.equal(output.tracks,3);assert.equal(output.conformanceVerified,true);assert.equal(output.hostImportVerified,false);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({inspected,request,output},null,2),{flag:'wx'});console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output:output.output,sha256:output.sha256,frames:120,hostImportVerified:false}));
}finally{await client.close();}
