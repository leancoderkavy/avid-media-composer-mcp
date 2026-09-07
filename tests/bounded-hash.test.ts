import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {hashBoundedFile} from '../src/security/bounded-read.js';
vi.mock('node:fs/promises',async(importOriginal)=>{const actual=await importOriginal<typeof fs>();return {...actual,open:vi.fn(actual.open)};});

it('hashes multiple chunks and refuses oversized inputs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'avid-hash-')),file=path.join(root,'data'),bytes=Buffer.alloc(150000,27);await fs.writeFile(file,bytes);
 expect(await hashBoundedFile(file,bytes.length)).toEqual({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 await expect(hashBoundedFile(file,bytes.length-1)).rejects.toThrow('hash limit');
 await expect(hashBoundedFile(file,0)).rejects.toThrow('Invalid hash limit');
});

it('refuses a same-length rewrite during a descriptor read and closes the descriptor',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'avid-hash-race-')),file=path.join(root,'data');await fs.writeFile(file,Buffer.alloc(150000,1));
 const handle=await fs.open(file,'r'),originalRead=handle.read.bind(handle);let mutated=false;
 const read=vi.spyOn(handle,'read').mockImplementation(async(...args:any[])=>{
  const result=await (originalRead as any)(...args);
  if(!mutated){mutated=true;await fs.writeFile(file,Buffer.alloc(150000,2));await fs.utimes(file,new Date(0),new Date(0));}
  return result;
 });
 const opened=vi.spyOn(fs,'open').mockResolvedValue(handle);
 try{await expect(hashBoundedFile(file,150000)).rejects.toThrow('changed while hashing');expect(handle.fd).toBe(-1);}
 finally{opened.mockRestore();read.mockRestore();await handle.close();}
});
