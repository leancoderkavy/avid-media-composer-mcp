import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const fixtures=[{mobId:'060a2b340101010501010f1013-000000-4db8fc4012898806-9c3dd8bbc16d-18d9',bin:path.resolve(project,'MCP_Color_ac0a950e18ee.avb')},{mobId:'060a2b340101010501010f1013-000000-5faf2bdb12898806-4b74d8bbc16d-18d9',bin:path.resolve(project,'MCP_Load_7006b4d8.avb')}];
const protectedFiles=[source,...fixtures.map(f=>f.bin)],before=await Promise.all(protectedFiles.map(sha256File));
assert.equal(before[0],'3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca');
const root=path.resolve('.avid-mcp-analysis',`native-mob-bin-${randomUUID()}`);await mkdir(root);
const results=[];
for(let pass=0;pass<2;pass++){
 const client=new Client({name:'native-mob-bin-qualification',version:'1.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_CAPABILITIES:'inspect'}}));
 try{
  for(const fixture of fixtures){
   const response=await client.callTool({name:'avid_native_read',arguments:{query:'mob_bin',mobId:fixture.mobId}});results.push({pass,fixture,response});
   await writeFile(path.join(root,'responses.json'),JSON.stringify(results,null,2));
   assert.ok(!response.isError,JSON.stringify(response));assert.equal(response.structuredContent.data.bin,fixture.bin);assert.equal(response.structuredContent.data.mobId,fixture.mobId);
  }
 }finally{await client.close();}
}
assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),before);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({fixtures,hashes:before,reconnected:true,sourceAndBinsUnchanged:true,results,scope:'Actual read-only native clip-bin lookup on two known disposable sequence MOBs. No media relink, viewer alias mapping, cross-project lookup or uniqueness claim.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,lookups:results.length,reconnected:true,sourceAndBinsUnchanged:true}));
