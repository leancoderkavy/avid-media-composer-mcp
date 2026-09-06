// Correlate installed ONNX package versions with exact upstream notice sources.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const inventory=JSON.parse(await readFile(process.argv[2],'utf8'));
const root=path.resolve('.avid-mcp-analysis',`model-runtime-upstream-${randomUUID()}`);await mkdir(root);
const get=async url=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok&&response.body,`${response.status}: ${url}`);
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;assert.ok(bytes<=2*1024*1024,'Response exceeds 2 MiB');chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}
 return Buffer.concat(chunks,bytes);
};
const mappings=[
 {name:'onnxruntime-node',version:'1.24.3',ref:'v1.24.3',commit:'3a728b75062256951b6e19ce718907cf1a1d4cf0',basis:'Release version tag; not independent binary build provenance'},
 {name:'onnxruntime-web',version:'1.26.0-dev.20260416-b7804b056c',ref:'b7804b056c',commit:'b7804b056c30aa35c1748f8e4e239d0e2ff25d6d',basis:'Commit suffix in package version; registry supplies no gitHead, not independent binary build provenance'},
];
const reports=[];
for(const item of mappings){
 const installed=inventory.packages.find(p=>p.name===item.name);assert.equal(installed?.version,item.version,'Inventory version differs from researched mapping');
 const registryUrl=`https://registry.npmjs.org/${item.name}/${item.version}`,registryBytes=await get(registryUrl),registry=JSON.parse(registryBytes);
 assert.equal(registry.name,item.name);assert.equal(registry.version,item.version);assert.equal(registry.dist.integrity,installed.integrity);
 await writeFile(path.join(root,`${item.name}.registry.json`),registryBytes,{flag:'wx'});
 const resolved=JSON.parse(await get(`https://api.github.com/repos/microsoft/onnxruntime/commits/${item.ref}`));assert.equal(resolved.sha,item.commit);
 const notices=[];
 for(const file of ['LICENSE','ThirdPartyNotices.txt']){
  const source=`https://raw.githubusercontent.com/microsoft/onnxruntime/${item.commit}/${file}`,bytes=await get(source),sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(root,`${item.name}-${file}`),bytes,{flag:'wx'});notices.push({file,source,bytes:bytes.length,sha256});
 }
 reports.push({...item,registryUrl,registryIntegrityMatchesLock:true,registryGitHead:registry.gitHead??null,notices});
}
await writeFile(path.join(root,'evidence.json'),JSON.stringify({checkedAt:new Date().toISOString(),runtimeTreeSha256:inventory.treeSha256,reports,limitations:['Notice sources correlated to versions; no assertion that every listed component is in a particular binary','No package archive download, binary source reproduction or legal compatibility determination','Guid repository returned 404 in the accompanying investigation; its original notice remains unresolved','No installed runtime or model cache changed']},null,2),{flag:'wx'});
console.log(JSON.stringify({root,reports}));
