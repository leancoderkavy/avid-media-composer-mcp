import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`qc-color-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'qc-color-metadata-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
const reports=[];
try{
 for(const transfer of ['smpte2084','arib-std-b67','bt709']){
  const file=path.join(root,`${transfer}.mkv`),primaries=transfer==='bt709'?'bt709':'bt2020',matrix=transfer==='bt709'?'bt709':'bt2020nc';
  const g=await runProcess('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2','-vf',`setparams=range=limited:color_primaries=${primaries}:color_trc=${transfer}:colorspace=${matrix}`,'-c:v','libx264','-pix_fmt','yuv420p10le','-color_range','tv','-color_primaries',primaries,'-color_trc',transfer,'-colorspace',matrix,file],{timeoutMs:30000,maxOutputBytes:1048576});assert.equal(g.exitCode,0,g.stderr);
  const id=await sha256File(file);await call('avid_index_media',{files:[file]});const report=await call('avid_media_qc',{id,options:{end:2}});
  const details=report.streamDetails.video;assert.equal(details.color_transfer,transfer);assert.equal(details.color_primaries,primaries);assert.equal(details.color_space,matrix);assert.equal(details.color_range,'tv');assert.equal(details.pix_fmt,'yuv420p10le');assert.equal(report.streamDetails.audio,null);
  const saved=JSON.parse(await readFile(report.output,'utf8'));assert.deepEqual(saved.streamDetails,report.streamDetails);assert.ok((await readFile(report.html,'utf8')).includes(transfer));assert.equal(await sha256File(file),id);reports.push(report);
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({reports,sourceUnchanged:true,scope:'Generated tag-preservation fixtures only; no real HDR mastering or tone-map qualification'},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
}finally{await client.close();}
