import {mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [binary,cli,runtime]=process.argv.slice(2);assert.equal(process.argv.length,5);for(const value of [binary,cli,runtime])assert.ok(path.isAbsolute(value));
const root=path.resolve('.avid-mcp-analysis',`codex-saved-search-${randomUUID()}`);await mkdir(root);console.log(JSON.stringify({root}));
const project=await realpath('D:/Avid Projects/MCP_Sonoma_30p_20260905'),bin=await realpath(path.join(project,'MCP_Sonoma_Media.avb')),server=path.join(path.dirname(cli),'index.js');
const files=[bin,cli,server,path.join(path.dirname(cli),'library/project-snapshots.js')],hashes=await Promise.all(files.map(sha256File));
const userConfiguration=path.join(process.env.CODEX_HOME??path.join(homedir(),'.codex'),'config.toml');
async function configHash(){try{return await sha256File(userConfiguration);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const userBefore=await configHash();
async function checked(executable,args){const r=await runProcess(executable,args,{timeoutMs:180000,maxOutputBytes:8*1024*1024,cwd:root});assert.equal(r.exitCode,0,JSON.stringify(r));return r.stdout;}
const before=JSON.parse(await checked(process.execPath,[cli,'--python-runtime-status',runtime]));assert.equal(before.unchanged,true);
const client=new Client({name:'prepare-search-acceptance',version:'1'});let snapshot,expected;
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_PYTHON:before.executable,AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export'}}));
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
 snapshot=await call('avid_snapshot_saved_bins',{bins:[bin]});const target=snapshot.bins[0].mobs.find(m=>m.name.endsWith('.sub.04'));assert.ok(target);assert.equal(target.duration,30);
 expected=await call('avid_saved_timeline_range',{revision:snapshot.revision,mobId:target.mobId,bin,start:0,end:30});assert.equal(expected.results.length,3);assert.ok(expected.results.every(n=>n.overlapSourceStart===2850&&n.overlapSourceEnd===2880));
}finally{await client.close();}
const snapshotFile=path.join(root,'avid-mcp-library',`snapshot-${snapshot.revision}.json`),snapshotHash=await sha256File(snapshotFile);
const generated=JSON.parse(await checked(process.execPath,[cli,'--client','codex','--root',project,'--output',root,'--python',before.executable,'--capabilities','inspect']));
const argv=generated.args,separator=argv.indexOf('--'),env={};assert.equal(generated.command,'codex');assert.ok(separator>0);
for(let n=3;n<separator;n+=2){assert.equal(argv[n],'--env');const equals=argv[n+1].indexOf('=');env[argv[n+1].slice(0,equals)]=argv[n+1].slice(equals+1);}
assert.equal(env.AVID_MCP_PYTHON,before.executable);assert.equal(argv[separator+1],process.execPath);assert.deepEqual(argv.slice(separator+2),[server]);
const overrides={'mcp_servers.avid.command':argv[separator+1],'mcp_servers.avid.args':argv.slice(separator+2),'mcp_servers.avid.env':env,'mcp_servers.avid.enabled_tools':['avid_saved_snapshot_mobs','avid_saved_timeline_range']};
const toml=v=>typeof v==='string'?JSON.stringify(v):Array.isArray(v)?`[${v.map(toml).join(',')}]`:`{${Object.entries(v).map(([k,x])=>`${k}=${toml(x)}`).join(',')}}`;
const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--cd',root];for(const [key,value] of Object.entries(overrides))args.push('-c',`${key}=${toml(value)}`);
args.push(`Using saved snapshot revision ${snapshot.revision}, find the 30 fps clip whose name contains .SUB.04. Use a name filter to find it; do not enumerate the whole snapshot. Inspect its first 30 edit units using its returned mobId and bin identity, and report the source ranges on each track. Use only the two supplied MCP tools. Do not use shell or change files, configuration or editor state. Explain that the results describe a saved snapshot.`);
const result=await runProcess(binary,args,{timeoutMs:180000,maxOutputBytes:8*1024*1024,cwd:root});await writeFile(path.join(root,'events.jsonl'),result.stdout);await writeFile(path.join(root,'stderr.txt'),result.stderr);
const events=result.stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)),items=events.filter(e=>e.type==='item.completed').map(e=>e.item),calls=items.filter(i=>i.type==='mcp_tool_call');
const after=JSON.parse(await checked(process.execPath,[cli,'--python-runtime-status',runtime])),afterHashes=await Promise.all(files.map(sha256File));
await writeFile(path.join(root,'observations.json'),JSON.stringify({exitCode:result.exitCode,generated,snapshot,expected,calls,before,after,files,hashes,afterHashes},null,2));
assert.equal(result.exitCode,0,result.stderr);assert.ok(items.every(i=>['agent_message','reasoning','mcp_tool_call'].includes(i.type)));assert.equal(calls.length,2);
assert.equal(calls[0].tool,'avid_saved_snapshot_mobs');assert.equal(calls[1].tool,'avid_saved_timeline_range');
for(const c of calls){assert.equal(c.status,'completed');assert.equal(c.error,null);assert.equal(c.result.structured_content.ok,true);}
assert.equal(calls[0].result.structured_content.data.totalMatches,1);assert.equal(calls[0].result.structured_content.data.filters.query.toLowerCase(),'.sub.04');assert.deepEqual(calls[0].result.structured_content.data.filters.fields,['name']);assert.equal(calls[0].result.structured_content.data.filters.rate,30);
const found=calls[0].result.structured_content.data.mobs[0];assert.equal(calls[1].arguments.mobId,found.mobId);assert.equal(calls[1].arguments.bin,found.bin);assert.equal(calls[1].arguments.revision,snapshot.revision);assert.equal(calls[1].arguments.start,0);assert.equal(calls[1].arguments.end,30);
assert.deepEqual(calls[1].result.structured_content.data,expected);assert.deepEqual(afterHashes,hashes);assert.equal(after.unchanged,true);assert.equal(after.treeSha256,before.treeSha256);assert.equal(await sha256File(snapshotFile),snapshotHash);assert.equal(await configHash(),userBefore);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,cli,server,runtime,generated,calls,expected,files,hashes,snapshotHash,userConfigurationUnchanged:true,runtimeTree:after.treeSha256,scope:'Actual Codex filtered saved-clip discovery to source-range query using installed package, generated ephemeral settings and managed Python. Existing Windows/authenticated client; no native edits, persistent GUI setup or clean-machine qualification.'},null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,root}));
