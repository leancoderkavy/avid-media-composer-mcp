import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`media-filters-${randomUUID()}`);await mkdir(root);
const original='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const originalHash=await sha256File(original),files=[];
for(const [name,size,rate,channels] of [['small','320x180','30000/1001','1'],['large','640x360','25','2']]){
 const file=path.join(root,`${name}.mp4`);files.push(file);
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-ss','95','-i',original,'-t','2','-map','0:v:0','-map','0:a:0','-vf',`scale=${size.replace('x',':')},fps=${rate}`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac',channels,file],{timeoutMs:120000});assert.equal(generated.exitCode,0,generated.stderr);
}
const ids=await Promise.all(files.map(sha256File)),client=new Client({name:'media-filter-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:path.resolve('.avid-mcp-analysis/models'),AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 await call('avid_index_media',{files});
 const all=await call('avid_media_facets',{ids:[...ids,ids[0]]});assert.deepEqual(all.matchingIds,ids);assert.equal(all.mediaCount,2);
 const filtered=await call('avid_media_facets',{ids,filters:{video:{codec:'H264',width:320,height:180,frameRate:'60000/2002'},audio:{codec:'aac',channels:1,sampleRate:48000},duration:{min:1.9,max:2.2}}});assert.deepEqual(filtered.matchingIds,[ids[0]]);
 const mismatch=await call('avid_media_facets',{ids,filters:{video:{width:320},audio:{channels:2}}});assert.deepEqual(mismatch.matchingIds,[]);
 const index=await call('avid_index_visual',{ids,samplesPerFile:1});
 const search=await call('avid_search_visual',{indexId:index.indexId,query:{text:'outdoor scene'},scope:{ids:filtered.matchingIds},limit:10});assert.ok(search.results.length>0);assert.ok(search.results.every(item=>item.id===ids[0]));
 assert.deepEqual(await Promise.all(files.map(sha256File)),ids);assert.equal(await sha256File(original),originalHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,originalHash,files,ids,all,filtered,mismatch,search,sourceUnchanged:true,limitations:['Short owned derivatives; cached probe declarations, not media fidelity or CFR certification','Visual scope dispatch verified; no ranking accuracy claim']},null,2),{flag:'wx'});
 console.log(JSON.stringify({ok:true,root,matched:filtered.matchingIds.length,searchResults:search.results.length}));
}finally{await client.close();}
