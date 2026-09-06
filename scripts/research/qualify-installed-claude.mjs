import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';

const binary=process.argv[2];assert.ok(binary&&path.isAbsolute(binary)&&process.argv.length===3,'Provide the absolute installed Claude CLI executable');
const root=path.resolve('.avid-mcp-analysis',`installed-claude-${randomUUID()}`);await mkdir(root);
const run=async args=>{const result=await runProcess(process.execPath,args,{timeoutMs:300000,maxOutputBytes:4*1024*1024});assert.equal(result.exitCode,0,result.stderr);return result.stdout;};
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(await run([npm,'pack','--json','--ignore-scripts','--pack-destination',root]));
assert.equal(path.basename(packed[0].filename),packed[0].filename);
const archive=path.join(root,packed[0].filename),archiveSha256=await sha256File(archive);
const installation=JSON.parse(await run(['dist/cli.js','--package-install',archive,'--package-root',path.join(root,'packages'),'--package-sha256',archiveSha256]));
const inventory=async entry=>{
 const client=new Client({name:'installed-claude-inventory',version:'1.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect'}}));
 try{
  const tools=[];let cursor;
  do{const page=await client.listTools(cursor?{cursor}:{});tools.push(...page.tools);cursor=page.nextCursor;}while(cursor);
  assert.ok(!(await client.callTool({name:'avid_ping',arguments:{}})).isError);
  return tools.sort((a,b)=>a.name.localeCompare(b.name));
 }finally{await client.close();}
};
const current=await inventory(path.resolve('dist/index.js')),installed=await inventory(installation.entry);
await writeFile(path.join(root,'tool-definitions.json'),JSON.stringify({current,installed}));
assert.ok(isDeepStrictEqual(installed,current),`Installed tool definitions differ; inspect ${root}/tool-definitions.json`);
const named=JSON.parse(await run(['scripts/research/qualify-claude-cli.mjs',binary,installation.entry,installation.entrySha256]));
const clientEvidence=JSON.parse(await readFile(path.join(named.root,'evidence.json'),'utf8'));
assert.equal(clientEvidence.serverEntry,installation.entry);
assert.equal(await sha256File(archive),archiveSha256);
assert.equal(await sha256File(installation.entry),installation.entrySha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,installation,archive,archiveSha256,toolCount:installed.length,toolNames:installed.map(tool=>tool.name),toolDefinitionsMatch:true,ping:true,clientEvidence:named.root,limitations:clientEvidence.limitations},null,2));
console.log(JSON.stringify({ok:true,root,toolCount:installed.length,clientEvidence:named.root}));
