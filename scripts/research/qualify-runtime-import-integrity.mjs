import {cp,mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {modelRuntime} from '../../dist/library/model-runtime.js';
import {modelRuntimeStatus} from '../../dist/library/model-runtime-install.js';
const cache=path.resolve(process.argv[2]??'.avid-mcp-analysis/models'),root=path.resolve('.avid-mcp-analysis',`runtime-import-integrity-${randomUUID()}`);await mkdir(root);
const before=await modelRuntimeStatus(cache);assert.ok(before.managed&&before.unchanged);
const timings=[];
for(let index=0;index<2;index++){
 const started=performance.now();await modelRuntime(cache);timings.push({index,milliseconds:performance.now()-started,scope:index===0?'receipt verification plus first import':'receipt verification plus cached import'});
}
const isolated=path.join(root,'isolated');await mkdir(isolated);await cp(path.join(cache,'runtime'),path.join(isolated,'runtime'),{recursive:true,errorOnExist:true,force:false});
const copied=await modelRuntimeStatus(isolated);assert.ok(copied.managed&&copied.unchanged);assert.equal(copied.treeSha256,before.treeSha256);
const unexpected=path.join(isolated,'runtime',`qualification-${randomUUID()}.txt`);await writeFile(unexpected,'isolated dependency tree change',{flag:'wx'});
const started=performance.now();await assert.rejects(modelRuntime(isolated),/tree changed/);const refusalMilliseconds=performance.now()-started;
await unlink(unexpected);const restored=await modelRuntimeStatus(isolated);assert.ok(restored.managed&&restored.unchanged);await modelRuntime(isolated);
const after=await modelRuntimeStatus(cache);assert.ok(after.managed&&after.unchanged);assert.equal(after.treeSha256,before.treeSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({cache,treeSha256:before.treeSha256,timings,refusalMilliseconds,changedCopyRefused:true,restoredCopyLoaded:true,originalTreeUnchanged:true,scope:'Installed runtime import and on-disk receipt consistency, including a disposable changed copy. Timings are two warm-filesystem observations on this machine, not cold-start percentiles; no model weights were loaded and no publisher authentication is established.'},null,2));
console.log(JSON.stringify({root,timings,refusalMilliseconds,passed:true}));
