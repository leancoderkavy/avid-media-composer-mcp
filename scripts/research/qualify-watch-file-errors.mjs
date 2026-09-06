import {mkdir,copyFile,writeFile,readFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`watch-file-errors-${randomUUID()}`),folder=path.join(root,'media');await mkdir(folder,{recursive:true});
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',copy=path.join(folder,'clip.mp4'),broken=path.join(folder,'broken.mp4'),retained=path.join(root,'broken-fixture.txt');
assert.equal(await sha256File(source),id);await copyFile(source,copy,1);await writeFile(broken,'invalid media fixture',{flag:'wx'});
const client=new Client({name:'watch-file-errors',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
const events=[];
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,args,response});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const until=async(predicate)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error('Polling qualification timed out');};
try{
 const watch=await call('avid_configure_watch_folder',{options:{folder}});
 await call('avid_watch_service',{action:'start',intervalSeconds:10});
 let failed;await until(async()=>{failed=await call('avid_watch_service',{action:'status'});return !failed.scanInProgress&&failed.watchErrors.length===1;});
 assert.equal(failed.watchErrors[0].id,watch.id);assert.match(failed.watchErrors[0].error,/1 media file\(s\) failed indexing/);
 const manifest=path.join(root,'avid-mcp-library','watches',watch.id+'.json'),before=JSON.parse(await readFile(manifest,'utf8'));
 assert.equal(before.observations[copy].mediaId,id);assert.ok(before.observations[broken].error);assert.equal(before.observations[broken].mediaId,undefined);
 // Move only the malformed fixture created in this UUID workspace, retaining its bytes.
 assert.equal(path.dirname(broken),folder);assert.equal(path.dirname(retained),root);await rename(broken,retained);
 let recovered;await until(async()=>{recovered=await call('avid_watch_service',{action:'status'});return !recovered.scanInProgress&&recovered.lastError===null&&recovered.watchErrors.length===0;});
 await call('avid_watch_service',{action:'stop'});
 const after=JSON.parse(await readFile(manifest,'utf8'));assert.equal(after.observations[copy].mediaId,id);assert.equal(after.observations[broken],undefined);
 assert.equal(await readFile(retained,'utf8'),'invalid media fixture');assert.equal(await sha256File(source),id);assert.equal(await sha256File(copy),id);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({failed,recovered,before,after,sourceAndCopyUnchanged:true,events,scope:'Actual ffprobe rejection of malformed fixture alongside healthy Sonoma indexing via MCP polling. Explicit fixture move clears diagnostics; not corrupt-media repair.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true}));
}finally{await client.close();}
