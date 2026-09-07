import {mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [binary,cli,runtime]=process.argv.slice(2);assert.equal(process.argv.length,5);for(const file of [binary,cli,runtime])assert.ok(path.isAbsolute(file));
const root=path.resolve('.avid-mcp-analysis',`codex-managed-python-${randomUUID()}`);await mkdir(root);console.log(JSON.stringify({root}));
const project=await realpath('D:/Avid Projects/MCP_Sonoma_30p_20260905'),bin=await realpath(path.join(project,'MCP_AAF_Selects_20260905.avb'));
const server=path.join(path.dirname(cli),'index.js'),inspector=path.resolve(path.dirname(cli),'../python/avid_inspector.py');
const hashes=await Promise.all([bin,server,cli].map(sha256File));
const userConfiguration=path.join(process.env.CODEX_HOME??path.join(homedir(),'.codex'),'config.toml');
async function configurationHash(){try{return await sha256File(userConfiguration);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const userConfigurationBefore=await configurationHash();
async function checked(executable,args){const result=await runProcess(executable,args,{timeoutMs:180000,maxOutputBytes:8*1024*1024,cwd:root});assert.equal(result.exitCode,0,JSON.stringify(result));return result.stdout;}
const before=JSON.parse(await checked(process.execPath,[cli,'--python-runtime-status',runtime]));assert.equal(before.unchanged,true);
const generated=JSON.parse(await checked(process.execPath,[cli,'--client','codex','--root',project,'--python',before.executable,'--capabilities','inspect']));
const argv=generated.args,separator=argv.indexOf('--');assert.equal(generated.command,'codex');assert.ok(separator>0);
const env={};for(let n=3;n<separator;n+=2){assert.equal(argv[n],'--env');const equals=argv[n+1].indexOf('=');env[argv[n+1].slice(0,equals)]=argv[n+1].slice(equals+1);}
assert.equal(env.AVID_MCP_PYTHON,before.executable);assert.equal(argv[separator+1],process.execPath);assert.deepEqual(argv.slice(separator+2),[server]);
const expected=JSON.parse(await checked(before.executable,['-I','-B',inspector,'analyze-bin','--path',bin,'--max-depth','3','--max-items','120']));
const overrides={'mcp_servers.avid.command':argv[separator+1],'mcp_servers.avid.args':argv.slice(separator+2),'mcp_servers.avid.env':env,'mcp_servers.avid.enabled_tools':['avid_analyze_bin']};
const toml=value=>typeof value==='string'?JSON.stringify(value):Array.isArray(value)?`[${value.map(toml).join(',')}]`:`{${Object.entries(value).map(([key,item])=>`${key}=${toml(item)}`).join(',')}}`;
const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--cd',root];
for(const [key,value] of Object.entries(overrides))args.push('-c',`${key}=${toml(value)}`);
args.push(`Perform one read-only connector acceptance check. Call avid_analyze_bin exactly once with bin_path ${JSON.stringify(bin)}, max_depth 3 and max_items 120. Briefly summarize the actual bin contents returned. Use no shell or other tools. Do not change files, configuration or editor state.`);
const result=await runProcess(binary,args,{timeoutMs:180000,maxOutputBytes:8*1024*1024,cwd:root});
await writeFile(path.join(root,'events.jsonl'),result.stdout);await writeFile(path.join(root,'stderr.txt'),result.stderr);
const events=result.stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)),items=events.filter(event=>event.type==='item.completed').map(event=>event.item),calls=items.filter(item=>item.type==='mcp_tool_call');
const after=JSON.parse(await checked(process.execPath,[cli,'--python-runtime-status',runtime]));
const afterHashes=await Promise.all([bin,server,cli].map(sha256File));
await writeFile(path.join(root,'observations.json'),JSON.stringify({resultCode:result.exitCode,generated,calls,before,after,hashes,afterHashes},null,2));
assert.equal(result.exitCode,0,result.stderr);assert.equal(calls.length,1);assert.ok(items.every(item=>['agent_message','reasoning','mcp_tool_call'].includes(item.type)));
const call=calls[0];assert.equal(call.tool,'avid_analyze_bin');assert.equal(call.status,'completed');assert.equal(call.error,null);assert.equal(call.result.structured_content.ok,true);assert.deepEqual(call.result.structured_content.data,expected);
assert.deepEqual(afterHashes,hashes);assert.equal(after.unchanged,true);assert.equal(after.treeSha256,before.treeSha256);
assert.equal(await configurationHash(),userConfigurationBefore);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,cli,server,runtime,generated,call,hashes,userConfigurationUnchanged:true,runtimeTree:after.treeSha256,scope:'Actual Codex model-selected bin inspection using generated configuration overrides, an installed MCP package and managed Python. Compared with independent inspector output; source/runtime and existing config.toml preserved. Existing authenticated Windows Codex; not GUI onboarding, persisted client installation, native writes or clean OS.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passed:true}));
