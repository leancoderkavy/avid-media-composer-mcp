import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`setup-runtime-${randomUUID()}`);await mkdir(root);
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),models=path.resolve('.avid-mcp-analysis/models');
const bin='C:/Users/kavyr/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin';
const flags=['--root',path.dirname(source),'--output',root,'--model-dir',models,'--ffmpeg',path.join(bin,'ffmpeg.exe'),'--ffprobe',path.join(bin,'ffprobe.exe'),'--python','C:/Python312/python.exe','--capabilities','inspect,export,project-write'];
const cli=async args=>{const result=await runProcess(process.execPath,['dist/cli.js',...args],{timeoutMs:30000,maxOutputBytes:1024*1024});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout);};
const connect=async entry=>{const client=new Client({name:'generated-runtime-setup-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:entry.command,args:entry.args,env:{...getDefaultEnvironment(),...entry.env},stderr:'pipe'}));return client;};
const results=[];
for(const name of ['claude','cursor','vscode','lmstudio','generic']){
 const generated=await cli(['--client',name,...flags]),key=name==='vscode'?'servers':'mcpServers',entry=generated[key]['avid-media-composer'];assert.equal(entry.env.AVID_MCP_MODEL_DIR,models);assert.equal(entry.env.AVID_MCP_CAPABILITIES,'inspect,export,project-write');
 const client=await connect(entry);const call=async(tool,args)=>{const r=await client.callTool({name:tool,arguments:args},undefined,{timeout:180000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
 try{await call('avid_ping',{});await call('avid_index_media',{files:[source]});const metadata=await call('avid_library_metadata',{ids:[id]});assert.equal(metadata[0].id,id);let caption;if(name==='generic'){caption=await call('avid_caption_frame',{id,time:111.2});assert.match(caption.machineText,/barrel/i);}results.push({name,generated,indexed:true,caption});}finally{await client.close();}
}
const file=path.join(root,'client.json');await writeFile(file,JSON.stringify({theme:'preserve',mcpServers:{other:{command:'preserve'}}}));
await cli(['--client','generic',...flags,'--config',file,'--install']);
const current=await cli(['--config-status','--config',file]);
await cli(['--client','generic','--root',path.dirname(source),'--output',root,'--config',file,'--expected-sha256',current.sha256,'--update']);
const readOnly=JSON.parse(await readFile(file,'utf8'));assert.equal(readOnly.theme,'preserve');assert.deepEqual(readOnly.mcpServers.other,{command:'preserve'});assert.equal(readOnly.mcpServers['avid-media-composer'].env.AVID_MCP_CAPABILITIES,'inspect');assert.ok(!readOnly.mcpServers['avid-media-composer'].env.AVID_MCP_MODEL_DIR);
const client=await connect(readOnly.mcpServers['avid-media-composer']);try{const refused=await client.callTool({name:'avid_caption_frame',arguments:{id,time:111.2}});assert.equal(refused.isError,true);}finally{await client.close();}
assert.equal(await sha256File(source),id);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({results,updatePreservedUnrelatedEntries:true,readOnlyUpdateDeniedCaption:true,sourceUnchanged:true,scope:'Actual generated-command MCP execution for five configuration formats and generic caption inference. Temporary configuration install/update; not named-client UI qualification.'},null,2));console.log(JSON.stringify({passed:true,evidence:path.join(root,'evidence.json')}));
