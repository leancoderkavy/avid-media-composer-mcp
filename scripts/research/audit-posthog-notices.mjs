// Retain pinned upstream notice evidence without modifying installed dependencies.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const revision='6872a1c5e4df0917dc0a72cca4a597d9b4d72803';
const root=path.resolve('.avid-mcp-analysis',`posthog-notices-${randomUUID()}`);
await mkdir(root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifacts=[];
const expectedArtifacts=[
  ['LICENSE','a4a2a1ca3b22fe608ea29144452418e4a91f11ca44666a8a91cb72ec0a70f6ee'],
  ['packages/core/package.json','b8affcfc5f7ebfa83837143783bda26066ccaa3906d344d3ac830a26edbd0349'],
  ['packages/core/src/vendor/uuidv7.ts','6397ce81aeb83a515c2e413b9a0d8d7ccb05da030ca49cf2942f554559dfe258'],
];
for(const [file,expectedSha256] of expectedArtifacts){
  const url=`https://raw.githubusercontent.com/PostHog/posthog-js/${revision}/${file}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`${response.status}: ${url}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length<100000);
  if(hash(bytes)!==expectedSha256)throw new Error(`Upstream evidence checksum mismatch: ${file}`);
  const output=path.join(root,`${file.replaceAll('/','_')}.txt`);
  await writeFile(output,bytes,{flag:'wx'});
  artifacts.push({url,output,sha256:hash(bytes)});
}
const installed=JSON.parse(await readFile('node_modules/@posthog/core/package.json'));
const upstream=JSON.parse(await readFile(artifacts[1].output));
assert.equal(installed.version,'1.48.1');assert.equal(upstream.version,installed.version);
assert.equal(upstream.license,installed.license);
const localVendor=await readFile('node_modules/@posthog/core/src/vendor/uuidv7.ts');
assert.equal(hash(localVendor),artifacts[2].sha256,'Vendored source differs from tagged upstream');
const license=await readFile(artifacts[0].output,'utf8');
assert.match(license,/Apache License/);assert.match(license,/MIT License/);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({revision,package:installed.name,version:installed.version,declaredLicense:installed.license,vendorSourceMatches:true,artifacts,limitations:['Root upstream notice contains multiple licenses; package metadata alone does not identify every component notice','No dependency bytes or license declarations were changed','Not a complete distribution notice review']},null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),vendorSourceMatches:true}));
