import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [directory,overrideCli]=process.argv.slice(2);assert.ok(process.argv.length===3||process.argv.length===4);assert.ok(path.isAbsolute(directory));if(overrideCli)assert.ok(path.isAbsolute(overrideCli));
const root=path.resolve('.avid-mcp-analysis',`python-runtime-cli-${randomUUID()}`);await mkdir(root);
for(const name of ['avb','aaf2'])await writeFile(path.join(root,`${name}.py`),"raise RuntimeError('untrusted working-directory module')\n");
const cli=overrideCli??path.resolve('dist/cli.js'),cliSha256=await sha256File(cli),server=path.join(path.dirname(cli),'index.js'),events=[];
async function command(args,ok=true){const result=await runProcess(process.execPath,[cli,...args],{timeoutMs:120000,maxOutputBytes:2*1024*1024,cwd:root});events.push({args,result});await writeFile(path.join(root,'commands.json'),JSON.stringify(events,null,2));assert.equal(result.exitCode===0,ok,JSON.stringify(result));return ok?JSON.parse(result.stdout):result;}
const before=await command(['--python-runtime-status',directory]);assert.equal(before.unchanged,true);assert.equal(before.bootstrapCurrent,true);
const refused=await command(['--install-python-runtime',directory,'--python',before.receipt.basePython],false);assert.match(refused.stderr,/EEXIST/);
const doctor=await command(['--doctor','--root',root,'--output',root,'--python',before.executable]);assert.equal(doctor.python.ok,true);
const files=['D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_AAF_Selects_20260905.avb',path.resolve('.avid-mcp-analysis/aaf-reference-copy-93585096-4725-4e1c-9268-4b7b45e287e6/selects.aaf')];
const hashes=await Promise.all(files.map(sha256File)),sessions=[];
for(let n=0;n<2;n++){
 const client=new Client({name:'managed-python-cli',version:'1'}),responses=[];
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),PYTHONPATH:root,AVID_MCP_PYTHON:before.executable,AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_ALLOWED_ROOTS:files.map(file=>path.dirname(file)).join(path.delimiter)}}));
  for(const [name,args] of [['avid_analyze_bin',{bin_path:files[0],max_depth:4,max_items:200}],['avid_analyze_aaf',{aaf_path:files[1],max_depth:4,max_items:200}]]){
   const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});responses.push(response);await writeFile(path.join(root,`session-${n}.json`),JSON.stringify(responses,null,2));assert.ok(!response.isError,JSON.stringify(response));
  }
  sessions.push(responses);
 }finally{await client.close();}
}
assert.deepEqual(sessions[0],sessions[1]);assert.deepEqual(await Promise.all(files.map(sha256File)),hashes);
const after=await command(['--python-runtime-status',directory]);assert.equal(after.unchanged,true);assert.equal(after.treeSha256,before.treeSha256);
assert.equal(await sha256File(cli),cliSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,cli,cliSha256,server,before,after,files,hashes,sourceUnchanged:true,reconnectUnchanged:true,scope:'Production CLI installation status and overwrite refusal, doctor, real AVB/AAF MCP reads and unchanged runtime tree across reconnect. Existing Windows/base Python; no removal, upgrade, clean OS or wider Python workload qualification.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
