import {mkdtemp,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {describe,it,expect} from 'vitest';import {verifyEdlCuts} from '../src/native/edl-verifier.js';
const event={reel:'SONOMA',track:'V',sourceIn:'00:01:35:00',sourceOut:'00:01:37:00',recordIn:'01:00:00:00',recordOut:'01:00:02:00'};
const contract={frameRate:30 as const,events:[event]};
const line=(e=event)=>`001 ${e.reel} ${e.track} C ${e.sourceIn} ${e.sourceOut} ${e.recordIn} ${e.recordOut}`;
async function file(text:string){const root=await mkdtemp(path.join(os.tmpdir(),'edl-contract-'));const target=path.join(root,'test.edl');await writeFile(target,text);return target;}
const header='TITLE: Test\nFCM: NON-DROP FRAME\n';
describe('EDL cut contract',()=>{
 it('verifies exact frame ranges and preserves artifact identity',async()=>{const result=await verifyEdlCuts(await file(header+line()),contract);expect(result).toMatchObject({cutContractVerified:true,eventCount:1,events:[{sourceStart:2850,sourceEnd:2910,recordStart:108000,recordEnd:108060}]});expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);});
 it('rejects changed reel, track, timing and event counts',async()=>{for(const changed of [{...event,reel:'OTHER'},{...event,track:'A'},{...event,sourceIn:'00:01:35:01'}])await expect(verifyEdlCuts(await file(header+line(changed)),contract)).rejects.toThrow('differs');await expect(verifyEdlCuts(await file(header+line()+'\n'+line()),contract)).rejects.toThrow('count');});
 it('rejects malformed clocks, duration mismatch and midnight rollover even when expected',async()=>{for(const changed of [{...event,sourceIn:'00:61:00:00'},{...event,sourceOut:'00:01:37:30'},{...event,sourceOut:'00:01:38:00'},{...event,sourceIn:'23:59:59:00',sourceOut:'00:00:01:00'}])await expect(verifyEdlCuts(await file(header+line(changed)),{frameRate:30,events:[changed]})).rejects.toThrow();});
 it('rejects unsupported modes, effects, transitions and unknown content',async()=>{for(const text of [header.replace('NON-DROP','DROP')+line(),line(),header+line().replace(' V C ',' V D 030 '),header+line()+'\nM2 SONOMA 050.0 00:01:35:00',header+line()+'\nUNKNOWN',header+line()+' UNEXPECTED'])await expect(verifyEdlCuts(await file(text),contract)).rejects.toThrow();});
});
