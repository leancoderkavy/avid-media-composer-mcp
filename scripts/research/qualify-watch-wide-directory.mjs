import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {directoryPage} from '../../dist/library/directory-page.js';
const root=path.resolve('.avid-mcp-analysis',`watch-wide-${randomUUID()}`),folder=path.join(root,'media');await mkdir(folder,{recursive:true});
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca',copy=path.join(folder,'z.mp4');
assert.equal(await sha256File(source),id);await copyFile(source,copy,1);
for(let start=0;start<10020;start+=32)await Promise.all(Array.from({length:Math.min(32,10020-start)},(_,i)=>writeFile(path.join(folder,`a-${String(start+i).padStart(5,'0')}.txt`),'',{flag:'wx'})));
const sample=await directoryPage(folder,17,()=>true);assert.equal(sample.length,17);assert.equal(sample[0].name,'a-00000.txt');assert.equal(sample.at(-1).name,'a-00016.txt');
const events=[];
const call=async(name,args)=>{
 const client=new Client({name:'watch-wide',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,project-write'}}));
 try{const response=await client.callTool({name,arguments:args});events.push({name,args,response});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;}finally{await client.close();}
};
const watch=await call('avid_configure_watch_folder',{options:{folder,maxFiles:1}}),scans=[];
for(let i=0;i<6;i++)scans.push(await call('avid_scan_watch_folder',{watchId:watch.id}));
for(const index of [0,2,4]){assert.equal(scans[index].files,0);assert.equal(scans[index].truncated,true);}
for(const index of [1,3,5]){assert.equal(scans[index].files,1);assert.equal(scans[index].truncated,false);}
assert.deepEqual(scans[1].indexed,[]);assert.equal(scans[3].indexed[0].id,id);assert.deepEqual(scans[5].indexed,[]);
const manifest=JSON.parse(await readFile(path.join(root,'avid-mcp-library','watches',watch.id+'.json'),'utf8'));assert.equal(manifest.observations[copy].mediaId,id);assert.equal(manifest.cursor,undefined);
assert.equal(await sha256File(source),id);assert.equal(await sha256File(copy),id);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({entryCount:10021,sample:sample.map(entry=>entry.name),scans,manifest,sourceAndCopyUnchanged:true,events,scope:'Actual streamed selection and MCP reconnect continuation beyond 10000 entries; stable Sonoma indexing then deduplication. Does not measure total process memory or bound directory enumeration time.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
