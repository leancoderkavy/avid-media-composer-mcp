import {mkdtemp,writeFile,mkdir,opendir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,it,expect,vi} from "vitest";
import {directoryPage} from "../src/library/directory-page.js";
vi.mock('node:fs/promises',async importOriginal=>{const actual=await importOriginal<typeof import('node:fs/promises')>();return {...actual,opendir:vi.fn(actual.opendir)};});

describe('bounded directory pages',()=>{
  it('closes enumeration on cancellation and never returns a partial lexical page',async()=>{
    const controller=new AbortController();let closed=false;
    vi.mocked(opendir).mockResolvedValueOnce({async *[Symbol.asyncIterator](){try{yield {name:'z'};controller.abort();yield {name:'a'};}finally{closed=true;}}} as any);
    await expect(directoryPage('synthetic',1,()=>true,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(closed).toBe(true);
    const calls=vi.mocked(opendir).mock.calls.length;
    await expect(directoryPage('synthetic',1,()=>true,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(vi.mocked(opendir).mock.calls.length).toBe(calls);
  });
  it('selects earliest eligible entries even when enumeration is reversed or shuffled',async()=>{
    const sorted=Array.from({length:1000},(_,i)=>String(i).padStart(4,'0'));
    for(const names of [[...sorted].reverse(),sorted.map((_,i)=>sorted[(i*337)%1000]!)]){
      let closed=false;
      vi.mocked(opendir).mockResolvedValueOnce({async *[Symbol.asyncIterator](){try{for(const name of names)yield {name};}finally{closed=true;}}} as any);
      const page=await directoryPage('synthetic',23,entry=>entry.name>'0100');
      expect(page.map(entry=>entry.name)).toEqual(sorted.slice(101,124));expect(closed).toBe(true);
    }
  });
  it('matches complete lexical ordering across small pages, filters and mixed entry types',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'avid-directory-page-'));
    const names=['z.mp4','B.mp4','a.mp4','a','東京.mp4','é.mp4',...Array.from({length:151},(_,i)=>`clip-${String(150-i).padStart(3,'0')}.mp4`)];
    for(const name of names){if(name==='a')await mkdir(path.join(root,name));else await writeFile(path.join(root,name),'fixture');}
    const expected=[...names].sort();let after:string|undefined;const actual:string[]=[];
    for(;;){const entries=await directoryPage(root,7,entry=>after===undefined||entry.name>after);if(!entries.length)break;expect(entries.length).toBeLessThanOrEqual(7);actual.push(...entries.map(entry=>entry.name));after=entries.at(-1)!.name;}
    expect(actual).toEqual(expected);
    expect((await directoryPage(root,3,entry=>entry.isDirectory())).map(entry=>entry.name)).toEqual(['a']);
    expect((await directoryPage(root,1,()=>true)).map(entry=>entry.name)).toEqual(expected.slice(0,1));
  });
  it('validates bounds before opening a directory and propagates iteration failures',async()=>{
    await expect(directoryPage('missing',0,()=>true)).rejects.toThrow('limit');await expect(directoryPage('missing',10002,()=>true)).rejects.toThrow('limit');
    const root=await mkdtemp(path.join(os.tmpdir(),'avid-directory-error-'));await writeFile(path.join(root,'file'),'fixture');
    await expect(directoryPage(root,1,()=>{throw new Error('filter failed');})).rejects.toThrow('filter failed');
    expect(await directoryPage(root,1,()=>false)).toEqual([]);
  });
});
