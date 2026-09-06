import {mkdtemp,mkdir,writeFile,readFile,rename,realpath,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {describe,it,expect,vi,afterEach} from "vitest";
import {WatchFolders} from "../src/library/watch-folders.js";
import {MediaLibrary} from "../src/library/media-library.js";
import {loadConfig} from "../src/config.js";

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-watch-")),folder=path.join(root,"media");await mkdir(folder);
  const file=path.join(folder,"test.mp4");await writeFile(file,"fixture");
  const config=loadConfig({AVID_MCP_ALLOWED_ROOTS:folder,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,project-write,export"});
  return {root,folder,file,config};
}
afterEach(()=>vi.restoreAllMocks());
describe("watch checkpointing",()=>{
  it('retains known file failures while scanning a different batch',async()=>{
    const {folder,config}=await fixture(),broken=path.join(folder,'a.mp4');await writeFile(broken,'invalid');
    vi.spyOn(MediaLibrary.prototype,'index').mockImplementation(async files=>{if(files[0]===broken)throw new Error('invalid media');return {entries:[{id:'a'.repeat(64),file:files[0]!,duration:'10',streams:[]}],sourceModified:false};});
    const service=new WatchFolders(config),watch=await service.configure({folder,maxFiles:1});
    await service.scan(watch.id);await service.scan(watch.id);const failed=await service.scan(watch.id);
    expect(failed.errors).toEqual([{file:broken,error:'invalid media'}]);
    const healthy=await new WatchFolders(config).scan(watch.id);expect(healthy.indexed).toHaveLength(1);expect(healthy.errors).toEqual(failed.errors);
  });
  it('advances bounded batches across reconnects, nested names and deletion without reindexing',async()=>{
    const {root,folder,config}=await fixture();await mkdir(path.join(folder,'a'));await writeFile(path.join(folder,'a','inner.mp4'),'inner');await writeFile(path.join(folder,'a.mp4'),'sibling');
    const index=vi.spyOn(MediaLibrary.prototype,'index').mockImplementation(async files=>({entries:[{id:createHash('sha256').update(files[0]!).digest('hex'),file:files[0]!,duration:'10',streams:[]}],sourceModified:false}));
    const watch=await new WatchFolders(config).configure({folder,maxFiles:1}),manifest=path.join(root,'avid-mcp-library','watches',watch.id+'.json');
    for(let i=0;i<8;i++)expect((await new WatchFolders(config).scan(watch.id)).files).toBeLessThanOrEqual(1);
    expect(index).toHaveBeenCalledTimes(3);expect(new Set(index.mock.calls.map(([files])=>files[0])).size).toBe(3);
    let record=JSON.parse(await readFile(manifest,'utf8'));expect(Object.keys(record.observations)).toHaveLength(3);expect(Object.values(record.observations).every((value:any)=>value.stable)).toBe(true);
    await unlink(path.join(folder,'a.mp4'));
    for(let i=0;i<5;i++)await new WatchFolders(config).scan(watch.id);
    record=JSON.parse(await readFile(manifest,'utf8'));expect(Object.keys(record.observations)).toHaveLength(2);expect(index).toHaveBeenCalledTimes(3);
    expect(await readFile(path.join(folder,'a','inner.mp4'),'utf8')).toBe('inner');
  });
  it('continues beyond the directory budget instead of restarting its first thousand directories',async()=>{
    const {folder,config}=await fixture();
    await Promise.all(Array.from({length:1002},(_,i)=>mkdir(path.join(folder,`d${String(i).padStart(4,'0')}`))));
    const service=new WatchFolders(config),watch=await service.configure({folder,maxFiles:1});
    expect(await service.scan(watch.id)).toMatchObject({truncated:true,files:0});
    expect(await new WatchFolders(config).scan(watch.id)).toMatchObject({truncated:false,files:1,pending:1});
  },20000);
  it('reports file indexing errors while preserving healthy progress and clears after retry',async()=>{
    const {folder,config}=await fixture(),broken=path.join(folder,'broken.mp4');await writeFile(broken,'invalid');
    let repaired=false;const index=vi.spyOn(MediaLibrary.prototype,'index').mockImplementation(async files=>{
      if(files[0]===broken&&!repaired)throw new Error('Invalid media');
      return {entries:[{id:'a'.repeat(64),file:files[0]!,duration:'10',streams:[]}],sourceModified:false};
    });
    const service=new WatchFolders(config),watch=await service.configure({folder});
    let tick!:()=>void;vi.spyOn(globalThis,'setInterval').mockImplementation(((callback:()=>void)=>{tick=callback;return {unref(){}};}) as any);vi.spyOn(globalThis,'clearInterval').mockImplementation(()=>{});
    const poll=async()=>{tick();await vi.waitFor(()=>expect(service.status().scanInProgress).toBe(false));};
    service.start(10);
    try{
      await poll();await poll();expect(index).toHaveBeenCalledTimes(2);
      expect(service.status()).toMatchObject({lastError:expect.any(String),watchErrors:[{id:watch.id,error:'1 media file(s) failed indexing: Invalid media'}]});
      repaired=true;await poll();expect(index).toHaveBeenCalledTimes(3);
      expect(service.status()).toMatchObject({lastError:null,watchErrors:[]});
    }finally{service.stop();}
  });
  it('reports unavailable records, bounds errors and prevents overlapping polling cycles',async()=>{
    const {config}=await fixture(),service=new WatchFolders(config);
    const list=vi.spyOn(service,'list').mockResolvedValue([{id:'missing',unavailable:true,error:'x'.repeat(2000)},{id:'healthy',options:{folder:'fixture',depth:2,maxFiles:100,enabled:true},files:0,scannedAt:undefined}]);
    let finish!:()=>void;const scan=vi.spyOn(service,'scan').mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({id:'healthy',skipped:'disabled'});}));
    let tick!:()=>void;vi.spyOn(globalThis,'setInterval').mockImplementation(((callback:()=>void)=>{tick=callback;return {unref(){}};}) as any);vi.spyOn(globalThis,'clearInterval').mockImplementation(()=>{});
    service.start(10);
    try{
      tick();await vi.waitFor(()=>expect(scan).toHaveBeenCalledTimes(1));tick();expect(list).toHaveBeenCalledTimes(1);
      finish();await vi.waitFor(()=>expect(service.status().scanInProgress).toBe(false));
      expect(service.status().watchErrors).toEqual([{id:'missing',error:'x'.repeat(1024)}]);
      service.status().watchErrors[0]!.error='mutated';expect(service.status().watchErrors[0]!.error).toHaveLength(1024);
    }finally{service.stop();}
  });
  it('continues past a locked watch, preserves its lock, and clears diagnostics after recovery',async()=>{
    const {root,folder,config}=await fixture(),service=new WatchFolders(config);
    await service.configure({folder});await service.configure({folder});
    const records=await service.list(),first=records[0]!,second=records[1]!;
    const lock=path.join(root,'avid-mcp-library','watches',first.id+'.lock');await writeFile(lock,'owned test lock',{flag:'wx'});
    const index=vi.spyOn(MediaLibrary.prototype,'index').mockImplementation(async files=>({entries:[{id:'a'.repeat(64),file:files[0]!,duration:'10',streams:[]}],sourceModified:false}));
    let tick!:()=>void;vi.spyOn(globalThis,'setInterval').mockImplementation(((callback:()=>void)=>{tick=callback;return {unref(){}};}) as any);
    vi.spyOn(globalThis,'clearInterval').mockImplementation(()=>{});
    service.start(10);
    const poll=async()=>{tick();await vi.waitFor(()=>expect(service.status().scanInProgress).toBe(false));};
    try{
      await poll();await poll();expect(index).toHaveBeenCalledTimes(1);
      expect(service.status()).toMatchObject({watchErrors:[{id:first.id,error:expect.stringContaining('EEXIST')}],lastError:expect.any(String)});
      expect(await readFile(lock,'utf8')).toBe('owned test lock');
      const healthy=JSON.parse(await readFile(path.join(root,'avid-mcp-library','watches',second.id+'.json'),'utf8'));
      expect(Object.values(healthy.observations)).toEqual([expect.objectContaining({stable:true,mediaId:'a'.repeat(64)})]);
      await unlink(lock);await poll();await poll();expect(index).toHaveBeenCalledTimes(2);
      expect(service.status()).toMatchObject({lastError:null,watchErrors:[]});
    }finally{service.stop();}
  });
  it('repoints an unavailable watch within its original scope and resets stability',async()=>{
    const {root,folder,config}=await fixture(),scoped={...config,allowedRoots:[root]},service=new WatchFolders(scoped),watch=await service.configure({folder});
    await service.scan(watch.id);const moved=path.join(root,'relocated');await rename(folder,moved);
    await expect(service.scan(watch.id)).rejects.toThrow();expect(await service.list()).toEqual([expect.objectContaining({id:watch.id,unavailable:true})]);
    const updated=await new WatchFolders(scoped).configure({folder:moved},watch.id);expect(updated.id).toBe(watch.id);expect(updated.observations).toEqual({});
    expect(await service.scan(watch.id)).toMatchObject({pending:1,indexed:[]});expect(await readFile(path.join(moved,'test.mp4'),'utf8')).toBe('fixture');
  });
  it('removes an unavailable scoped watch without removing media',async()=>{
    const {root,folder,config}=await fixture(),service=new WatchFolders(config),watch=await service.configure({folder}),moved=path.join(root,'relocated');await rename(folder,moved);
    expect(await new WatchFolders(config).remove(watch.id)).toMatchObject({removed:true,mediaDeleted:false});expect(await readFile(path.join(moved,'test.mp4'),'utf8')).toBe('fixture');
  });
  it('does not bypass changed scopes or legacy unavailable-watch checks',async()=>{
    const {root,folder,config}=await fixture(),service=new WatchFolders(config),watch=await service.configure({folder}),moved=path.join(root,'relocated');await rename(folder,moved);
    await expect(new WatchFolders({...config,allowedRoots:[root]}).configure({folder:moved},watch.id)).rejects.toThrow();
    await expect(new WatchFolders({...config,allowedRoots:[root]}).remove(watch.id)).rejects.toThrow();
    const file=path.join(root,'avid-mcp-library','watches',watch.id+'.json'),record=JSON.parse(await readFile(file,'utf8'));delete record.scope;await writeFile(file,JSON.stringify(record));
    await expect(service.remove(watch.id)).rejects.toThrow();
  });
  it("waits for stability, avoids duplicate indexing after restart, and rediscovers changes",async()=>{
    const {config,folder,file}=await fixture();
    const index=vi.spyOn(MediaLibrary.prototype,"index").mockImplementation(async files=>({entries:[{id:"a".repeat(64),file:files[0]!,duration:"10",streams:[]}],sourceModified:false}));
    const service=new WatchFolders(config),watch=await service.configure({folder});
    expect(await service.scan(watch.id)).toMatchObject({pending:1,indexed:[]});
    expect((await service.scan(watch.id)).indexed).toHaveLength(1);
    expect((await new WatchFolders(config).scan(watch.id)).indexed).toHaveLength(0);
    await writeFile(file,"changed size");
    expect((await service.scan(watch.id)).indexed).toHaveLength(0);
    expect((await service.scan(watch.id)).indexed).toHaveLength(1);
    expect(index).toHaveBeenCalledTimes(2);
    await service.remove(watch.id);expect(await readFile(file,"utf8")).toBe("changed size");expect(await service.list()).toEqual([]);
  });
  it("does not run two writers or index outside the current allowlist",async()=>{
    const {config,folder}=await fixture(),service=new WatchFolders(config),watch=await service.configure({folder});
    await service.scan(watch.id);
    let finish!:(value:any)=>void,started!:()=>void;
    const indexing=new Promise<void>(resolve=>{started=resolve;});
    vi.spyOn(MediaLibrary.prototype,"index").mockImplementation(()=>new Promise(resolve=>{finish=resolve;started();}));
    const first=service.scan(watch.id);
    await indexing;
    await expect(new WatchFolders(config).scan(watch.id)).rejects.toThrow();
    finish({entries:[{id:"a".repeat(64)}]});await first;
    await expect(new WatchFolders({...config,allowedRoots:[]}).scan(watch.id)).rejects.toThrow("outside");
  });
  it("requires write authority to configure or start and reports bounded lifecycle",async()=>{
    const {config,folder}=await fixture();const readOnly=new WatchFolders({...config,capabilities:new Set(["inspect"])});
    await expect(readOnly.configure({folder})).rejects.toThrow("project-write");expect(()=>readOnly.start()).toThrow("project-write");
    const service=new WatchFolders(config);expect(service.start(10).running).toBe(true);expect(service.stop().running).toBe(false);
  });
});
describe("shared cache source aliases",()=>{
  it("reconnects moved media while retaining transcripts and current-root boundaries",async()=>{
    const {root,folder,file,config}=await fixture(),id=createHash("sha256").update("fixture").digest("hex");
    const library=new MediaLibrary(config),directory=await library.directory();
    await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,file,bytes:7,metadata:{format:{duration:"10"}},transcript:[]}));
    const transcript=await library.importTranscript(id,[{start:0,end:1,text:"retained"}]);
    const moved=path.join(folder,"moved.mp4");await rename(file,moved);
    const aliases=path.join(directory,`${id}.sources`);await mkdir(aliases);
    await writeFile(path.join(aliases,`${"b".repeat(64)}.json`),JSON.stringify({id,file:moved}));
    expect((await library.metadata([id]))[0]?.file).toBe(await realpath(moved));
    expect((await library.transcriptRange(id,0,2,-1,50,transcript.revision)).segments[0]?.text).toBe("retained");
    await expect(new MediaLibrary({...config,allowedRoots:[path.join(root,"unrelated")]}).metadata([id])).rejects.toThrow("outside");
    const artifact=await library.artifact(id,"copy");expect(await readFile(artifact.output,"utf8")).toBe("fixture");
  });
});
