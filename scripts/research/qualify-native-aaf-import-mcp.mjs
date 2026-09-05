// Import the checksum-qualified selects once into a new disposable native bin.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const file=path.resolve('.avid-mcp-analysis/pcm-selects-mcp-f5a64b29-f0f8-4a5d-8884-f05ce760bb1a/avid-mcp-library/aaf-2ba5a255-2f6a-4645-85ed-58b5ba0e7040/selects.aaf');
const expectedSha256='823befe43a192982e25b6c882dd85865595fdcf1184eec03e838206d74e57aa6';assert.equal(await sha256File(file),expectedSha256);
const projectPath='D:/Avid Projects/MCP_Sonoma_30p_20260905',originalBin=path.join(projectPath,'MCP_AAF_Selects_20260905.avb'),originalSha=await sha256File(originalBin);
const root=path.resolve('.avid-mcp-analysis',`native-aaf-import-mcp-${randomUUID()}`);await mkdir(root);
const binName=`MCP_Import_${randomUUID().slice(0,8)}`,bin=`${binName}.avb`,records=[];
const client=new Client({name:'native-aaf-import-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${projectPath};${path.resolve('.avid-mcp-analysis')}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,edit,project-write,export'}}));
const call=async(name,args,expectError=false)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));assert.equal(Boolean(result.isError),expectError,JSON.stringify(result));return expectError?result:result.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation});return call('avid_native_apply',{token:preview.token});};
try{
 const project=await call('avid_native_read',{query:'project'});assert.equal(path.resolve(project.path),path.resolve(projectPath));
 const settings=await call('avid_native_read',{query:'import_settings'});assert.ok(settings.some(value=>value.setting_names?.includes('Untitled')));
 await action({action:'create_bin',name:binName});
 const operation={action:'import_aaf_selects',bin,file,expectedSha256,preset:'Untitled'};
 const wrongHash=await call('avid_native_preview',{operation:{...operation,expectedSha256:'0'.repeat(64)}},true);assert.match(JSON.stringify(wrongHash),/checksum changed/);
 assert.deepEqual(await call('avid_native_read',{query:'clips',bin}),[]);
 const preview=await call('avid_native_preview',{operation});const applied=await call('avid_native_apply',{token:preview.token});
 assert.equal(applied.hostMetadataVerified,true);assert.equal(applied.sourceFilesUnchanged,true);assert.equal(applied.persistenceVerified,false);
 const replay=await call('avid_native_apply',{token:preview.token},true);assert.match(JSON.stringify(replay),/consumed/);
 const occupied=await call('avid_native_preview',{operation},true);assert.match(JSON.stringify(occupied),/empty destination bin/);
 await action({action:'close_bin',bin});const savedBinSha256=await sha256File(path.join(projectPath,bin));await action({action:'open_bin',bin});
 const clips=await call('avid_native_read',{query:'clips',bin});assert.equal(clips.filter(item=>item.mob_id===applied.sequence.mob_id).length,1);
 const snapshot=await call('avid_snapshot_saved_bins',{bins:[path.join(projectPath,bin)]});
 assert.equal(await sha256File(file),expectedSha256);assert.equal(await sha256File(originalBin),originalSha);
 const lock=await call('avid_native_lock_status',{});assert.equal(lock.locked,false);
 const evidence={bin,preview,applied,replayRejected:true,occupiedRefused:true,wrongChecksumRefused:true,reopenedIdentityVerified:true,savedBinSha256,snapshot,originalBinAndAafUnchanged:true};
 await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),bin,sequence:applied.sequence,savedBinSha256,reopenedIdentityVerified:true}));
}finally{await client.close();}
