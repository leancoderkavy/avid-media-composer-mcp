import {NativeClient} from '../../dist/native/client.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const directory=path.resolve('.avid-mcp-analysis',`native-selection-${randomUUID()}`);await mkdir(directory);
const client=new NativeClient('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe');
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',bin='MCP_AAF_Selects_20260905.avb',evidence=[];
async function call(method,body){const result=await client.call(method,body);evidence.push({method,body,result});await writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));return result;}
const before=await call('GetOpenProjectInfo');assert.equal(path.resolve(before[0].path),path.resolve(project));
const all=await call('GetListOfBinItems',{bin_relative_path:bin,bin_flags:['AllTypes']});
const selected=await call('GetListOfBinItems',{bin_relative_path:bin,bin_flags:['AllTypes'],only_selected_flag:true});
assert.ok(selected.every(item=>all.some(member=>member.mob_id===item.mob_id)));
const after=await call('GetOpenProjectInfo');assert.equal(after[0].path,before[0].path);
console.log(JSON.stringify({directory,total:all.length,selected,scope:'Read-only reported selection subset; visible UI selection not yet compared.'}));
