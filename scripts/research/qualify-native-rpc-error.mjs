// Read-only missing-bin probe: no mutation or retry of the earlier Comments write.
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeClient} from '../../dist/native/client.js';
import {errorDetails} from '../../dist/errors.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.argv.length,2);
const project='D:/Avid Projects/MCP_Sonoma_30p_20260905';
const absent=path.join(project,`MCP_Missing_${randomUUID()}.avb`);
const missing=async()=>{try{await access(absent);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}};
assert.equal(await missing(),true);
const sourceBin=path.join(project,'MCP_Color_ac0a950e18ee.avb'),media='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
const sourceHash=await sha256File(sourceBin),mediaHash=await sha256File(media);
const root=path.resolve('.avid-mcp-analysis',`native-rpc-error-${randomUUID()}`);await mkdir(root);
const client=new NativeClient('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe');
let response,error;
try{response=await client.call('GetBinColumnInfo',{bin_path:absent});}catch(caught){error=errorDetails(caught);}
assert.equal(await missing(),true);assert.equal(await sha256File(sourceBin),sourceHash);assert.equal(await sha256File(media),mediaHash);
await writeFile(path.join(root,'observation.json'),JSON.stringify({method:'GetBinColumnInfo',absent,response,error,sourceHash,mediaHash,sourceUnchanged:true,missingBinNotCreated:true},null,2),{flag:'wx'});
assert.equal(error?.code,'NATIVE_RPC_REJECTED','Retained unexpected outcome; do not change the probe into a write');
assert.equal(error.details?.operationOutcome,'not_verified');
console.log(JSON.stringify({root,error,sourceUnchanged:true,missingBinNotCreated:true}));
