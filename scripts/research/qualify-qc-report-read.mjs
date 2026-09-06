import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=path.resolve('.avid-mcp-analysis',`qc-reports-mcp-${randomUUID()}`);await mkdir(root);
const output=path.resolve('.avid-mcp-analysis/sonoma-qc-amount-cda30236-6e66-48b5-95b8-016efd885e9f');
const id='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca';
const connect=async()=>{const client=new Client({name:'qc-report-read-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:'D:/Sonoma Escape Edit',AVID_MCP_OUTPUT_ROOT:output,AVID_MCP_CAPABILITIES:'inspect'}}));return client;};
const call=async(client,name,args)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent.data;};
let client=await connect();
try{
 const pages=[],reports=[];let after;
 do{const page=await call(client,'avid_qc_reports',{id,limit:1,...(after?{after}:{})});pages.push(page);reports.push(...page.reports);after=page.next;assert.ok(pages.length<=10);}while(after);
 assert.equal(reports.length,1);
 const request={id,revision:reports[0].revision,expectedSha256:reports[0].sha256};
 const read=await call(client,'avid_read_qc_report',request);assert.equal(read.report.audioCoverage.samplesPerChannel,1443456);
 const rejected=await client.callTool({name:'avid_read_qc_report',arguments:{...request,expectedSha256:'0'.repeat(64)}});assert.equal(rejected.isError,true);
 await client.close();client=await connect();
 const recovered=await call(client,'avid_read_qc_report',request);assert.deepEqual(recovered,read);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,pages,read,recovered,wrongChecksumRejected:true,capabilities:['inspect']},null,2));
 console.log(JSON.stringify({ok:true,root,pages:pages.length,matchingReports:reports.length}));
}finally{await client.close();}
