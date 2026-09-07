import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';

export async function smokeSnapshotPackage({installedRoot,temporary,python}){
 const directory=path.join(await realpath(temporary),'snapshot-fixture');await mkdir(directory);
 const file=path.join(directory,'source.avb'),script=path.join(directory,'fixture.py');
 await writeFile(script,`import sys,avb
with avb.open() as f:
 m=f.create.Composition(mob_type='CompositionMob');m.name='Snapshot fixture';m.edit_rate=30;m.length=60
 u=f.create.Attributes();u['Comments']='Reviewed take';m.attributes['_USER']=u
 t=f.create.Track();t.index=1
 c=f.create.SourceClip(edit_rate=30,media_kind='picture');c.length=60;c.start_time=120;c.track_id=1
 t.component=c;m.tracks.append(t);f.content.add_mob(m);f.write(sys.argv[1])
`);
 const {runProcess}=await import(pathToFileURL(path.join(installedRoot,'dist/process.js')).href);
 const generated=await runProcess(python,['-E','-s','-B',script,file],{timeoutMs:60000,maxOutputBytes:8192});assert.equal(generated.exitCode,0,generated.stderr);
 const hash=async()=>createHash('sha256').update(await readFile(file)).digest('hex'),before=await hash();
 for(const name of ['avb','avid_markers'])await writeFile(path.join(directory,`${name}.py`),"raise RuntimeError('untrusted snapshot module')\n");
 const connect=async()=>{const client=new Client({name:'installed-snapshot-smoke',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(installedRoot,'dist/index.js')],cwd:directory,stderr:'pipe',env:{...getDefaultEnvironment(),PYTHONPATH:directory,AVID_MCP_ALLOWED_ROOTS:directory,AVID_MCP_OUTPUT_ROOT:directory,AVID_MCP_PYTHON:python,AVID_MCP_CAPABILITIES:'inspect,export'}}));return client;};
 const call=async(client,name,args)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
 let client=await connect();
 try{
  const first=await call(client,'avid_snapshot_saved_bins',{bins:[file]});assert.equal(first.complete,true);assert.equal(first.bins[0].sha256,before);assert.equal(first.bins[0].mobs.length,1);
  const search={revision:first.revision,filters:{query:'REVIEWED',fields:['comment'],rate:30}};
  const found=await call(client,'avid_saved_snapshot_mobs',search);assert.equal(found.totalMatches,1);assert.equal(found.mobs[0].name,'Snapshot fixture');
  assert.equal((await call(client,'avid_saved_snapshot_mobs',{...search,filters:{...search.filters,fields:['name']}})).totalMatches,0);
  const args={revision:first.revision,mobId:first.bins[0].mobs[0].mobId,start:10,end:30};
  const range=await call(client,'avid_saved_timeline_range',args);assert.equal(range.results.length,1);assert.equal(range.results[0].overlapSourceStart,130);assert.equal(range.results[0].overlapSourceEnd,150);
  await client.close();client=await connect();assert.deepEqual(await call(client,'avid_saved_timeline_range',args),range);assert.deepEqual(await call(client,'avid_saved_snapshot_mobs',search),found);
  const second=await call(client,'avid_snapshot_saved_bins',{bins:[file]});assert.equal((await call(client,'avid_diff_saved_snapshots',{baseline:first.revision,candidate:second.revision})).totalChanges,0);assert.equal(await hash(),before);
 }finally{await client.close();}
}
