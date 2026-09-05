import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const client=new Client({name:'aaf-builder-qualification',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{...process.env,AVID_MCP_ALLOWED_ROOTS:process.cwd()+';D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:'.avid-mcp-analysis',AVID_MCP_CAPABILITIES:'inspect,export'}}));
const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent.data;};
try{
  const template='.avid-mcp-analysis/native-aaf-641ea933-1b82-46f0-bfd9-fb5af6b86acf/export/Sonoma_reference.aaf.aaf';
  const inspected=await call('avid_inspect_aaf_template',{template});assert.equal(inspected.masters.length,1);
  const request={template,expectedSha256:inspected.sha256,name:'MCP_AAF_Builder_Verified',rate:'30',tracks:[{name:'V1',kind:'picture'},{name:'A1',kind:'sound'},{name:'A2',kind:'sound'}],selects:[2850,3300].map(start=>({mobId:inspected.masters[0].mobId,start,length:60,slotIds:[1,2,3]}))};
  const output=await call('avid_build_aaf_selects',{request});assert.equal(output.frames,120);assert.equal(output.conformanceVerified,true);assert.equal(output.hostImportVerified,false);
  const rejected=await client.callTool({name:'avid_build_aaf_selects',arguments:{request:{...request,rate:'24'}}});assert.equal(rejected.isError,true);
  await writeFile('.avid-mcp-analysis/aaf-builder-mcp.json',JSON.stringify({inspected,output,mixedRateRejected:true},null,2));
  console.log(JSON.stringify({passed:true,frames:output.frames,tracks:output.tracks,output:output.output,mixedRateRejected:true}));
}finally{await client.close();}
