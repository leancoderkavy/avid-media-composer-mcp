import {readFile,writeFile,unlink,access,rename} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runProcess} from '../../dist/process.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const input=process.argv[2];assert.ok(input,'Pass package installation evidence.json');const prior=JSON.parse(await readFile(input,'utf8')),root=path.dirname(prior.first.directory);
const cli=async(args,success=true)=>{const r=await runProcess(process.execPath,['dist/cli.js',...args],{timeoutMs:60000,maxOutputBytes:2*1024*1024});if(success){assert.equal(r.exitCode,0,r.stderr);return JSON.parse(r.stdout);}assert.notEqual(r.exitCode,0);return r.stderr;};
const status=await cli(['--package-status',prior.first.installationId,'--package-root',root]);assert.equal(status.unchanged,true);
const args=['--package-remove',prior.first.installationId,'--package-root',root,'--expected-sha256',status.receiptSha256];
const client=new Client({name:'package-removal-live-proof',version:'1.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[prior.first.entry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(input),AVID_MCP_CAPABILITIES:'inspect'}}));
let liveError;
try{assert.ok(!(await client.callTool({name:'avid_ping',arguments:{}})).isError);liveError=await cli(args,false);assert.match(liveError,/Node process references/);await access(prior.first.entry);}finally{await client.close();}
const note=path.join(prior.first.directory,'user-added.txt');await writeFile(note,'must preserve',{flag:'wx'});const changedError=await cli(args,false);assert.match(changedError,/files changed/);assert.equal(await readFile(note,'utf8'),'must preserve');await unlink(note);
const recoveryName=prior.first.installationId+".removing-"+randomUUID();assert.equal(path.dirname(prior.first.directory),root);
const quarantine=path.join(root,recoveryName);await rename(prior.first.directory,quarantine);
const recoveryArgs=["--package-recover",recoveryName,"--package-root",root,"--expected-sha256",status.receiptSha256];
const relativeEntry=path.relative(prior.first.directory,prior.first.entry);assert.ok(relativeEntry&&!relativeEntry.startsWith('..')&&!path.isAbsolute(relativeEntry));
const quarantinedEntry=path.join(quarantine,relativeEntry),quarantineClient=new Client({name:'package-quarantine-live-proof',version:'1.0'});
await quarantineClient.connect(new StdioClientTransport({command:process.execPath,args:[quarantinedEntry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(input),AVID_MCP_CAPABILITIES:'inspect'}}));
let recoveryLiveError;
try{
 assert.ok(!(await quarantineClient.callTool({name:'avid_ping',arguments:{}})).isError);
 recoveryLiveError=await cli(recoveryArgs,false);assert.match(recoveryLiveError,/Node process references/);
 assert.equal(await sha256File(quarantinedEntry),prior.first.entrySha256);
 await assert.rejects(access(prior.first.directory));
}finally{await quarantineClient.close();}
const recovery=await cli(recoveryArgs);assert.equal(recovery.recovered,true);assert.equal(recovery.unchanged,true);
const recoveredClient=new Client({name:'package-recovered-live-proof',version:'1.0'});
await recoveredClient.connect(new StdioClientTransport({command:process.execPath,args:[prior.first.entry],stderr:'pipe',env:{...getDefaultEnvironment(),AVID_MCP_ALLOWED_ROOTS:path.dirname(input),AVID_MCP_CAPABILITIES:'inspect'}}));
try{assert.ok(!(await recoveredClient.callTool({name:'avid_ping',arguments:{}})).isError);}finally{await recoveredClient.close();}
const secondStatus=await cli(['--package-status',prior.second.installationId,'--package-root',root]);assert.equal(secondStatus.unchanged,true);
const removedFirst=await cli(args),removedSecond=await cli(['--package-remove',prior.second.installationId,'--package-root',root,'--expected-sha256',secondStatus.receiptSha256]);
await assert.rejects(access(prior.first.directory));await assert.rejects(access(prior.second.directory));
const archive=path.join(path.dirname(input),'avid-media-composer-mcp-1.1.0.tgz');assert.equal(await sha256File(archive),prior.first.archiveSha256);
const evidence={recovery,recoveryLiveError,quarantinedLiveServerRefused:true,recoveredServerPingPassed:true,liveServerRefused:true,changedFilesRefused:true,removedFirst,removedSecond,externalArchiveUnchanged:true,scope:'Windows real running/stopped MCP, live quarantined-server recovery refusal and added-file refusal; installations deliberately removed after configuration entry removal. No cross-platform or arbitrary external client discovery claim.'};await writeFile(path.join(path.dirname(input),'removal-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
