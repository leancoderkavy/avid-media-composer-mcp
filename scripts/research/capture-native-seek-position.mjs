// Read-only observer for separately performed, explicitly observed UI navigation.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const [label,frameText,viewer]=process.argv.slice(2),frame=Number(frameText);
assert.equal(process.argv.length,5);assert.match(label,/^[a-z][a-z0-9-]{0,40}$/);
assert.ok(Number.isInteger(frame)&&frame>=0&&frame<120);assert.ok(['Source','Record'].includes(viewer));
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Load_7006b4d8.avb';
const mobId='060a2b340101010501010f1013-000000-5faf2bdb12898806-4b74d8bbc16d-18d9';
const file=path.join(project,bin),sourceBin=path.join(project,'MCP_Color_ac0a950e18ee.avb'),media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const expectedBinHash='e44449e45a087468fc8e344ff0115e269a67702e05b53e3ef5991da7ce7da84a';
const sourceHash=await sha256File(sourceBin),mediaHash=await sha256File(media);assert.equal(await sha256File(file),expectedBinHash);
const root=path.resolve('.avid-mcp-analysis',`ui-seek-${label}-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'native-seek-observer',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
try{
 const result=await client.callTool({name:'avid_native_read',arguments:{query:'viewers',bin}},undefined,{timeout:120000});
 await writeFile(path.join(root,'response.json'),JSON.stringify(result,null,2),{flag:'wx'});assert.ok(!result.isError,JSON.stringify(result));
 const rows=result.structuredContent.data.viewers.filter(v=>v.mob_id===mobId&&v.view_type===viewer);
 assert.equal(await sha256File(file),expectedBinHash);assert.equal(await sha256File(sourceBin),sourceHash);assert.equal(await sha256File(media),mediaHash);
 const positionVerified=rows.length===1&&rows[0].current_frame===frame;
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({label,bin,mobId,viewer,expectedFrame:frame,observed:rows[0]??null,matchingViewers:rows,positionVerified,binHash:expectedBinHash,sourceHash,mediaHash,sourceUnchanged:true,scope:'Read-only MCP position observation after separate UI input. Position mismatches retain hash-verified evidence and still fail. No automatic key execution, visual-frame fidelity, source-time mapping or general seeking support.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,observed:rows[0]??null,positionVerified,savedBinUnchanged:true}));
 assert.equal(rows.length,1);assert.equal(rows[0].current_frame,frame);
}finally{await client.close();}
