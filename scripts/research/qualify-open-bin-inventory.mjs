import {NativeClient} from '../../dist/native/client.js';
import {mkdir,writeFile,realpath} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const project=await realpath('D:/Avid Projects/MCP_Sonoma_30p_20260905'),root=path.resolve('.avid-mcp-analysis',`open-bin-inventory-${randomUUID()}`);await mkdir(root);
const client=new NativeClient('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe'),observations=[];
const canonical=async items=>Promise.all(items.map(async item=>{assert.ok(typeof item.absolute_path==='string');const file=await realpath(item.absolute_path),relative=path.relative(project,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return file;}));
const before=await client.call('GetOpenProjectInfo');assert.equal(await realpath(before[0].path),project);
const all=await canonical(await client.call('GetBins',{project_path:project,request_flag:['AllTypes']})),open=await canonical(await client.call('GetBins',{request_flag:['AllTypes','OnlyOpen']}));
for(const file of all){const info=await client.call('GetBinInfo',{relative_bin_path:path.relative(project,file)});assert.equal(info.length,1);assert.equal(typeof info[0].is_open,'boolean');observations.push({file,isOpen:info[0].is_open});}
const after=await client.call('GetOpenProjectInfo');assert.equal(await realpath(after[0].path),project);
const repeated=await canonical(await client.call('GetBins',{request_flag:['AllTypes','OnlyOpen']}));
assert.deepEqual([...open].sort(),[...repeated].sort(),'Open inventory changed during comparison');
const direct=observations.filter(row=>row.isOpen).map(row=>row.file),missing=direct.filter(file=>!open.includes(file)),extra=open.filter(file=>!direct.includes(file));
await writeFile(path.join(root,'evidence.json'),JSON.stringify({project,all,open,repeated,observations,missing,extra,scope:'Read-only current-project enumeration compared with sequential direct bin-info observations. Stable endpoint lists do not prove atomicity or exclusion of concurrent changes.'},null,2));
console.log(JSON.stringify({root,total:all.length,open:open.length,directOpen:direct.length,missing,extra}));assert.deepEqual(missing,[]);assert.deepEqual(extra,[]);
