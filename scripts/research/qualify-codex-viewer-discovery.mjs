import {mkdir,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const [binary,cli]=process.argv.slice(2);assert.equal(process.argv.length,4);for(const value of [binary,cli])assert.ok(path.isAbsolute(value));
const root=path.resolve('.avid-mcp-analysis',`codex-viewer-discovery-${randomUUID()}`);await mkdir(root);console.log(JSON.stringify({root}));
const project=await realpath('D:/Avid Projects/MCP_Sonoma_30p_20260905'),expectedBin=await realpath(path.join(project,'MCP_Load_7006b4d8.avb')),server=path.join(path.dirname(cli),'index.js');
const files=[expectedBin,path.join(project,'MCP_AAF_Selects_20260905.avb'),'D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',cli,server,path.join(path.dirname(cli),'native/adapter.js')],hashes=await Promise.all(files.map(sha256File));
const userConfiguration=path.join(process.env.CODEX_HOME??path.join(homedir(),'.codex'),'config.toml');
async function configHash(){try{return await sha256File(userConfiguration);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const userBefore=await configHash();
const setup=await runProcess(process.execPath,[cli,'--client','codex','--root',project,'--output',root,'--native','C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe','--capabilities','inspect'],{timeoutMs:30000,maxOutputBytes:1048576,cwd:root});assert.equal(setup.exitCode,0,setup.stderr);
const generated=JSON.parse(setup.stdout),argv=generated.args,separator=argv.indexOf('--'),env={};assert.equal(generated.command,'codex');assert.ok(separator>0);
for(let n=3;n<separator;n+=2){assert.equal(argv[n],'--env');const equals=argv[n+1].indexOf('=');env[argv[n+1].slice(0,equals)]=argv[n+1].slice(equals+1);}
assert.equal(env.AVID_MCP_CAPABILITIES,'inspect');assert.ok(env.AVID_MCP_NATIVE_BINARY);assert.equal(argv[separator+1],process.execPath);assert.deepEqual(argv.slice(separator+2),[server]);
const overrides={'mcp_servers.avid.command':argv[separator+1],'mcp_servers.avid.args':argv.slice(separator+2),'mcp_servers.avid.env':env,'mcp_servers.avid.enabled_tools':['avid_native_read']};
const toml=v=>typeof v==='string'?JSON.stringify(v):Array.isArray(v)?`[${v.map(toml).join(',')}]`:`{${Object.entries(v).map(([k,x])=>`${k}=${toml(x)}`).join(',')}}`;
const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--cd',root];for(const [key,value] of Object.entries(overrides))args.push('-c',`${key}=${toml(value)}`);
args.push('Find the currently loaded Source viewer in Avid and report its bin, mob ID, native frame and native timecode. Discover viewer bins first, then use the returned Source bin path to inspect positions. Do not guess the selected bin or scan all bins. Explain whether these reads establish keyboard focus. Use only the provided MCP read tool; do not use shell, edit files/configuration, send UI input, or change editor state.');
const result=await runProcess(binary,args,{timeoutMs:180000,maxOutputBytes:8*1024*1024,cwd:root});await writeFile(path.join(root,'events.jsonl'),result.stdout);await writeFile(path.join(root,'stderr.txt'),result.stderr);
const events=result.stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)),items=events.filter(e=>e.type==='item.completed').map(e=>e.item),calls=items.filter(i=>i.type==='mcp_tool_call');
const afterHashes=await Promise.all(files.map(sha256File)),userAfter=await configHash();await writeFile(path.join(root,'observations.json'),JSON.stringify({exitCode:result.exitCode,generated,calls,files,hashes,afterHashes,userBefore,userAfter},null,2));
assert.equal(result.exitCode,0,result.stderr);assert.ok(items.every(i=>['agent_message','reasoning','mcp_tool_call'].includes(i.type)));assert.equal(calls.length,2);
for(const c of calls){assert.equal(c.tool,'avid_native_read');assert.equal(c.status,'completed');assert.equal(c.error,null);assert.equal(c.result.structured_content.ok,true);assert.equal(c.result.structured_content.data.keyboardFocusVerified,false);}
assert.deepEqual(calls[0].arguments,{query:'viewer_bins'});
const sources=calls[0].result.structured_content.data.viewers.filter(v=>v.view_type==='Source');assert.equal(sources.length,1);const source=sources[0];
assert.equal(source.bin,expectedBin);assert.equal(source.mob_id,'060a2b340101010501010f1013-000000-5faf2bdb12898806-4b74d8bbc16d-18d9');assert.deepEqual(calls[1].arguments,{query:'viewers',bin:source.bin});
const positions=calls[1].result.structured_content.data.viewers.filter(v=>v.view_type==='Source'&&v.mob_id===source.mob_id);assert.equal(positions.length,1);assert.equal(positions[0].current_frame,0);assert.equal(positions[0].current_timecode,'01:00:00:00');
assert.deepEqual(afterHashes,hashes);assert.equal(userAfter,userBefore);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,cli,server,generated,calls,files,hashes,userConfigurationUnchanged:true,scope:'Actual existing Windows Codex client using a fresh development package and generated ephemeral inspect-only native settings. Discovery-to-position handoff; no GUI onboarding, keyboard-focus detection, native writes or clean-machine qualification.'},null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,root}));
