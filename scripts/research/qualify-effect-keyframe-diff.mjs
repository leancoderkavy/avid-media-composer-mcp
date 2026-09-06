import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const source=path.resolve('.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0/candidate-refreshed.avb');
const sourceHash=await sha256File(source);assert.equal(sourceHash,'ddd4ae79e3863dd4d92cd89c70a9d537c21e8b6cd00efd8dc1b35c940dc29ca5');
const root=path.resolve('.avid-mcp-analysis',`effect-keyframe-diff-${randomUUID()}`);await mkdir(root);
const target=path.join(root,'owned.avb'),variant=path.join(root,'variant.avb');await copyFile(source,target);
const python=path.resolve('.venv/Scripts/python.exe');
const code=`import avb,sys
from pathlib import Path
assert not Path(sys.argv[2]).exists()
with avb.open(sys.argv[1]) as f:
 m=next(m for m in f.content.mobs if m.name=='MCP_Sonoma_AAF_Selects.Copy.05.Copy.01')
 effect=next(c for _,_,c in m.tracks[0].component.positions() if c.class_id==b'TKFX')
 keyframes=effect.keyframes
 before=keyframes.parameters[0].level
 keyframes.parameters[0].level=before+1
 keyframes.mark_modified()
 f.write(sys.argv[2])
with avb.open(sys.argv[2]) as f:
 m=next(m for m in f.content.mobs if m.name=='MCP_Sonoma_AAF_Selects.Copy.05.Copy.01')
 effect=next(c for _,_,c in m.tracks[0].component.positions() if c.class_id==b'TKFX')
 assert effect.keyframes.parameters[0].level==before+1
print(before)
`;
const mutated=await runProcess(python,['-c',code,source,variant],{timeoutMs:30000,maxOutputBytes:4096});assert.equal(mutated.exitCode,0,mutated.stderr);
const client=new Client({name:'saved-keyframe-diff',version:'1.0'}),events=[];
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:python,AVID_MCP_CAPABILITIES:'inspect'}}));
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});events.push({name,args,result:r});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
try{
 const before=await call('avid_snapshot_saved_bins',{bins:[target]});
 await copyFile(variant,target);
 const after=await call('avid_snapshot_saved_bins',{bins:[target]});
 const diff=await call('avid_diff_saved_snapshots',{baseline:before.revision,candidate:after.revision});
 assert.equal(diff.totalChanges,1);assert.equal(diff.complete,false);
 const change=diff.changes[0];assert.equal(change.change,'changed');assert.equal(change.before.name,change.after.name);
 const beforeEffect=change.before.tracks[0].nodes[0].effect,afterEffect=change.after.tracks[0].nodes[0].effect;
 assert.notDeepEqual(beforeEffect.keyframesFingerprint,afterEffect.keyframesFingerprint);
 const normalized=structuredClone(change.after);normalized.tracks[0].nodes[0].effect.keyframesFingerprint=beforeEffect.keyframesFingerprint;
 assert.deepEqual(normalized,change.before,'Only the first effect keyframe fingerprint should change');
 assert.equal(await sha256File(source),sourceHash);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({source,sourceHash,events,originalUnchanged:true,scope:'Offline one-unit keyframe level change on an owned copy detected by actual MCP snapshots/diff. No native edit, rendering or effect math verified.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,totalChanges:diff.totalChanges,before:beforeEffect.keyframesFingerprint,after:afterEffect.keyframesFingerprint,originalUnchanged:true}));
}finally{await client.close();}
