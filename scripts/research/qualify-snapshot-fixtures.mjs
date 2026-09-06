import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const root=path.resolve('.avid-mcp-analysis',`snapshot-fixtures-${randomUUID()}`);await mkdir(root);
const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const generate=await runProcess(python,['-c',
 `import sys,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_timeline import TimelineTests; t=TimelineTests(); root=Path(sys.argv[2]); result=[]
for name in ['subclip','stereo','opaque','transition']:
 d=root/name; d.mkdir(); p=t.transition_fixture(d) if name=='transition' else t.fixture(d) if name=='subclip' else t.stereo_fixture(d, (lambda e:setattr(e,'effect_id','OTHER_EFFECT')) if name=='opaque' else None); result.append(dict(name=name,file=str(p)))
print(json.dumps(result))`,path.resolve('python/tests'),root],{timeoutMs:30000});
assert.equal(generate.exitCode,0,generate.stderr);const fixtures=JSON.parse(generate.stdout);
const client=new Client({name:'snapshot-fixture-proof',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_PYTHON:python}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
const results=[];
try{
 for(const fixture of fixtures){
  const before=await sha256File(fixture.file);
  const captured=await call('avid_snapshot_saved_bins',{bins:[fixture.file]});
  const mob=captured.bins[0].mobs[0];
  const report=await call('avid_saved_sequence_complexity',{revision:captured.revision,mobId:mob.mobId});
  const range=await call('avid_saved_timeline_range',{revision:captured.revision,mobId:mob.mobId,start:0,end:mob.duration});
  assert.equal(report.duration,fixture.name==='transition'?110:fixture.name==='subclip'?60:30);
  assert.equal(report.complete,!['opaque','transition'].includes(fixture.name));
  assert.equal(report.opaqueNodes,['opaque','transition'].includes(fixture.name)?1:0);
  assert.equal(report.sourceReferences,fixture.name==='opaque'?0:2);
  if(fixture.name==='subclip')assert.deepEqual(range.results.map(n=>[n.timelineStart,n.timelineEnd,n.sourceStart]),[[0,30,1090],[30,60,2000]]);
  if(fixture.name==='stereo')assert.deepEqual(range.results.map(n=>[n.timelineStart,n.timelineEnd,n.sourceStart,n.channelCombiner.channelIndex]),[[0,30,2860,1],[0,30,2860,2]]);
  if(fixture.name==='transition'){
   assert.deepEqual(range.results.map(n=>[n.kind,n.timelineStart,n.timelineEnd]),[['SCLP',0,60],['TNFX',50,60],['SCLP',50,110]]);
   const overlap=await call('avid_saved_timeline_range',{revision:captured.revision,mobId:mob.mobId,start:55,end:58});
   assert.equal(overlap.complete,false);assert.equal(overlap.results.length,3);
   assert.deepEqual(overlap.results.filter(n=>n.sourceStart!==undefined).map(n=>[n.overlapSourceStart,n.overlapSourceEnd]),[[1055,1058],[2005,2008]]);
  }
  assert.equal(await sha256File(fixture.file),before);results.push({fixture,sha256:before,report,range});
 }
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,results,sourceFilesUnchanged:true,scope:'Generated pyavb subclip/stereo/opaque fixtures through real Python and MCP; not native editor import or general transition qualification'},null,2));
 console.log(JSON.stringify({ok:true,root,cases:results.length}));
}finally{await client.close();}
