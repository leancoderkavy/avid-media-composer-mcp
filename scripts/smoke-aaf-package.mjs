import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';

export async function smokeAafPackage({installedRoot,temporary,python}){
  const directory=path.join(await realpath(temporary),'aaf-fixture');await mkdir(directory);
  const script=path.join(directory,'fixture.py');
  await writeFile(script,`import sys,json
from pathlib import Path
import aaf2
root=Path(sys.argv[1]);files=[]
for index in range(2):
 media=root/('media%d.mov'%index);media.write_bytes(b'synthetic media locator only')
 file=root/('source%d.aaf'%index)
 with aaf2.open(str(file),'w') as f:
  source=f.create.SourceMob('origin%d'%index);source.descriptor=f.create.ImportDescriptor()
  locator=f.create.NetworkLocator();locator['URLString'].value=media.as_uri();source.descriptor['Locator'].append(locator);f.content.mobs.append(source)
  master=f.create.MasterMob('master%d'%index);f.content.mobs.append(master)
  for slot_id,kind in [(1,'picture'),(2,'sound'),(3,'sound')]:
   slot=master.create_empty_sequence_slot(30,slot_id=slot_id,media_kind=kind)
   slot.segment.components.append(f.create.SourceClip(media_kind=kind,length=120));slot.segment.length=120
 files.append(str(file))
print(json.dumps(files))
`);
  const {runProcess}=await import(pathToFileURL(path.join(installedRoot,'dist/process.js')).href);
  const generated=await runProcess(python,[script,directory],{timeoutMs:60000,maxOutputBytes:8192});
  assert.equal(generated.exitCode,0,generated.stderr);
  const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
  const sources=await Promise.all(JSON.parse(generated.stdout).map(async file=>({file,expectedSha256:await hash(file)})));
  const client=new Client({name:'installed-aaf-smoke',version:'1.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(installedRoot,'dist/index.js')],cwd:directory,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:directory,AVID_MCP_OUTPUT_ROOT:directory,AVID_MCP_PYTHON:python,AVID_MCP_CAPABILITIES:'inspect,export'}}));
  const call=async(name,args)=>{
    const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});
    assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;
  };
  try{
    const merged=await call('avid_merge_aaf_references',{request:{sources}});
    assert.equal(merged.graphVerified,true);assert.equal(merged.masters.length,2);
    const request={template:merged.template,expectedSha256:merged.sha256,name:'Installed two-source selects',rate:'30',tracks:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound',channels:2}],selects:merged.masters.map((m,index)=>({mobId:m.mobId,start:10+index*20,length:15,slotIds:[1,[2,3]]}))};
    const built=await call('avid_build_aaf_selects',{request});
    assert.equal(built.sourceGraphVerified,true);assert.equal(built.conformanceVerified,true);assert.equal(built.sha256,await hash(built.output));
    const inspected=await call('avid_inspect_aaf_selects',{file:built.output});
    assert.equal(inspected.composition.frames,30);
    assert.deepEqual(inspected.composition.tracks[0].cuts.map(c=>[c.mobId,c.start,c.length]),request.selects.map(s=>[s.mobId,s.start,s.length]));
    assert.equal(inspected.composition.tracks[1].channels,2);assert.equal(inspected.composition.tracks[1].cuts.length,4);
    const refused=await client.callTool({name:'avid_build_aaf_selects',arguments:{request:{...request,expectedSha256:'0'.repeat(64)}}});
    assert.equal(refused.isError,true);assert.match(JSON.stringify(refused),/checksum changed/);
    for(const source of sources)assert.equal(await hash(source.file),source.expectedSha256);
    assert.equal(await hash(merged.template),merged.sha256);assert.equal(await hash(built.output),built.sha256);
  }finally{await client.close();}
}
