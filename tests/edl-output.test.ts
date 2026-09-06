import {mkdtemp,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {describe,it,expect} from 'vitest';
import {inventoryEdlDirectory,verifyNativeEdlOutput} from '../src/native/edl-output.js';
const event={reel:'R',track:'V',sourceIn:'00:00:00:00',sourceOut:'00:00:01:00',recordIn:'01:00:00:00',recordOut:'01:00:01:00'};
const contract={frameRate:30 as const,events:[event]};
const contents='FCM: NON-DROP FRAME\n001 R V C 00:00:00:00 00:00:01:00 01:00:00:00 01:00:01:00';
describe('native EDL output validation',()=>{
 it('captures prior names under authorized scope and refuses incomplete scans',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'edl-inventory-'));
 const first=path.join(root,'prior.edl');await writeFile(first,contents);
 const snapshot=await inventoryEdlDirectory(root,[root],1);expect(snapshot.existingPaths).toHaveLength(1);
 await expect(verifyNativeEdlOutput(snapshot.directory,[{path:first}],snapshot.existingPaths,contract)).rejects.toThrow('existed');
 await writeFile(path.join(root,'second.edl'),contents);
 await expect(inventoryEdlDirectory(root,[root],1)).rejects.toThrow('limit');
 await expect(inventoryEdlDirectory(root,[])).rejects.toThrow();
 await expect(inventoryEdlDirectory(root,[root],0)).rejects.toThrow();
 });
 it('uses a returned suffixed file and rejects preexisting output and dialogs',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'native-edl-output-')),output=path.join(root,'sequence.001.edl');await writeFile(output,contents);
 expect(await verifyNativeEdlOutput(root,[{path:output}],[],contract)).toMatchObject({cutContractVerified:true,eventCount:1});
 await expect(verifyNativeEdlOutput(root,[{path:output}],[output],contract)).rejects.toThrow('existed');
 await expect(verifyNativeEdlOutput(root,[{path:output,dialog_contents:['Confirm']}],[],contract)).rejects.toThrow('dialog');
 });
 it('rejects ambiguous, relative and out-of-directory responses',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'native-edl-scope-')),other=await mkdtemp(path.join(os.tmpdir(),'native-edl-other-')),output=path.join(other,'sequence.edl');await writeFile(output,contents);
 for(const result of [[],[{path:'sequence.edl'}],[{path:output}],[{path:output},{path:output}],[{path:output,unknown:true}]])await expect(verifyNativeEdlOutput(root,result,[],contract)).rejects.toThrow();
 });
});
