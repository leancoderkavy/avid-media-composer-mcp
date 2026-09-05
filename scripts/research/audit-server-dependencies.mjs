// Inventory exact installed server dependencies without changing the installation.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const lockBytes=await readFile('package-lock.json'),lock=JSON.parse(lockBytes);
const root=path.resolve('.avid-mcp-analysis',`server-dependency-audit-${randomUUID()}`);
await mkdir(root);
const packages=[];
for(const [location,pin] of Object.entries(lock.packages)){
  if(!location||pin.dev||pin.devOptional)continue;
  const manifest=await readFile(path.join(location,'package.json'));
  const data=JSON.parse(manifest);
  assert.equal(data.version,pin.version,`Installed version differs: ${location}`);
  const notices=[];
  for(const name of await readdir(location)){
    if(!/^(license|licence|copying|notice)(\.|$)/i.test(name))continue;
    const file=path.join(location,name);
    try {const bytes=await readFile(file);notices.push({file,sha256:digest(bytes),bytes:bytes.length});}
    catch(error){if(error.code!=='EISDIR')throw error;}
  }
  packages.push({location,name:data.name,version:data.version,declaredLicense:data.license??null,manifestSha256:digest(manifest),integrity:pin.integrity??null,notices});
}
assert.equal(digest(await readFile('package-lock.json')),digest(lockBytes),'Lock changed during audit');
const report={lockSha256:digest(lockBytes),packages,missingDeclarations:packages.filter(p=>!p.declaredLicense).map(p=>p.location),missingNoticeFiles:packages.filter(p=>!p.notices.length).map(p=>p.location),limitations:['Installed server dependency metadata only; not a legal compatibility conclusion','Optional AI runtimes, model weights, Python, FFmpeg and other platform packages require separate review','License text hashes identify local files; they do not authenticate registry archive contents']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),packages:packages.length,missingDeclarations:report.missingDeclarations,missingNoticeFiles:report.missingNoticeFiles}));
