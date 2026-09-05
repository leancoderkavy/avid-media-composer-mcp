import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file=path.resolve('.avid-mcp-analysis/pcm-selects-mcp-f5a64b29-f0f8-4a5d-8884-f05ce760bb1a/avid-mcp-library/aaf-2ba5a255-2f6a-4645-85ed-58b5ba0e7040/selects.aaf');
const template=path.resolve('.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf');
const before=await sha256File(file);assert.equal(before,'823befe43a192982e25b6c882dd85865595fdcf1184eec03e838206d74e57aa6');
const root=path.resolve('.avid-mcp-analysis',`aaf-selects-inspection-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'aaf-selects-inspection',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
try{
 const result=await client.callTool({name:'avid_inspect_aaf_selects',arguments:{file}});assert.ok(!result.isError,JSON.stringify(result));const data=result.structuredContent.data;
 assert.equal(data.sha256,before);assert.equal(data.composition.name,'MCP_PCM_AAF_Selects');assert.equal(data.composition.frames,120);assert.equal(data.composition.rate,'30');assert.equal(data.composition.tracks.length,3);
 for(const [index,track] of data.composition.tracks.entries())assert.deepEqual(track.cuts.map(c=>[c.slotId,c.position,c.start,c.length]),[[index+1,0,2850,60],[index+1,60,3300,60]]);
 assert.equal(data.media.length,1);assert.equal(data.media[0].sha256,'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb');assert.equal(await sha256File(data.media[0].file),data.media[0].sha256);
 const rejected=await client.callTool({name:'avid_inspect_aaf_selects',arguments:{file:template}});assert.equal(rejected.isError,true);assert.match(JSON.stringify(rejected),/exactly one composition/);
 assert.equal(await sha256File(file),before);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,rejected,sourceUnchanged:true,hostImportAttempted:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),tracks:3,cutsPerTrack:2,masterOnlyRejected:true,sourceUnchanged:true}));
}finally{await client.close();}
