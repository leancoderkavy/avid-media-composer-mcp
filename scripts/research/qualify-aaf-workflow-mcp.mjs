// Complete the native-reference/build workflow using its new selects artifact.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
assert.ok(process.argv.slice(2).every(arg=>['--canonical-tracks','--original-reference','--stereo','--prepared-media'].includes(arg)));
const preparedMedia=process.argv.includes('--prepared-media');
const stereo=process.argv.includes('--stereo');
const canonicalTracks=process.argv.includes('--canonical-tracks');
const originalReference=process.argv.includes('--original-reference');
assert.ok(!originalReference||canonicalTracks,'Original-reference comparison requires canonical tracks');
assert.ok(!stereo||canonicalTracks,'Stereo requires canonical tracks');
assert.ok(!preparedMedia||(stereo&&!originalReference),'Prepared media requires stereo and its own new reference');
const upstreamFile=path.resolve('.avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/evidence.json'),upstream=JSON.parse(await readFile(upstreamFile,'utf8'));
let file=upstream.built.output,expectedSha256='eb14ed8fb9710ef2d3877fd422bc33c11611c92d644fb91786eba733ff2be8d2';assert.equal(await sha256File(file),expectedSha256);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905',originalBin=path.join(project,'MCP_AAF_Selects_20260905.avb'),before=await sha256File(originalBin);
const preserved=[upstreamFile,file,upstream.applied.verification.output,...upstream.built.media.map(item=>item.file)],hashes=await Promise.all(preserved.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`aaf-workflow-mcp-${randomUUID()}`);await mkdir(root);const records=[];
const binName=`MCP_Workflow_${randomUUID().slice(0,8)}`,bin=`${binName}.avb`;
const client=new Client({name:'aaf-workflow-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:`${project};${path.resolve('.avid-mcp-analysis')}`,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_PYTHON:path.resolve('.venv/Scripts/python.exe'),AVID_MCP_CAPABILITIES:'inspect,edit,project-write,export'}}));
const call=async(name,args,error=false)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});records.push({name,args,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));assert.equal(Boolean(result.isError),error,JSON.stringify(result));return error?result:result.structuredContent.data;};
const action=async operation=>{const preview=await call('avid_native_preview',{operation});const applied=await call('avid_native_apply',{token:preview.token});const replay=await call('avid_native_apply',{token:preview.token},true);assert.match(JSON.stringify(replay),/consumed/);return applied;};
try{
 let preparedReference;
 if(preparedMedia){
  const receipt=path.resolve('.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/evidence.json');
  const preparation=JSON.parse(await readFile(receipt,'utf8')).data;
  assert.equal(preparation.outputSha256,'f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb');
  assert.equal(await sha256File(preparation.output),preparation.outputSha256);
  preserved.push(receipt,preparation.output);hashes.push(await sha256File(receipt),preparation.outputSha256);
  const linkName=`MCP_Prepared_${randomUUID().slice(0,8)}`,linkBin=`${linkName}.avb`;
  await action({action:'create_bin',name:linkName});
  await action({action:'link_media',bin:linkBin,media:preparation.output});
  const clips=await call('avid_native_read',{query:'clips',bin:linkBin});assert.equal(clips.length,1);
  const sourceMobId=clips[0].mob_id;
  await action({action:'close_bin',bin:linkBin});await action({action:'open_bin',bin:linkBin});
  const reopened=await call('avid_native_read',{query:'clips',bin:linkBin});assert.equal(reopened.length,1);assert.equal(reopened[0].mob_id,sourceMobId);
  const exported=await action({action:'export_aaf_master',bin:linkBin,mobId:sourceMobId,preset:'AAF',sourceFile:preparation.output,expectedSourceSha256:preparation.outputSha256});
  preparedReference=exported.verification.inspection;
  assert.equal(preparedReference.media.length,1);assert.equal(path.resolve(preparedReference.media[0].file),path.resolve(preparation.output));
  preserved.push(preparedReference.template);hashes.push(preparedReference.sha256);
 }
 if(canonicalTracks){
  const reference=preparedReference??(originalReference?await call('avid_inspect_aaf_template',{template:path.resolve('.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf')}):upstream.applied.verification.inspection);
  assert.equal(await sha256File(reference.template),preparedMedia?reference.sha256:originalReference?'5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d':'94ff38c9ac7256254030b3f6b24aa98d28427f5c614791a2e5e3d745423ab66c');
  if(originalReference){preserved.push(reference.template);hashes.push(reference.sha256);}
  const master=reference.masters[0];
  const tracks=stereo?[{name:'V1',kind:'picture'},{name:'A1',kind:'sound',channels:2}]:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound'},{name:'A2',kind:'sound'}];
  const built=await call('avid_build_aaf_selects',{request:{template:reference.template,expectedSha256:reference.sha256,name:stereo?'MCP_Explicit_Stereo_Selects':'MCP_Canonical_Pipeline_Selects',rate:'30',tracks,selects:[2850,3300].map(start=>({mobId:master.mobId,start,length:60,slotIds:stereo?[1,[2,3]]:[1,2,3]}))}});
  file=built.output;expectedSha256=built.sha256;
 }
 const inspected=await call('avid_inspect_aaf_selects',{file});assert.equal(inspected.sha256,expectedSha256);
 const currentProject=await call('avid_native_read',{query:'project'});assert.equal(path.resolve(currentProject.path),path.resolve(project));
 await action({action:'create_bin',name:binName});
 const imported=await action({action:'import_aaf_selects',bin,file,expectedSha256,preset:'Untitled'});assert.equal(imported.hostMetadataVerified,true);
 await action({action:'close_bin',bin});const binFile=path.join(project,bin),savedBinSha256=await sha256File(binFile);await action({action:'open_bin',bin});
 const reopened=await call('avid_native_read',{query:'clips',bin});assert.equal(reopened.filter(item=>item.mob_id===imported.sequence.mob_id).length,1);
 const snapshot=await call('avid_snapshot_saved_bins',{bins:[binFile]});const sequence=snapshot.bins[0].mobs.find(mob=>mob.name===inspected.composition.name);assert.ok(sequence);
 const ranges=await call('avid_saved_timeline_range',{revision:snapshot.revision,mobId:sequence.mobId,start:0,end:120,limit:200});assert.equal(ranges.nextAfter,null);
 const sources=ranges.results.filter(item=>item.sourceStart!==undefined);assert.equal(sources.length,6);
 const shape=item=>[item.timelineStart,item.timelineEnd,item.sourceStart,item.overlapSourceEnd],expected=[[0,60,2850,2910],[60,120,3300,3360]];
 assert.deepEqual(sources.filter(item=>item.mediaKind==='picture').map(shape),expected);
 // The host may retain separate audio tracks or combine them. Rendering must
 // independently establish channel identity; topology alone cannot do so.
 for(const channel of [1,2])assert.deepEqual(sources.filter(item=>item.mediaKind==='sound'&&item.sourceTrackId===channel).map(shape),expected);
 if(stereo)for(const channel of [1,2])assert.deepEqual(sources.filter(item=>item.channelCombiner?.channelIndex===channel).map(shape),expected);
 assert.ok(sources.every(item=>item.sourceMobId===inspected.masters[0].mobId));
 const rendered=await action({action:'export_mp4',bin,mobId:imported.sequence.mob_id,preset:'MCP_H264_Stereo_Legal_20260905',expected:{videoCodec:'h264',width:1920,height:1080,frames:120,rate:{num:30,den:1},videoStartTime:0,audio:[{codec:'pcm_s24le',channels:2,sampleRate:48000,startTime:0}],color:{range:'tv',space:'bt709',transfer:'bt709',primaries:'bt709'}}});assert.equal(rendered.outputVerified,true);
 assert.equal(await sha256File(binFile),savedBinSha256);assert.equal(await sha256File(originalBin),before);assert.deepEqual(await Promise.all(preserved.map(sha256File)),hashes);
 const status=await call('avid_native_lock_status',{});assert.equal(status.locked,false);
 assert.equal(await sha256File(file),expectedSha256);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({upstreamFile,upstreamSha256:hashes[0],canonicalTracks,originalReference,stereo,preparedMedia,preparedReference,file,expectedSha256,bin,imported,snapshot,ranges,rendered,savedBinSha256,reopenedIdentityVerified:true,allTokensReplayRefused:true,preserved,hashes,filesUnchanged:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),output:rendered.verification.output,bin,savedRangesVerified:true,filesUnchanged:true}));
}finally{await client.close();}
