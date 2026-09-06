import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',sourceHash=await sha256File(source);
const root=path.resolve('.avid-mcp-analysis',`alias-reconnect-${randomUUID()}`),media=path.join(root,'media');await mkdir(media,{recursive:true});
const original=path.join(media,'original.mp4'),alias=path.join(media,'reconnected.mp4');
const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-i',source,'-t','1','-map','0:v:0','-an','-c:v','libx264',original],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(generated.exitCode,0,generated.stderr);await copyFile(original,alias);const id=await sha256File(original);
const connect=async()=>{const client=new Client({name:'alias-reconnect-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:media,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export,project-write'}}));return client;};
let client=await connect();
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files:[original,alias]});await client.close();await writeFile(original,'changed disposable source');client=await connect();
 const report=await call('avid_media_report',{ids:[id]}),html=await readFile(report.output,'utf8');assert.ok(html.includes('reconnected.mp4')&&!html.includes('original.mp4'));
 const copied=await call('avid_media_artifact',{id,kind:'copy'});assert.equal(await sha256File(copied.output),id);
 const thumbnail=await call('avid_media_artifact',{id,kind:'thumbnail',start:0});assert.ok((await readFile(thumbnail.output)).length>0);assert.equal(await sha256File(alias),id);
 await writeFile(alias,'changed disposable alias');const directory=path.dirname(report.output),before=(await readdir(directory)).sort();
 const refused=await client.callTool({name:'avid_media_report',arguments:{ids:[id]}});assert.equal(refused.isError,true);assert.ok(JSON.stringify(refused).includes('Source changed since indexing'));assert.deepEqual((await readdir(directory)).sort(),before);assert.equal(await readFile(report.output,'utf8'),html);assert.equal(await sha256File(source),sourceHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({id,sourceHash,sourceUnchanged:true,report,copied,thumbnail,allCopiesChangedRefused:true,scope:'Actual MCP reconnect using a one-second Sonoma-derived disposable fixture; report, byte copy and decoded thumbnail via matching alias'},null,2));console.log(JSON.stringify({passed:true,root}));
}finally{await client.close();}
