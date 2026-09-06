import {ProjectSnapshots} from '../../dist/library/project-snapshots.js';import {loadConfig} from '../../dist/config.js';import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve('.avid-mcp-analysis',`source-reference-coverage-${randomUUID()}`);await mkdir(root);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const service=new ProjectSnapshots(loadConfig({AVID_MCP_ALLOWED_ROOTS:project,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe')}));
const snapshot=await service.create([path.join(project,'MCP_AAF_Selects_20260905.avb')]);await writeFile(path.join(root,'snapshot.json'),JSON.stringify(snapshot,null,2));
const mob=snapshot.bins[0].mobs.find(m=>m.name==='MCP_Sonoma_AAF_Selects');assert.ok(mob);
const result=await service.range(snapshot.revision,mob.mobId,0,120);await writeFile(path.join(root,'range.json'),JSON.stringify(result,null,2));
assert.equal(result.complete,true);assert.equal(result.sourceReferenceCoverage.allReferencesResolve,false);assert.equal(result.sourceReferenceCoverage.unresolvedCount,1);console.log(JSON.stringify({root,coverage:result.sourceReferenceCoverage}));
