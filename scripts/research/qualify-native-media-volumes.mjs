import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const protectedFiles=[path.join(project,'MCP_Load_7006b4d8.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'];
const hashes=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`native-media-volumes-${randomUUID()}`);await mkdir(root);
const responses=[];
for(let n=0;n<2;n++){
  const client=new Client({name:'native-media-volume-qualification',version:'1'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),
      AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
    const response=await client.callTool({name:'avid_native_read',arguments:{query:'media_volumes'}},undefined,{timeout:120000});
    responses.push(response);await writeFile(path.join(root,'responses.json'),JSON.stringify(responses,null,2));
    assert.ok(!response.isError,JSON.stringify(response));const data=response.structuredContent.data;
    assert.equal(data.freeSpaceUnit,null);assert.equal(data.pathsResolved,false);assert.equal(data.mediaOnlineVerified,false);
    assert.deepEqual(data.volumes.map(v=>v.name).sort(),['Games (E:)','Luqi (C:)','Mili (D:)']);
    for(const volume of data.volumes){assert.match(volume.free_space,/^[0-9]+$/);assert.ok(!Object.hasOwn(volume,'is_shared'));}
  }finally{await client.close();}
}
assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),hashes);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,protectedFiles,hashes,responses,
  sourceUnchanged:true,scope:'Two fresh inspect-only stdio MCP sessions against the existing qualified Windows Avid host. Volume display names matched observed fixture expectations. Free-space values may change and are not interpreted as bytes, capacity or relink status.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true,connections:2}));
