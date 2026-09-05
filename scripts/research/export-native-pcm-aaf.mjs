// Export only the owned, previously linked PCM master as a new AAF template.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {NativeClient} from '../../dist/native/client.js';
import {withNativeLock,NativeExportUncertain} from '../../dist/native/lock.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const reference=JSON.parse(await readFile('.avid-mcp-analysis/native-pcm-link-4f20d2e6-cab0-41e9-8c6a-a25528ee2898/evidence.json','utf8'));
const projectPath=path.resolve('D:/Avid Projects/MCP_Sonoma_30p_20260905');
assert.equal(reference.mobId,'060a2b340101010001010f0013-000000-570c581977aa752c-9972045256f7-4dd2');
assert.equal(await sha256File(reference.media),reference.mediaSha256);
const root=path.resolve('.avid-mcp-analysis',`native-pcm-aaf-${randomUUID()}`);await mkdir(root);
const output=path.join(root,'export','PCM_reference.aaf'),records=[];
const client=new NativeClient('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe');
const call=async(method,body={},owner)=>{const result=await client.call(method,body,owner);records.push({method,body,result});await writeFile(path.join(root,'calls.json'),JSON.stringify(records,null,2));return result;};
await withNativeLock(async()=>{
  const [project]=await call('GetOpenProjectInfo');assert.equal(path.resolve(project.path),projectPath);const owner=client.ownerIdentity;
  const info=await call('GetMobInfo',{mob_id:reference.mobId},owner);assert.ok(JSON.stringify(info).includes('Sonoma_SourceClock_Stereo'));
  const settings=await call('GetListOfExportSettings',{},owner);assert.ok(settings.some(value=>value.setting_names?.includes('AAF')));
  await writeFile(path.join(root,'attempt.json'),JSON.stringify({mobId:reference.mobId,output,preset:'AAF',owner}),{flag:'wx'});
  try{
    await call('ExportFile',{mob_id:reference.mobId,file_name:'PCM_reference',export_settings_name:'AAF',destination_path:root,in_directory:'export',option_flags:['Export_StopIf_OfflineMedia','Export_StopIf_UnknownFX']},owner);
    let previous='',stable=0,ready=false;
    for(let attempt=0;attempt<60;attempt++){
      let status;try{status=await stat(output);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(status?.isFile()&&status.size>512&&status.size<=64*1024*1024){const identity=`${status.size}:${status.mtimeMs}`;stable=identity===previous?stable+1:0;previous=identity;if(stable>=2){ready=true;break;}}
      await delay(1000);
    }
    assert.ok(ready,'AAF output not ready; do not repeat export');
    const bytes=await readFile(output);assert.equal(bytes.subarray(0,8).toString('hex'),'d0cf11e0a1b11ae1');
    const [after]=await call('GetOpenProjectInfo',{},owner);assert.equal(path.resolve(after.path),projectPath);
    assert.equal(await sha256File(reference.media),reference.mediaSha256);
    const report={output,sha256:await sha256File(output),mobId:reference.mobId,sourceMedia:reference.media,sourceSha256:reference.mediaSha256,sourceUnchanged:true,exportRetried:false,limitations:['Stable AAF container only; inspect source descriptors and tracks before using the template.','This is a fixed research export, not a general MCP AAF export action.']};
    await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
  }catch(error){throw new NativeExportUncertain(output,error.message);}
});
