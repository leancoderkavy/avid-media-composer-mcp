import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeAdapter} from '../../dist/native/adapter.js';
import {loadConfig} from '../../dist/config.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const binary=process.argv[2];assert.ok(binary&&path.isAbsolute(binary)&&[3,4].includes(process.argv.length));
const expectRefusal=process.argv[3]==='--expect-approval-refusal';assert.ok(process.argv.length===3||expectRefusal);
const root=path.resolve('.avid-mcp-analysis',`codex-native-rename-${randomUUID()}`);await mkdir(root);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_CopyMCP_93108dc0c7b8.avb',mobId='060a2b340101010501010f1013-000000-184e5ee212898806-7c27d8bbc16d-18d9',original='MCP_Sonoma_AAF_Selects.Copy.05';
const temporary=`MCP Model Rename ${randomUUID().slice(0,8)}`,source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const env={AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_CAPABILITIES:'inspect,edit'};
const adapter=new NativeAdapter(loadConfig(env)),nameOf=rows=>rows.find(r=>r.column_name==='Name')?.column_value;
const before=await adapter.read('clip',bin,mobId);assert.equal(nameOf(before),original);
const sourceHash=await sha256File(source),binHashBefore=await sha256File(path.join(project,bin));
const operation=(expectedName,name)=>({action:'rename_clip',bin,mobId,expectedName,name});
const operations=[operation(original,temporary),operation(temporary,original)];
const entry=path.resolve('dist/index.js'),entryHash=await sha256File(entry);
const overrides={'mcp_servers.avid.command':process.execPath,'mcp_servers.avid.args':[entry],'mcp_servers.avid.env':env,'mcp_servers.avid.enabled_tools':['avid_native_read','avid_native_preview','avid_native_apply']};
const toml=v=>typeof v==='string'?JSON.stringify(v):Array.isArray(v)?`[${v.map(toml).join(',')}]`:`{${Object.entries(v).map(([k,x])=>`${k}=${toml(x)}`).join(',')}}`;
const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--cd',root];
for(const [key,value] of Object.entries(overrides))args.push('-c',`${key}=${toml(value)}`);
args.push(`The user authorizes this reversible native editing acceptance test on the owned test sequence. Use only avid MCP tools. In order, preview and apply each exact operation: ${JSON.stringify(operations)}. For each operation call avid_native_preview with operation, then avid_native_apply with that preview token. Proceed to restoration only after renameVerified is true. If a response is uncertain, read the exact clip and report rather than replaying the token. Finally read query clip with bin ${JSON.stringify(bin)} and mobId ${JSON.stringify(mobId)} to verify the original name. No other operations, bins, tools, saves, exports or source changes are authorized. Report observed live rename verification and restoration; persistence is not tested.`);
let result,stdout='',stderr='',after,cleanup=null;
try{
 const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
 const timer=setTimeout(()=>child.kill('SIGKILL'),240000);
 result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));}).finally(()=>clearTimeout(timer));
}finally{
 await writeFile(path.join(root,'events.jsonl'),stdout,{flag:'wx'});await writeFile(path.join(root,'stderr.txt'),stderr,{flag:'wx'});
 after=await adapter.read('clip',bin,mobId);
 if(nameOf(after)===temporary){const plan=await adapter.preview(operations[1]);cleanup=await adapter.apply(plan.token);after=await adapter.read('clip',bin,mobId);}
 await writeFile(path.join(root,'recovery.json'),JSON.stringify({cleanup,after},null,2),{flag:'wx'});
 assert.equal(nameOf(after),original,'Unexpected live name; no speculative restore attempted');
}
const events=stdout.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const completed=events.filter(e=>e.type==='item.completed').map(e=>e.item),calls=completed.filter(i=>i.type==='mcp_tool_call');
const sourceHashAfter=await sha256File(source),binHashAfter=await sha256File(path.join(project,bin));
await writeFile(path.join(root,'evidence.json'),JSON.stringify({result,before,after,cleanup,calls,sourceHash,sourceHashAfter,binHashBefore,binHashAfter,scope:'Model-selected live rename and restoration of owned Copy.05; no save/reopen, timeline-edit, playback or persistence qualification.'},null,2),{flag:'wx'});
assert.equal(result.code,0);assert.equal(cleanup,null,'Harness restored after incomplete model workflow');assert.equal(sourceHashAfter,sourceHash);assert.equal(await sha256File(entry),entryHash);
assert.ok(completed.every(i=>['agent_message','reasoning','mcp_tool_call'].includes(i.type)));
if(expectRefusal){
 const previews=calls.filter(c=>c.tool==='avid_native_preview'),applies=calls.filter(c=>c.tool==='avid_native_apply'),reads=calls.filter(c=>c.tool==='avid_native_read');
 assert.equal(previews.length,1);assert.equal(applies.length,1);assert.equal(reads.length,1);assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.server==='avid'));
 assert.deepEqual(previews[0].arguments.operation,operations[0]);assert.equal(previews[0].result.structured_content.ok,true);
 assert.equal(applies[0].arguments.token,previews[0].result.structured_content.data.token);assert.equal(applies[0].status,'failed');assert.equal(applies[0].error?.message,'MCP tool call requires approval, but approval policy is never');
 assert.deepEqual(reads[0].arguments,{query:'clip',bin,mobId});assert.equal(reads[0].result.structured_content.ok,true);assert.equal(nameOf(reads[0].result.structured_content.data),original);
 assert.deepEqual(after,before);assert.equal(binHashAfter,binHashBefore);
 console.log(JSON.stringify({root,approvalRefusalVerified:true,editingPassed:false,sourceUnchanged:true}));
}else{
assert.ok(calls.every(c=>c.server==='avid'&&overrides['mcp_servers.avid.enabled_tools'].includes(c.tool)&&c.error===null&&c.status==='completed'&&c.result.structured_content.ok===true));
const previews=calls.filter(c=>c.tool==='avid_native_preview'),applies=calls.filter(c=>c.tool==='avid_native_apply');assert.equal(previews.length,2);assert.equal(applies.length,2);
for(let i=0;i<2;i++){assert.deepEqual(previews[i].arguments.operation,operations[i]);assert.equal(applies[i].arguments.token,previews[i].result.structured_content.data.token);assert.equal(applies[i].result.structured_content.data.renameVerified,true);assert.deepEqual(applies[i].result.structured_content.data.action,operations[i]);}
assert.ok(calls.some(c=>c.tool==='avid_native_read'&&c.arguments.query==='clip'&&c.arguments.bin===bin&&c.arguments.mobId===mobId&&nameOf(c.result.structured_content.data)===original));
console.log(JSON.stringify({root,passed:true,modelRestored:true,sourceUnchanged:true}));
}
