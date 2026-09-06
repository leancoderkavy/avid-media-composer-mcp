// Read-only verification of the retained experiment; never replays its write.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadNativeSchema} from '../../dist/native/client.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';

assert.equal(process.argv.length,2,'Fixed retained record-viewer experiment');
const root=path.resolve('.avid-mcp-analysis/native-record-viewer-a7c7f56c-41b5-4be2-9e9b-007e945b71c5');
const file=path.join(root,'observation.json'),hash=await sha256File(file),observed=JSON.parse(await readFile(file,'utf8'));
const mobId='060a2b340101010501010f1013-000000-5faf2bdb12898806-4b74d8bbc16d-18d9';
assert.deepEqual(observed.before.viewers,[]);
assert.deepEqual(observed.applied.action,{action:'show_clip',bin:'MCP_Load_7006b4d8.avb',mobId,viewer:'Record'});
assert.equal(observed.applied.applicationCompleted,true);assert.equal(observed.applied.viewerVerified,false);
assert.deepEqual(observed.after.viewers,[{mob_id:mobId,view_type:'Source',current_frame:0,current_timecode:'01:00:00:00'}]);
const schema=await loadNativeSchema('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe');
const type=schema.lookupType('mcapi.LoadMobsIntoViewerRequest'),body={mob_ids:[mobId],view_type:'Record'};
const roundTrip=type.toObject(type.decode(type.encode(type.fromObject({body})).finish()),{enums:String});
assert.deepEqual(roundTrip,{body});
const methods=Object.keys(schema.lookupService('mcapi.MCAPI').methods).filter(name=>/seek|position|frame/i.test(name));
assert.deepEqual(methods,[]);
assert.equal(await sha256File(file),hash);
const result={observationSha256:hash,negativeResultVerified:true,recordEnumRoundTripVerified:true,dedicatedSeekMethodDeclared:false,scope:'Retained experimental request and observed Source-only response plus current qualified schema encoding. No live write replay, packet capture, proof of internal cause or native Record support.'};
await writeFile(path.join(root,`verification-${randomUUID()}.json`),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(result));
