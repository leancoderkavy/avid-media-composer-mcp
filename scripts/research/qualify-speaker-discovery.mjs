import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const prior=path.resolve('.avid-mcp-analysis/speaker-alignment-e03bb90d-246b-48dd-9ce8-ee64746f7266'),reference=JSON.parse(await readFile(path.join(prior,'evidence.json'),'utf8')).reference;
const source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4',id=await sha256File(source),root=path.resolve('.avid-mcp-analysis',`speaker-discovery-${randomUUID()}`),library=path.join(root,'avid-mcp-library');await mkdir(library,{recursive:true});
await copyFile(path.join(prior,'avid-mcp-library',`${id}.json`),path.join(library,`${id}.json`));
const original=path.join(prior,'avid-mcp-library',`speakers-${reference.analysisId}`),saved=path.join(library,`speakers-${reference.analysisId}`);await mkdir(saved);
for(const file of ['analysis.json','speech.f32'])await copyFile(path.join(original,file),path.join(saved,file));
const corruptId=randomUUID(),unpublishedId=randomUUID();for(const value of [corruptId,unpublishedId])await mkdir(path.join(library,`speakers-${value}`));
const corrupt=path.join(library,`speakers-${corruptId}`,'analysis.json'),partial=path.join(library,`speakers-${unpublishedId}`,'speech.f32');await writeFile(corrupt,'{incomplete fixture');await writeFile(partial,'partial fixture');
const checks=Object.fromEntries(await Promise.all([source,corrupt,partial,path.join(saved,'analysis.json'),path.join(saved,'speech.f32')].map(async file=>[file,await sha256File(file)])));
async function inspect(){const client=new Client({name:'speaker-discovery-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_MODEL_DIR:'',AVID_MCP_CAPABILITIES:'inspect'}}));try{const result=await client.callTool({name:'avid_speaker_analyses',arguments:{id}});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;}finally{await client.close();}}
const first=await inspect(),reconnected=await inspect();assert.deepEqual(first,reconnected);assert.deepEqual(first.analyses.map(item=>item.analysisId),[reference.analysisId]);assert.equal(first.discovery.unclassifiedCount,1);assert.deepEqual(first.discovery.unclassifiedAnalysisIds,[corruptId]);assert.equal(first.discovery.unpublishedCount,1);
for(const [file,hash] of Object.entries(checks))assert.equal(await sha256File(file),hash);
const evidence=path.join(root,'evidence.json');await writeFile(evidence,JSON.stringify({checkedAt:new Date().toISOString(),first,reconnected,checks,unchanged:true,scope:'Actual inspect-only MCP discovery/reconnect with retained Sonoma analysis, one malformed fixture and one unpublished fixture; no worker termination or computation recovery claim.'},null,2));console.log(JSON.stringify({passed:true,evidence}));
