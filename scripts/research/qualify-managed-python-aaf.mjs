import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

const [directory,serverEntry]=process.argv.slice(2);
assert.equal(process.argv.length,4);assert.ok(path.isAbsolute(directory)&&path.isAbsolute(serverEntry));
const root=path.resolve('.avid-mcp-analysis',`managed-python-aaf-${randomUUID()}`);await mkdir(root);
await writeFile(path.join(root,'aaf2.py'),"raise RuntimeError('untrusted AAF module selected')\n",{flag:'wx'});
const cli=path.join(path.dirname(serverEntry),'cli.js'),calls=[];
const runtime=async()=>{const r=await runProcess(process.execPath,[cli,'--python-runtime-status',directory],{timeoutMs:120000,maxOutputBytes:1024*1024});assert.equal(r.exitCode,0,r.stderr);return JSON.parse(r.stdout);};
const before=await runtime();assert.equal(before.unchanged,true);
const files=[serverEntry,path.join(path.dirname(serverEntry),'library/aaf-builder.js'),...['avid_aaf_builder.py','avid_aaf_graph.py','avid_aaf_merge.py'].map(n=>path.resolve(path.dirname(serverEntry),'../python',n))];
const hashes=await Promise.all(files.map(sha256File));
const prior=JSON.parse(await readFile('.avid-mcp-analysis/aaf-reference-copy-0ee70ca5-4193-4330-987d-ce902e81d9d1/evidence.json','utf8'));
const sources=prior.sources.map(s=>({file:s.file,expectedSha256:s.sha256}));
for(const s of sources)assert.equal(await sha256File(s.file),s.expectedSha256);
const client=new Client({name:'managed-python-aaf',version:'1'});
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});calls.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(calls,null,2));assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[serverEntry],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),PYTHONPATH:root,AVID_MCP_ALLOWED_ROOTS:path.resolve('.avid-mcp-analysis'),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:before.executable,AVID_MCP_CAPABILITIES:'inspect,export'}}));
 const merged=await call('avid_merge_aaf_references',{request:{sources}});assert.equal(merged.graphVerified,true);assert.equal(merged.masters.length,2);
 const request={template:merged.template,expectedSha256:merged.sha256,name:'Managed_Python_Stereo_Selects',rate:'30',tracks:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound',channels:2}],selects:merged.masters.map(m=>({mobId:m.mobId,start:2850,length:60,slotIds:[1,[2,3]]}))};
 const built=await call('avid_build_aaf_selects',{request});assert.equal(built.conformanceVerified,true);assert.equal(built.sourceGraphVerified,true);assert.equal(built.hostImportVerified,false);
 const inspected=await call('avid_inspect_aaf_selects',{file:built.output});assert.equal(inspected.composition.frames,120);assert.equal(inspected.composition.tracks[1].channels,2);assert.equal(new Set(inspected.composition.tracks[0].cuts.map(c=>c.mobId)).size,2);
 const refused=await client.callTool({name:'avid_build_aaf_selects',arguments:{request:{...request,rate:'24'}}});assert.equal(refused.isError,true);await writeFile(path.join(root,'mixed-rate-refusal.json'),JSON.stringify(refused,null,2));
 for(const s of sources)assert.equal(await sha256File(s.file),s.expectedSha256);
 for(const media of merged.media)assert.equal(await sha256File(media.file),media.sha256);
 assert.deepEqual(await Promise.all(files.map(sha256File)),hashes);
 const after=await runtime();assert.equal(after.unchanged,true);assert.equal(after.treeSha256,before.treeSha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,files,hashes,before,after,merged,built,inspected,mixedRateRejected:true,scope:'Real Sonoma AAF merge, stereo selects authoring and inspection with hostile PYTHONPATH, unchanged runtime/package/source hashes. No Avid import or playback claim.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({passed:true,root}));
}finally{await client.close();}
