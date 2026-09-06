import {mkdtemp,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {it,expect,vi} from 'vitest';
import {ProjectSnapshots} from '../src/library/project-snapshots.js';
import {loadConfig} from '../src/config.js';
const mocked=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('../src/process.js',()=>({runProcess:mocked.run}));

it('captures one canonical bin when distinct authorized paths resolve to it',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'avid-capture-alias-')),file=path.join(root,'source.avb');await writeFile(file,'fixture');
 mocked.run.mockImplementation(async(_executable,args)=>({exitCode:0,stderr:'',stdout:JSON.stringify({schema:1,file:args[1],sha256:'a'.repeat(64),complete:true,nodeCount:0,stateOrigin:'synthetic',warnings:[],mobs:[]})}));
 const snapshots=new ProjectSnapshots(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root}));
 const captured=await snapshots.create([file,`${root}${path.sep}.${path.sep}source.avb`]);
 expect(mocked.run).toHaveBeenCalledTimes(1);expect(captured.bins).toHaveLength(1);
 expect((await snapshots.diff(captured.revision,captured.revision)).changes).toEqual([]);
 mocked.run.mockReset();
});

it('stops collecting oversized bin results before inspecting later bins or publishing',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'avid-capture-limit-')),files=[];
 for(let i=0;i<6;i++){const file=path.join(root,`${i}.avb`);await writeFile(file,'synthetic');files.push(file);}
 const largeName='x'.repeat(7*1024*1024);
 mocked.run.mockImplementation(async(_executable,args)=>({exitCode:0,stderr:'',stdout:JSON.stringify({schema:1,file:args[1],sha256:'a'.repeat(64),complete:true,nodeCount:0,stateOrigin:'synthetic',warnings:[],mobs:[{mobId:'fixture',name:largeName,mobType:'CompositionMob',usageCode:0,rate:30,duration:0,sourceBounds:{start:0,end:0},tracks:[]}]})}));
 const snapshots=new ProjectSnapshots(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root}));
 await expect(snapshots.create(files)).rejects.toThrow('while collecting bins');
 expect(mocked.run).toHaveBeenCalledTimes(5);
 expect((await readdir(path.join(root,'avid-mcp-library'))).filter(name=>name.startsWith('snapshot-'))).toEqual([]);
 mocked.run.mockReset();
});
