// Real local-media coverage through the shipped stdio tool; preserves every attempt.
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const sourceRoot='D:/Sonoma Escape Edit';
const root=path.resolve('.avid-mcp-analysis',`source-clock-matrix-${randomUUID()}`);
await mkdir(root);
const files=(await readdir(sourceRoot)).filter(name=>name.endsWith('.mp4')).sort();
assert.equal(files.length,7,'Review the fixture inventory before changing coverage');
const evidence={root,results:[],hostImportVerified:false};
const client=new Client({name:'source-clock-matrix',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:sourceRoot,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:'inspect,export',AVID_MCP_COMMAND_TIMEOUT_MS:'120000'}}));
try {
  for(const name of files){
    const file=path.join(sourceRoot,name),expectedSha256=await sha256File(file);
    const result=await client.callTool({name:'avid_prepare_source_clock_media',arguments:{options:{file,expectedSha256,videoStream:0,audioStream:1}}},undefined,{timeout:600000});
    const sourceUnchanged=await sha256File(file)===expectedSha256;
    const entry={file,expectedSha256,sourceUnchanged,result};
    evidence.results.push(entry);
    await writeFile(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({file,sourceUnchanged,isError:result.isError??false,evidence:path.join(root,'evidence.json')}));
    assert.ok(sourceUnchanged,'Source changed');
    if(!result.isError){const data=result.structuredContent.data;assert.equal(data.verified,true);assert.equal(data.hostImportVerified,false);assert.equal(await sha256File(data.output),data.outputSha256);}
  }
  assert.ok(evidence.results.every(entry=>!entry.result.isError),'One or more preparations failed; inspect retained evidence');
} finally {await client.close();}
