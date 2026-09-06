import {mkdtemp,mkdir,writeFile,readFile,rename,realpath} from "node:fs/promises";
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
