import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolveSetupEntry} from '../../dist/setup.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const binary=process.argv[2];assert.ok(binary&&path.isAbsolute(binary)&&[3,5].includes(process.argv.length),'Provide absolute Codex CLI executable, optionally followed by absolute server entry and SHA-256');
const root=path.resolve('.avid-mcp-analysis',`codex-model-${randomUUID()}`),project=path.join(root,'fixture');await mkdir(project,{recursive:true});
const name=`review-${randomUUID()}.txt`,bytes=Buffer.from('Original synthetic editorial fixture.\n');
await writeFile(path.join(project,name),bytes,{flag:'wx'});
const sha256=createHash('sha256').update(bytes).digest('hex');
const entry=process.argv.length===5?await resolveSetupEntry(process.argv[3],process.argv[4]):path.resolve('dist/index.js');
const entrySha256=await sha256File(entry),binarySha256=await sha256File(binary);
const overrides={
 'mcp_servers.avid.command':process.execPath,
 'mcp_servers.avid.args':[entry],
 'mcp_servers.avid.env':{AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_CAPABILITIES:'inspect'},
 'mcp_servers.avid.enabled_tools':['avid_ping','avid_inventory_project_files'],
};
const toml=value=>typeof value==='string'?JSON.stringify(value):Array.isArray(value)?`[${value.map(toml).join(',')}]`:`{${Object.entries(value).map(([k,v])=>`${k}=${toml(v)}`).join(',')}}`;
const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--cd',project];
for(const [key,value] of Object.entries(overrides))args.push('-c',`${key}=${toml(value)}`);
args.push(`This is a connector acceptance test. Use only the avid MCP tools. Call avid_ping, then avid_inventory_project_files with project_path ${JSON.stringify(project)} and include_hashes true. Report the filename and SHA-256 returned by the tool. Do not use shell, filesystem tools, other connectors, or edit anything.`);
const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));}).finally(()=>clearTimeout(timer));
await writeFile(path.join(root,'events.jsonl'),stdout,{flag:'wx'});await writeFile(path.join(root,'stderr.txt'),stderr,{flag:'wx'});
const events=stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const calls=events.filter(e=>e.type==='item.completed'&&e.item?.type==='mcp_tool_call').map(e=>e.item);
const otherTools=events.filter(e=>e.type==='item.completed'&&!['mcp_tool_call','agent_message','reasoning'].includes(e.item?.type));
const evidence={root,...result,serverEntry:entry,serverEntrySha256:entrySha256,binarySha256,executablesUnchanged:entrySha256===await sha256File(entry)&&binarySha256===await sha256File(binary),calls,otherTools,fixtureUnchanged:sha256===createHash('sha256').update(await readFile(path.join(project,name))).digest('hex'),scope:'Existing authenticated Codex CLI, explicitly selected server, synthetic read-only fixture; package provenance requires enclosing installer evidence. Not GUI, native Avid or clean-machine qualification.'};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
console.log(JSON.stringify({root,...result,tools:calls.map(c=>c.tool),otherTools:otherTools.length}));
assert.equal(result.code,0);assert.equal(otherTools.length,0);assert.ok(evidence.fixtureUnchanged);assert.ok(evidence.executablesUnchanged);
assert.ok(calls.every(c=>c.server==='avid'&&overrides['mcp_servers.avid.enabled_tools'].includes(c.tool)&&c.error===null));
assert.ok(calls.some(c=>c.tool==='avid_ping'&&c.status==='completed'&&c.result?.structured_content?.ok===true));
assert.ok(calls.some(c=>c.tool==='avid_inventory_project_files'&&c.status==='completed'&&c.arguments.project_path===project&&c.arguments.include_hashes===true&&c.result?.structured_content?.ok===true&&c.result.structured_content.data.files.some(f=>f.relativePath===name&&f.sha256===sha256)));
assert.ok(events.some(e=>e.type==='item.completed'&&e.item?.type==='agent_message'&&e.item.text.includes(name)&&e.item.text.includes(sha256)));
