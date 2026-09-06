import {runProcess} from '../../dist/process.js';import {sha256File} from '../../dist/analysis/file-inventory.js';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`native-copy-graph-${randomUUID()}`);await mkdir(root);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const inputs=[{bin:'MCP_AAF_Selects_20260905.avb',name:'MCP_Sonoma_AAF_Selects'},{bin:'MCP_Copy_969f92a0264a.avb',name:'MCP_Sonoma_AAF_Selects.Copy.01'}];
const graphs=[];
for(const input of inputs){const file=path.join(project,input.bin),parsed=await runProcess(path.resolve('.venv/Scripts/python.exe'),['python/avid_timeline.py',file],{timeoutMs:30000,maxOutputBytes:4*1024*1024});assert.equal(parsed.exitCode,0,parsed.stderr);const graph=JSON.parse(parsed.stdout);await writeFile(path.join(root,input.bin+'.json'),JSON.stringify(graph,null,2));assert.equal(await sha256File(file),graph.sha256);graphs.push(graph);}
const sequence=graphs.map((g,i)=>{const found=g.mobs.filter(m=>m.name===inputs[i].name);assert.equal(found.length,1);return found[0];});
const semantics=({mobId,name,...rest})=>rest;
assert.notEqual(sequence[0].mobId,sequence[1].mobId);assert.deepEqual(semantics(sequence[0]),semantics(sequence[1]));
const reachable=(g,start)=>{const visited=new Map(),unresolved=new Set(),pending=[start];while(pending.length){const mob=pending.pop();if(visited.has(mob.mobId))continue;visited.set(mob.mobId,mob);for(const node of mob.tracks.flatMap(t=>t.nodes)){if(!node.sourceMobId)continue;const found=g.mobs.filter(m=>m.mobId===node.sourceMobId);if(found.length===0){unresolved.add(node.sourceMobId);continue;}assert.equal(found.length,1,'ambiguous source identity');pending.push(found[0]);}}visited.delete(start.mobId);return {nodes:[...visited.values()].sort((a,b)=>a.mobId.localeCompare(b.mobId)),unresolved:[...unresolved].sort()};};
const sources=graphs.map((g,i)=>reachable(g,sequence[i]));assert.deepEqual(sources[0],sources[1]);
const result={root,sequenceSemanticsEqual:true,reachableSourcesEqual:true,sourceCount:sources[0].nodes.length,unresolvedSourceIds:sources[0].unresolved,sourceGraphComplete:sources[0].unresolved.length===0,binHashes:graphs.map(g=>g.sha256),warnings:graphs.map(g=>g.warnings),scope:'Decoded saved-bin sequence fields and reachable source nodes. Unknown AVB fields, unsaved state, effects fidelity, playback and media bytes are not compared.'};
await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
