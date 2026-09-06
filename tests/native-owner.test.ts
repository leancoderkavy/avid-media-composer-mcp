import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runProcess} from '../src/process.js';
import {verifyNativeOwner} from '../src/native/client.js';
vi.mock('../src/process.js',()=>({runProcess:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
describe.skipIf(process.platform!=='win32')('native owner provider validation',()=>{
 it('resolves the owner afresh on every call',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'native-owner-')),binary=path.join(root,'editor.exe');await writeFile(binary,'fixture');
  vi.mocked(runProcess).mockResolvedValue({exitCode:0,stdout:JSON.stringify({path:binary,pid:42,started:'epoch'}),stderr:''} as any);
  expect(await verifyNativeOwner(binary)).toBe('42:epoch');expect(await verifyNativeOwner(binary)).toBe('42:epoch');
  expect(runProcess).toHaveBeenCalledTimes(2);
 });
 it.each(['missing','ambiguous','foreign','failed'])('rejects %s owner results',async variant=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'native-owner-')),binary=path.join(root,'editor.exe'),other=path.join(root,'other.exe');
  await writeFile(binary,'fixture');await writeFile(other,'other');
  const owner={path:variant==='foreign'?other:binary,pid:42,started:'epoch'};
  vi.mocked(runProcess).mockResolvedValue({exitCode:variant==='failed'?1:0,stdout:JSON.stringify(variant==='missing'?[]:variant==='ambiguous'?[owner,owner]:owner),stderr:''} as any);
  await expect(verifyNativeOwner(binary)).rejects.toThrow();
 });
});
