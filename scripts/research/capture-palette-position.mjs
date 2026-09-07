// Read-only native observer. UI actions are performed separately from fresh computer-use observations.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [label,baselineFile,expectedText]=process.argv.slice(2);assert.ok(process.argv.length===3||process.argv.length===5);assert.match(label,/^[a-z][a-z0-9-]{0,40}$/);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_Load_7006b4d8.avb';
const files=[path.join(project,bin),path.join(project,'MCP_AAF_Selects_20260905.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',path.resolve('dist/index.js')],hashes=await Promise.all(files.map(sha256File));
const baseline=baselineFile?JSON.parse(await readFile(baselineFile,'utf8')):null;if(baseline)assert.deepEqual(hashes,baseline.hashes);
const expected=expectedText===undefined?undefined:Number(expectedText);if(expected!==undefined)assert.ok(Number.isSafeInteger(expected)&&expected>=0);
const root=path.resolve('.avid-mcp-analysis',`palette-position-${label}-${randomUUID()}`);await mkdir(root);
const client=new Client({name:'palette-position-observer',version:'1'});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
 const response=await client.callTool({name:'avid_native_read',arguments:{query:'viewers',bin}},undefined,{timeout:120000});await writeFile(path.join(root,'response.json'),JSON.stringify(response,null,2));assert.ok(!response.isError,JSON.stringify(response));
 const sources=response.structuredContent.data.viewers.filter(v=>v.view_type==='Source');const after=await Promise.all(files.map(sha256File));
 const valid=sources.length===1&&(!baseline||sources[0].mob_id===baseline.source.mob_id)&&(expected===undefined||sources[0].current_frame===expected);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({label,bin,files,hashes,after,source:sources[0]??null,expectedFrame:expected??null,valid,scope:'Read-only native Source-viewer identity/position and file preservation; separate UI navigation, no atomic state or video fidelity claim.'},null,2));console.log(JSON.stringify({root,source:sources[0]??null,valid}));
 assert.deepEqual(after,hashes);assert.equal(valid,true);
}finally{await client.close();}
