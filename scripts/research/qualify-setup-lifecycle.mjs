import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {runProcess} from '../../dist/process.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=await mkdtemp(path.join(os.tmpdir(),'avid-cli-'));
const cli=async args=>{const result=await runProcess(process.execPath,['dist/cli.js',...args],{timeoutMs:15000,maxOutputBytes:1048576});assert.equal(result.exitCode,0,result.stderr);return JSON.parse(result.stdout);};
const results=[];
for(const clientName of ['claude','vscode']){
  const file=path.join(root,`${clientName}.json`),key=clientName==='vscode'?'servers':'mcpServers';
  await writeFile(file,JSON.stringify({theme:'original',[key]:{other:{command:'leave-alone'}}}));
  const base=['--client',clientName,'--config',file],installed=await cli([...base,'--root',root,'--install']);
  const config=JSON.parse(await readFile(file,'utf8')),entry=config[key]['avid-media-composer'];
  const client=new Client({name:'setup-qualification',version:'1.0'});
  await client.connect(new StdioClientTransport({command:entry.command,args:entry.args,env:{...process.env,...entry.env}}));
  try{assert.ok(!(await client.callTool({name:'avid_ping',arguments:{}})).isError);}finally{await client.close();}
  const updated=await cli([...base,'--root',root,'--output',root,'--update','--expected-sha256',installed.sha256]);
  const changed=JSON.parse(await readFile(file,'utf8'));changed.theme='later-edit';await writeFile(file,JSON.stringify(changed));
  const status=await cli(['--config-status','--config',file]);
  const restored=await cli([...base,'--restore',updated.backup,'--expected-sha256',status.sha256]);
  const rolledBack=JSON.parse(await readFile(file,'utf8'));assert.equal(rolledBack.theme,'later-edit');assert.equal(rolledBack[key].other.command,'leave-alone');assert.ok(!rolledBack[key]['avid-media-composer'].env.AVID_MCP_OUTPUT_ROOT);
  const removed=await cli([...base,'--remove','--expected-sha256',restored.sha256]);
  assert.deepEqual((await cli(['--config-status','--config',file])).configuredIn,[]);
  results.push({clientName,installed,updated,restored,removed,generatedCommandPing:true});
}
await writeFile('.avid-mcp-analysis/setup-lifecycle.json',JSON.stringify({root,results,scope:'CLI and generated MCP command; named client applications not launched'},null,2));
console.log(JSON.stringify({passed:true,configFormats:results.length,installUpdateRestoreRemove:true,generatedCommandPing:true}));
