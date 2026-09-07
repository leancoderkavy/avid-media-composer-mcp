import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {preparePipWheel,PIP_VERSION} from '../../dist/library/python-bootstrap.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [basePython]=process.argv.slice(2);assert.equal(process.argv.length,3);assert.ok(path.isAbsolute(basePython));
const root=path.resolve('.avid-mcp-analysis',`core-python-setup-${randomUUID()}`);await mkdir(root);console.log(JSON.stringify({root}));
const runtime=path.join(root,'runtime'),python=path.join(runtime,process.platform==='win32'?'Scripts/python.exe':'bin/python');
const bin='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_AAF_Selects_20260905.avb';
const aaf=path.resolve('.avid-mcp-analysis/aaf-reference-copy-93585096-4725-4e1c-9268-4b7b45e287e6/selects.aaf');
const files=[bin,aaf],hashes=await Promise.all(files.map(sha256File)),events=[];
assert.deepEqual((await readFile(new URL('../../python/requirements.txt',import.meta.url),'utf8')).trim().split(/\r?\n/),['pyavb==1.4.0','pyaaf2==1.7.1']);
async function run(executable,args){const result=await runProcess(executable,args,{timeoutMs:180000,maxOutputBytes:2*1024*1024});events.push({executable,args,result});await writeFile(path.join(root,'commands.json'),JSON.stringify(events,null,2));assert.equal(result.exitCode,0,JSON.stringify(result));return result.stdout;}
const baseProbe=['-I','-B','-c',"import importlib.metadata as m,json; print(json.dumps(sorted((d.metadata['Name'],d.version) for d in m.distributions())))"];
const basePackages=JSON.parse(await run(basePython,baseProbe));
await run(basePython,['-I','-B','-m','venv','--copies','--without-pip',runtime]);
const wheel=await preparePipWheel(root);
await run(python,['-I','-B','-c',"import sys,runpy; sys.path.insert(0,sys.argv.pop(1)); runpy.run_module('pip',run_name='__main__')",wheel,'--isolated','install','--no-index','--no-deps','--no-compile','--disable-pip-version-check',wheel]);
await run(python,['-I','-B','-m','pip','--isolated','install','--index-url','https://pypi.org/simple','--only-binary=:all:','--no-deps','--no-compile','--disable-pip-version-check','pyavb==1.4.0','pyaaf2==1.7.1']);
await run(python,['-I','-B','-m','pip','--isolated','check']);
const versions=JSON.parse(await run(python,['-I','-B','-c',"import importlib.metadata as m,json,sys; print(json.dumps({'packages':{n:m.version(n) for n in ['pip','pyavb','pyaaf2']},'prefix':sys.prefix,'basePrefix':sys.base_prefix}))"]));
assert.deepEqual(versions.packages,{pip:PIP_VERSION,pyavb:'1.4.0',pyaaf2:'1.7.1'});assert.notEqual(versions.prefix,versions.basePrefix);
const results=[];
for(let session=0;session<2;session++){
 const client=new Client({name:'fresh-core-python',version:'1'});
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_PYTHON:python,AVID_MCP_ALLOWED_ROOTS:files.map(file=>path.dirname(file)).join(path.delimiter),AVID_MCP_CAPABILITIES:'inspect'}}));
  const responses=[];
  for(const [name,args] of [['avid_analyze_bin',{bin_path:bin,max_depth:4,max_items:200}],['avid_analyze_aaf',{aaf_path:aaf,max_depth:4,max_items:200}]]){
   const response=await client.callTool({name,arguments:args},undefined,{timeout:120000});responses.push({name,response});
   await writeFile(path.join(root,`session-${session}.json`),JSON.stringify(responses,null,2));assert.ok(!response.isError,JSON.stringify(response));
  }
  results.push(responses);
 }finally{await client.close();}
}
assert.deepEqual(results[1],results[0]);assert.deepEqual(await Promise.all(files.map(sha256File)),hashes);
assert.deepEqual(JSON.parse(await run(basePython,baseProbe)),basePackages);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,basePython,basePackagesUnchanged:true,python,versions,files,hashes,sourceUnchanged:true,reconnectUnchanged:true,scope:'Fresh isolated venv, verified pip bootstrap, exact binary-only core dependencies, dependency check, real Sonoma AVB and AAF MCP reads across two connections. Existing Node/base Python/network; not clean OS, native Avid edits or automatic installer lifecycle.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true,python}));
