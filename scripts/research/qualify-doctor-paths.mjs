import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const [ffmpeg,ffprobe,python]=process.argv.slice(2);
assert.equal(process.argv.length,5);for(const file of [ffmpeg,ffprobe,python])assert.ok(path.isAbsolute(file));
const root=path.resolve('.avid-mcp-analysis',`doctor-runtime-paths-${randomUUID()}`);await mkdir(root);
const cli=path.resolve('dist/cli.js'),base=['--doctor','--root',root,'--output',root];
const env={...process.env,AVID_MCP_NATIVE_BINARY:'',AVID_MCP_CAPABILITIES:'inspect',AVID_MCP_FFMPEG:'missing-ambient-ffmpeg',AVID_MCP_FFPROBE:'missing-ambient-ffprobe',AVID_MCP_PYTHON:'missing-ambient-python'};
const records=[];
function run(args){const result=spawnSync(process.execPath,[cli,...args],{env,cwd:root,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,windowsHide:true});assert.ifError(result.error);const record={args,status:result.status,stdout:result.stdout,stderr:result.stderr};records.push(record);return record;}
try{
 const explicit=run([...base,'--ffmpeg',ffmpeg,'--ffprobe',ffprobe,'--python',python]);assert.equal(explicit.status,0,explicit.stderr);
 const data=JSON.parse(explicit.stdout);
 for(const [key,value] of Object.entries({ffmpeg,ffprobe,python}))assert.equal(data[key].data.executable,value);
 assert.equal(data.ffmpeg.ok,true);assert.equal(data.ffprobe.ok,true);
 const missing=path.join(root,'missing-ffmpeg.exe');
 const absent=run([...base,'--ffmpeg',missing,'--ffprobe',ffprobe,'--python',python]);assert.equal(absent.status,0,absent.stderr);
 const missingData=JSON.parse(absent.stdout);assert.equal(missingData.ffmpeg.ok,false);assert.equal(missingData.ffmpeg.data.executable,missing);
 const relative=run([...base,'--ffmpeg','relative']);assert.notEqual(relative.status,0);assert.match(relative.stderr,/absolute/);
 const inappropriate=run(['--doctor','--capabilities','inspect']);assert.notEqual(inappropriate.status,0);assert.match(inappropriate.stderr,/capabilities require client configuration/);
 await writeFile(path.join(root,'evidence.json'),JSON.stringify({passed:true,records,pythonReady:data.python.ok,scope:'Actual built CLI explicit executable overrides, missing executable refusal without PATH fallback, relative path and incompatible capability rejection. Existing Windows dependencies; no installation or host-edit qualification.'},null,2),{flag:'wx'});
 console.log(JSON.stringify({root,passed:true,pythonReady:data.python.ok}));
}finally{await writeFile(path.join(root,'observations.json'),JSON.stringify(records,null,2));}
