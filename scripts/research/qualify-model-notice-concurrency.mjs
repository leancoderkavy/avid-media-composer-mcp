import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {installModelNotice} from '../../dist/library/model-notices.js';
const root=path.resolve('.avid-mcp-analysis',`notice-concurrency-${randomUUID()}`);await mkdir(root);
const results=await Promise.allSettled(Array.from({length:50},()=>installModelNotice(path.join(root,'cache'),'Xenova/clip-vit-base-patch32','d15189d7028b43f1d3e65039190477f6af591c2a')));
const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason)),successes=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
const evidence={callers:50,errors,successes,scope:'Concurrent notice publication on this local filesystem; not process-kill or power-loss durability'};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));assert.equal(errors.length,0);assert.equal(successes.filter(s=>s.created).length,1);
const file=successes[0].file;assert.ok(successes.every(s=>s.file===file));assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),successes[0].sha256);assert.deepEqual(await readdir(path.dirname(file)),['UPSTREAM.LICENSE']);
console.log(JSON.stringify({root,callers:50,created:1,reused:49,stagingFilesRemaining:0}));
