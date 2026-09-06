import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`color-filters-${randomUUID()}`);await mkdir(root);
const original='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',originalHash=await sha256File(original),files=[];
const variants=[['sdr','bt709','bt709','bt709'],['pq','smpte2084','bt2020','bt2020nc'],['hlg','arib-std-b67','bt2020','bt2020nc']];
for(const [name,transfer,primaries,matrix] of variants){
 const file=path.join(root,`${name}.mkv`);files.push(file);
 const generated=await runProcess('ffmpeg',['-nostdin','-v','error','-n','-ss','95','-i',original,'-t','1','-map','0:v:0','-an','-vf',`scale=160:90,setparams=range=tv:color_primaries=${primaries}:color_trc=${transfer}:colorspace=${matrix}`,'-c:v','ffv1','-pix_fmt','yuv420p10le','-color_range','tv','-colorspace',matrix,'-color_trc',transfer,'-color_primaries',primaries,file],{timeoutMs:120000});assert.equal(generated.exitCode,0,generated.stderr);
}
const ids=await Promise.all(files.map(sha256File)),client=new Client({name:'color-filter-proof',version:'1.0'}),results=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
const call=async(name,args)=>{const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
try{
 await call('avid_index_media',{files});
 for(let i=0;i<variants.length;i++){
  const [,colorTransfer,colorPrimaries,colorSpace]=variants[i];
  const filters={video:{codec:'ffv1',pixelFormat:'yuv420p10le',colorRange:'tv',colorTransfer,colorPrimaries,colorSpace}};
  const result=await call('avid_media_facets',{ids,filters});assert.deepEqual(result.matchingIds,[ids[i]]);results.push({filters,result});
 }
 const mismatch=await call('avid_media_facets',{ids,filters:{video:{colorTransfer:'smpte2084',colorPrimaries:'bt709'}}});assert.deepEqual(mismatch.matchingIds,[]);
 assert.deepEqual(await Promise.all(files.map(sha256File)),ids);assert.equal(await sha256File(original),originalHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({files,ids,originalHash,results,mismatch,sourceUnchanged:true,scope:'One-second Sonoma derivatives deliberately tagged SDR/PQ/HLG. Tags are synthetic; no HDR conversion, mastering, visual fidelity or dynamic metadata qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,matches:results.length}));
}finally{await client.close();}
