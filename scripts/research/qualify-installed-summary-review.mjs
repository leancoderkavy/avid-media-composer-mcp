import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const previous=process.argv[2];assert.ok(previous&&path.isAbsolute(previous)&&process.argv.length===3,'Pass absolute qualify-summary-boundaries evidence.json');
const evidence=JSON.parse(await readFile(previous,'utf8')),libraryRoot=path.dirname(previous),source='D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4';
assert.equal(await sha256File(source),evidence.id);
const expected=[evidence.overview,...evidence.leaves];assert.ok(expected.length>1&&expected.every(node=>node.modelInput?.status==='reconstructed_recipe'));
const protectedFiles=[previous,source,path.join(libraryRoot,'avid-mcp-library',`summary-${evidence.generated.revision}.json`),path.join(libraryRoot,'avid-mcp-library',`${evidence.id}.transcript-${evidence.overview.transcriptRevision}.json`)];
const before=await Promise.all(protectedFiles.map(sha256File));
const root=path.resolve('.avid-mcp-analysis',`installed-summary-review-${randomUUID()}`);await mkdir(root);
const run=async args=>{const result=await runProcess(process.execPath,args,{timeoutMs:300000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout);};
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=await run([npm,'pack','--json','--ignore-scripts','--pack-destination',root]);assert.equal(path.basename(packed[0].filename),packed[0].filename);
const archive=path.join(root,packed[0].filename),archiveSha256=await sha256File(archive);
const installation=await run(['dist/cli.js','--package-install',archive,'--package-root',path.join(root,'packages'),'--package-sha256',archiveSha256]);
const passes=[];
for(let pass=0;pass<2;pass++){
 const client=new Client({name:'installed-summary-review',version:'1.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[installation.entry],cwd:root,stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(source),AVID_MCP_OUTPUT_ROOT:libraryRoot,AVID_MCP_CAPABILITIES:'inspect'}}));
 try{
  const results=[];
  for(const original of expected){
   const response=await client.callTool({name:'avid_summary_node',arguments:{revision:evidence.generated.revision,nodeId:original.node.nodeId}});
   assert.ok(!response.isError,JSON.stringify(response));const current=response.structuredContent.data;
   assert.deepEqual(current.modelInput,original.modelInput);assert.deepEqual(current.sources,original.sources);assert.deepEqual(current.sourceExcerpts,original.sourceExcerpts);assert.equal(current.factualEntailmentVerified,false);
   results.push({nodeId:current.node.nodeId,input:current.modelInput,reviewRequired:current.reviewRequired});
  }
  passes.push(results);
  await writeFile(path.join(root,`pass-${pass}.json`),JSON.stringify(results,null,2),{flag:'wx'});
 }finally{await client.close();}
}
assert.deepEqual(passes[0],passes[1]);assert.deepEqual(await Promise.all(protectedFiles.map(sha256File)),before);
assert.equal(await sha256File(installation.entry),installation.entrySha256);assert.equal(await sha256File(archive),archiveSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({previous,installation,archiveSha256,passes:2,nodesPerPass:expected.length,modelConfigurationSupplied:false,foreignWorkingDirectory:true,protectedFilesUnchanged:true,scope:'Fresh installed stdio MCP summary review and reconnect against existing synthetic-note Sonoma evidence. No model loading, generation quality or named-client GUI claim.'},null,2),{flag:'wx'});
console.log(JSON.stringify({root,passes:2,nodesPerPass:expected.length,ok:true}));
