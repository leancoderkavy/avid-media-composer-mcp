// Continue only the recorded disposable fixture; never re-link or re-add its marker.
import {readFile,writeFile} from 'node:fs/promises';
import {NativeAdapter} from '../../dist/native/adapter.js';
import {loadConfig} from '../../dist/config.js';
const receipts=JSON.parse(await readFile('.avid-mcp-analysis/native-mcp-20260905.json','utf8'));
const applied=receipts.filter(r=>r.name==='avid_native_apply').map(r=>r.response.structuredContent.data);
const mobId=applied[0].result[0].mob_id,guid=applied[1].result[0].guid;
const adapter=new NativeAdapter(loadConfig({AVID_MCP_NATIVE_BINARY:'C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe',AVID_MCP_ALLOWED_ROOTS:'D:/Avid Projects;D:/Sonoma Escape Edit',AVID_MCP_CAPABILITIES:'inspect,edit'}));
const bin='MCP_OpenSource_20260905.avb';
const state=await adapter.read('markers',bin,mobId);
if(state.length!==1||state[0].guid!==guid)throw new Error('Recorded marker state changed; inspect before continuing');
const output=[];
for(const action of [{action:'change_marker',bin,mobId,guid,comment:'Updated via corrected native adapter',color:'Blue'}, {action:'delete_marker',bin,mobId,guid},{action:'show_clip',bin,mobId},{action:'close_bin',bin},{action:'open_bin',bin}]){
  const preview=await adapter.preview(action);
  const result=await adapter.apply(preview.token);
  output.push(result);
  await writeFile('.avid-mcp-analysis/native-mcp-recovery-20260905.json',JSON.stringify(output,null,2));
  console.log(JSON.stringify({action:action.action,result}));
}
