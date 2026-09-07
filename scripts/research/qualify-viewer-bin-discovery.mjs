// Actual read-only MCP discovery and returned-bin handoff; never sends UI input.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',server=path.resolve(process.argv[2]??'dist/index.js');
const expectedBin=path.join(project,'MCP_Load_7006b4d8.avb'),expectedMob='060a2b340101010501010f1013-000000-5faf2bdb12898806-4b74d8bbc16d-18d9';
const protectedFiles=[expectedBin,path.join(project,'MCP_AAF_Selects_20260905.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',server];
const before=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`viewer-bin-discovery-${randomUUID()}`);await mkdir(root);
const sessions=[];
for(let session=0;session<2;session++){
  const client=new Client({name:'viewer-bin-discovery-qualification',version:'1'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[server],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
    const call=async args=>{const response=await client.callTool({name:'avid_native_read',arguments:args},undefined,{timeout:120000});await writeFile(path.join(root,`${session}-${args.query}.json`),JSON.stringify(response,null,2),{flag:'wx'});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
    const discovery=await call({query:'viewer_bins'}),sources=discovery.viewers.filter(v=>v.view_type==='Source');
    assert.equal(discovery.keyboardFocusVerified,false);assert.equal(sources.length,1);
    const source=sources[0];assert.equal(source.mob_id,expectedMob);assert.equal(path.resolve(source.bin).toLowerCase(),path.resolve(expectedBin).toLowerCase());
    const positions=await call({query:'viewers',bin:source.bin});
    const matching=positions.viewers.filter(v=>v.mob_id===source.mob_id&&v.view_type===source.view_type);
    assert.equal(matching.length,1);assert.equal(matching[0].current_frame,0);assert.equal(positions.keyboardFocusVerified,false);
    sessions.push({discovery,positions});
  }finally{await client.close();}
}
assert.deepEqual(sessions[1],sessions[0]);
const after=await Promise.all(protectedFiles.map(sha256File));assert.deepEqual(after,before);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({server,protectedFiles,before,after,sessions,scope:'Two actual read-only MCP sessions discover the known loaded Sonoma source bin without a selected-bin argument, pass its returned path into position inspection, and preserve source/bin/server hashes. No UI input, keyboard focus, concurrent editing, atomic state or video fidelity qualification.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
