import {mkdir,copyFile,writeFile,readFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`watch-batches-${randomUUID()}`),folder=path.join(root,'media');await mkdir(path.join(folder,'a'),{recursive:true});
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const copies=[path.join(folder,'a','inner.mp4'),path.join(folder,'a.mp4'),path.join(folder,'z.mp4')];assert.equal(await sha256File(source),id);for(const copy of copies)await copyFile(source,copy,1);
const events=[];
const call=async(name,args)=>{
 const client=new Client({name:'watch-batches',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
 try{const response=await client.callTool({name,arguments:args});events.push({name,args,response});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;}finally{await client.close();}
};
const watch=await call('avid_configure_watch_folder',{options:{folder,maxFiles:1}}),scans=[];
for(let i=0;i<9;i++){const scan=await call('avid_scan_watch_folder',{watchId:watch.id});assert.equal(scan.files,1);scans.push(scan);}
assert.ok(scans.slice(0,3).every(scan=>scan.indexed.length===0));assert.deepEqual(scans.slice(3,6).flatMap(scan=>scan.indexed.map(item=>item.file)),copies);assert.ok(scans.slice(6).every(scan=>scan.indexed.length===0));
const manifest=path.join(root,'avid-mcp-library','watches',watch.id+'.json'),before=JSON.parse(await readFile(manifest,'utf8'));assert.equal(Object.keys(before.observations).length,3);assert.equal(before.cursor,undefined);
const retained=path.join(root,'retained-copy.mp4');assert.equal(path.dirname(copies[1]),folder);assert.equal(path.dirname(retained),root);await rename(copies[1],retained);
for(let i=0;i<2;i++)assert.deepEqual((await call('avid_scan_watch_folder',{watchId:watch.id})).indexed,[]);
const after=JSON.parse(await readFile(manifest,'utf8'));assert.equal(Object.keys(after.observations).length,2);assert.equal(after.observations[copies[1]],undefined);
for(const file of [source,copies[0],retained,copies[2]])assert.equal(await sha256File(file),id);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({scans,before,after,sourceAndCopiesUnchanged:true,events,scope:'Actual MCP reconnect per scan; three Sonoma copies with maxFiles=1, nested/prefix names, first-sweep stability, second-sweep indexing, third-sweep deduplication, fourth-sweep moved-fixture pruning. Not arbitrary concurrent mutation or power-loss durability.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
