import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {clientConfiguration,resolveSetupEntry} from '../../dist/setup.js';

const binary=process.argv[2];
if(process.platform!=='win32')throw Error('This qualification harness currently covers Windows only');
if(!binary||!path.isAbsolute(binary)||![3,5].includes(process.argv.length))throw Error('Provide the absolute installed Claude CLI executable, optionally followed by an absolute server entry and its SHA-256');
const serverEntry=process.argv.length===5?await resolveSetupEntry(process.argv[3],process.argv[4]):undefined;
const root=path.resolve('.avid-mcp-analysis',`claude-cli-${randomUUID()}`);
const project=path.join(root,'project'),configuration=path.join(root,'configuration');
await mkdir(project,{recursive:true});await mkdir(configuration);
await writeFile(path.join(project,'fixture.txt'),'Synthetic MCP client qualification fixture.\n');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|HOMEDRIVE|HOMEPATH)$/i.test(key)));
env.CLAUDE_CONFIG_DIR=configuration;
const hash=async file=>{try{return createHash('sha256').update(await readFile(file)).digest('hex');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const protectedFiles=[path.join(process.env.USERPROFILE,'.claude.json'),path.join(process.env.APPDATA,'Claude','claude_desktop_config.json')];
const before=await Promise.all(protectedFiles.map(hash));
const entry=clientConfiguration('generic',[project],undefined,undefined,serverEntry).mcpServers['avid-media-composer'];
const entryHash=await hash(entry.args[0]),binaryHash=await hash(binary);
const results=[];
function run(label,args){
  const result=spawnSync(binary,args,{cwd:project,env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});
  if(result.error)throw result.error;
  results.push({label,args,status:result.status,stdout:result.stdout,stderr:result.stderr});
  return result;
}
const requireSuccess=result=>{if(result.status!==0)throw Error(`Claude CLI failed: ${result.stderr}`);return result;};
try{
  const version=requireSuccess(run('version',['--version'])).stdout.trim();
  requireSuccess(run('install',['mcp','add-json','--scope','local','avid-media-composer',JSON.stringify(entry)]));
  // The CLI must actually keep its local-scope state in the isolated directory.
  const isolated=JSON.parse(await readFile(path.join(configuration,'.claude.json'),'utf8'));
  if(!JSON.stringify(isolated).includes('avid-media-composer'))throw Error('Isolated client configuration was not created');
  const get=requireSuccess(run('health',['mcp','get','avid-media-composer']));
  if(!/Status:\s*[√✓]\s+Connected\s*$/m.test(get.stdout))throw Error('Claude did not confirm a live MCP connection');
  const list=requireSuccess(run('list',['mcp','list']));
  if(!/^avid-media-composer:.* - [√✓]\s+Connected\s*$/m.test(list.stdout))throw Error('Claude list did not confirm the configured connection');
  requireSuccess(run('remove',['mcp','remove','--scope','local','avid-media-composer']));
  const removed=run('absent',['mcp','get','avid-media-composer']);
  if(removed.status!==1||!removed.stderr.includes('No MCP server named "avid-media-composer"'))throw Error('Removed connector absence was not confirmed');
  const brokenEntry={...entry,args:[path.join(project,'missing-server.js')]};
  requireSuccess(run('install-broken',['mcp','add-json','--scope','local','avid-media-composer',JSON.stringify(brokenEntry)]));
  const broken=run('broken-health',['mcp','get','avid-media-composer']);
  if(!/Failed to connect/i.test(broken.stdout+broken.stderr)||/Status:\s*[√✓]\s+Connected/m.test(broken.stdout))throw Error('Broken startup was not reported as a failed connection');
  requireSuccess(run('remove-broken',['mcp','remove','--scope','local','avid-media-composer']));
  requireSuccess(run('reinstall',['mcp','add-json','--scope','local','avid-media-composer',JSON.stringify(entry)]));
  const recovered=requireSuccess(run('recovered-health',['mcp','get','avid-media-composer']));
  if(!/Status:\s*[√✓]\s+Connected\s*$/m.test(recovered.stdout))throw Error('Corrected configuration did not reconnect');
  requireSuccess(run('remove-recovered',['mcp','remove','--scope','local','avid-media-composer']));
  const finalAbsent=run('final-absent',['mcp','get','avid-media-composer']);
  if(finalAbsent.status!==1||!finalAbsent.stderr.includes('No MCP server named "avid-media-composer"'))throw Error('Recovered connector removal was not confirmed');
  const after=await Promise.all(protectedFiles.map(hash));
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Existing client configuration changed during qualification');
  if(await hash(entry.args[0])!==entryHash||await hash(binary)!==binaryHash)throw Error('Client or server executable changed during qualification');
  await writeFile(path.join(root,'evidence.json'),JSON.stringify({ok:true,version,binary,binarySha256:binaryHash,serverEntry:entry.args[0],serverEntrySha256:entryHash,configuration,project,protectedConfigurationsUnchanged:true,executablesUnchanged:true,results,limitations:['CLI connection and configuration lifecycle only','No model inference, GUI tool invocation or native Avid action','Existing Node and Claude installation used']},null,2));
  console.log(JSON.stringify({ok:true,root,version}));
}catch(error){
  await writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),results},null,2));
  console.error(root);throw error;
}
