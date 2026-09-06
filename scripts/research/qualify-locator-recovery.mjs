import {mkdir,copyFile,writeFile,rename,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.platform,'win32');
const originalBin='D:/Avid Projects/MCP_Sonoma_30p_20260905/MCP_Load_7006b4d8.avb';
const originalMedia='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const originalHashes=await Promise.all([originalBin,originalMedia].map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`locator-recovery-${randomUUID()}`);await mkdir(root);
const bins=path.join(root,'bins'),mediaRoot=path.join(root,'media'),output=path.join(root,'output');
for(const directory of [bins,mediaRoot,output])await mkdir(directory);
const media=path.join(mediaRoot,'owned-copy.mp4'),bin=path.join(bins,'owned-locators.avb');
await copyFile(originalMedia,media,constants.COPYFILE_EXCL);
const python=path.resolve('.venv/Scripts/python.exe');
const program=`import avb,sys,os
source,output,media=sys.argv[1:]
assert not os.path.exists(output)
with avb.open(source) as f:
    changed=0
    for mob in f.content.mobs:
        locator=getattr(getattr(mob,'descriptor',None),'locator',None)
        if locator is None: continue
        for field in ('path','path_utf8'):
            if field in locator.property_data:
                setattr(locator,field,media)
                changed+=1
    assert changed==2, changed
    f.write(output)
print(changed)
`;
const prepared=spawnSync(python,['-c',program,originalBin,bin,media],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
assert.ifError(prepared.error);assert.equal(prepared.status,0,prepared.stderr);
const copiedHashes=await Promise.all([bin,media].map(sha256File)),clients=[],events=[];
const connect=async()=>{const client=new Client({name:'locator-recovery-proof',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:[bins,mediaRoot].join(path.delimiter),AVID_MCP_OUTPUT_ROOT:output,AVID_MCP_CAPABILITIES:'inspect,export'}});clients.push(client);await client.connect(transport);return client;};
const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});events.push({name,response});await writeFile(path.join(root,'events.json'),JSON.stringify(events,null,2));assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent.data;};
const ownedMove=async(from,to)=>{
 const canonicalRoot=await realpath(root),canonicalFrom=await realpath(from),canonicalParent=await realpath(path.dirname(to));
 for(const candidate of [canonicalFrom,canonicalParent,path.resolve(to)]){const relative=path.relative(canonicalRoot,candidate);assert.ok(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Move escaped owned experiment');}
 await rename(from,to);
};
const heldFile=path.join(mediaRoot,'owned-copy-held.mp4'),heldRoot=path.join(root,'media-held'),heldBin=path.join(bins,'owned-locators-held.avb');let fileMoved=false,rootMoved=false,binMoved=false;
try{
 let client=await connect();const snapshot=await call(client,'avid_snapshot_saved_bins',{bins:[bin]});
 const check=async(label,expected)=>{
  const result=await call(client,'avid_saved_locator_availability',{revision:snapshot.revision,limit:50});
  const declared=result.results.filter(row=>row.value===media);assert.equal(declared.length,2);assert.ok(declared.every(row=>row.status===expected),JSON.stringify(result));
  await writeFile(path.join(root,label+'.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
 };
 const present=await check('present','file_present');
 await ownedMove(media,heldFile);fileMoved=true;await client.close();client=await connect();
 const missing=await check('missing','not_found');
 await ownedMove(heldFile,media);fileMoved=false;
 const restored=await check('restored','file_present');
 await ownedMove(mediaRoot,heldRoot);rootMoved=true;await client.close();client=await connect();
 const unavailable=await check('unavailable-root','unavailable');
 await ownedMove(heldRoot,mediaRoot);rootMoved=false;
 const rootRestored=await check('root-restored','file_present');
 await ownedMove(bin,heldBin);binMoved=true;await client.close();client=await connect();
 const binAbsent=await check('bin-absent','file_present');
 assert.deepEqual(binAbsent.missingBins,[bin]);assert.equal(binAbsent.binHashesRevalidated,false);assert.ok(binAbsent.results.every(row=>row.binPresent===false));
 const empty=await call(client,'avid_saved_locator_availability',{revision:snapshot.revision,after:999,limit:1});assert.deepEqual(empty.missingBins,[bin]);assert.deepEqual(empty.results,[]);
 await ownedMove(heldBin,bin);binMoved=false;
 const binRestored=await check('bin-restored','file_present');assert.deepEqual(binRestored.missingBins,[]);assert.ok(binRestored.results.every(row=>row.binPresent===true));
 assert.deepEqual(await Promise.all([originalBin,originalMedia].map(sha256File)),originalHashes);
 assert.deepEqual(await Promise.all([bin,media].map(sha256File)),copiedHashes);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,snapshotRevision:snapshot.revision,originalHashes,copiedHashes,originalsUnchanged:true,copiesRestored:true,
  present,missing,restored,unavailable,rootRestored,binAbsent,binRestored,empty,scope:'A copied AVB with exactly two locator fields deliberately changed to an owned MP4 copy, captured through the real Python/MCP parser. File, configured-root and saved-bin absence/restoration observed across fresh MCP connections, including missing-bin evidence on an empty page. Originals are never moved. This tests locator metadata recovery, not Avid online/relink or native bin import.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,states:['file_present','not_found','file_present','unavailable','file_present']}));
}finally{
 if(binMoved)await ownedMove(heldBin,bin);
 if(rootMoved)await ownedMove(heldRoot,mediaRoot);
 if(fileMoved)await ownedMove(heldFile,media);
 for(const client of clients)await client.close().catch(()=>{});
}
