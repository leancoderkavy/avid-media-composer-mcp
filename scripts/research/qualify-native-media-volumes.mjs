import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.ok(process.argv.length<=3,'Optional argument is an absolute MCP entrypoint');
const entrypoint=process.argv[2]??path.resolve('dist/index.js');assert.ok(path.isAbsolute(entrypoint));
const entrypointSha256=await sha256File(entrypoint);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const protectedFiles=[path.join(project,'MCP_Load_7006b4d8.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4'];
const hashes=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`native-media-volumes-${randomUUID()}`);await mkdir(root);
const responses=[];
for(let n=0;n<3;n++){
  const client=new Client({name:'native-media-volume-qualification',version:'1'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entrypoint],cwd:path.dirname(entrypoint),stderr:'pipe',env:{...getDefaultEnvironment(),
      AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:n===2?root:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
    const response=await client.callTool({name:'avid_native_read',arguments:{query:'media_volumes'}},undefined,{timeout:120000});
    responses.push(response);await writeFile(path.join(root,'responses.json'),JSON.stringify(responses,null,2));
    if(n===2){
      assert.equal(response.isError,true,'Out-of-scope project must refuse volume inventory');
      assert.ok(!response.structuredContent?.data);
      for(const name of ['Games (E:)','Luqi (C:)','Mili (D:)'])assert.ok(!JSON.stringify(response).includes(name));
      continue;
    }
    assert.ok(!response.isError,JSON.stringify(response));const data=response.structuredContent.data;
    assert.equal(data.freeSpaceUnit,null);assert.equal(data.pathsResolved,false);assert.equal(data.mediaOnlineVerified,false);
    assert.deepEqual(data.volumes.map(v=>v.name).sort(),['Games (E:)','Luqi (C:)','Mili (D:)']);
    for(const volume of data.volumes){assert.match(volume.free_space,/^[0-9]+$/);assert.ok(!Object.hasOwn(volume,'is_shared'));}
  }finally{await client.close();}
}
assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),hashes);
assert.equal(await sha256File(entrypoint),entrypointSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,protectedFiles,hashes,responses,entrypoint,entrypointSha256,serverWorkingDirectory:path.dirname(entrypoint),
  sourceUnchanged:true,outOfScopeRefused:true,scope:'Two fresh authorized inspect-only stdio MCP sessions plus a third with roots excluding the current project. The third refuses without volume data. Volume display names matched observed fixture expectations in authorized sessions. Free-space values may change and are not interpreted as bytes, capacity or relink status.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true,connections:3,outOfScopeRefused:true}));
