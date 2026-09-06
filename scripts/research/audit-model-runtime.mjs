// Read-only inventory of the separately installed local inference runtime.
import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {modelRuntimeStatus} from '../../dist/library/model-runtime-install.js';
import {readBoundedFile} from '../../dist/security/bounded-read.js';
import {sha256File} from '../../dist/analysis/file-inventory.js';
const cache=path.resolve(process.argv[2]??'.avid-mcp-analysis/models');
const status=await modelRuntimeStatus(cache);assert.equal(status.managed,true);assert.equal(status.unchanged,true);
const root=path.resolve('.avid-mcp-analysis',`model-runtime-audit-${randomUUID()}`);await mkdir(root);
const lockFile=path.join(status.directory,'package-lock.json'),lockBytes=await readBoundedFile(lockFile,4*1024*1024),lock=JSON.parse(lockBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const packages=[],absentOptional=[];
for(const [location,pin] of Object.entries(lock.packages)){
 if(!location)continue;
 assert.ok(!path.isAbsolute(location)&&location.split(/[\\/]/).every(part=>part&&part!=='.'&&part!=='..'),'Unexpected package location');
 const directory=path.join(status.directory,location);
 let info;try{info=await lstat(directory);}catch(error){if(error.code==='ENOENT'&&pin.optional){absentOptional.push({location,version:pin.version,os:pin.os??null,cpu:pin.cpu??null});continue;}throw error;}
 assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Package directory is not direct');
 const bytes=await readBoundedFile(path.join(directory,'package.json'),1024*1024),manifest=JSON.parse(bytes);
 assert.equal(manifest.version,pin.version,location);
 const notices=[],readmes=[],nativeFiles=[];let visited=0;
 const walk=async(folder,depth)=>{
  assert.ok(depth<=32,'Package directory depth exceeded');
  for(const entry of await readdir(folder,{withFileTypes:true})){
   assert.ok(++visited<=50000,'Package inventory bound exceeded');
   if(entry.name==='node_modules')continue;
   const file=path.join(folder,entry.name),relative=path.relative(directory,file).replaceAll('\\','/');
   assert.ok(!entry.isSymbolicLink(),'Package inventory encountered a link');
   if(entry.isDirectory()){await walk(file,depth+1);continue;}
   if(!entry.isFile())continue;
   if(/^(?:licenses?|licences?|copying|notices?|third[-_]?party[-_]?notices?)(?:[._-]|$)/i.test(entry.name)){
    const content=await readBoundedFile(file,4*1024*1024);notices.push({file:relative,bytes:content.length,sha256:hash(content)});
   }
   if(/^readme(?:\.|$)/i.test(entry.name)){const content=await readBoundedFile(file,4*1024*1024);readmes.push({file:relative,bytes:content.length,sha256:hash(content)});}
   if(/\.(?:node|dll|so(?:\.\d+)*|dylib|wasm)$/i.test(entry.name))nativeFiles.push({file:relative,bytes:(await lstat(file)).size,sha256:await sha256File(file)});
  }
 };
 await walk(directory,0);
 packages.push({location,name:manifest.name,version:manifest.version,declaredLicense:manifest.license??null,repository:manifest.repository??null,manifestSha256:hash(bytes),integrity:pin.integrity??null,notices,readmes,nativeFiles});
}
assert.equal(hash(await readFile(lockFile)),hash(lockBytes),'Runtime lock changed during inventory');
const after=await modelRuntimeStatus(cache);assert.equal(after.unchanged,true);assert.equal(after.treeSha256,status.treeSha256);
const report={checkedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,treeSha256:status.treeSha256,lockSha256:hash(lockBytes),packages,absentOptional,missingDeclarations:packages.filter(p=>!p.declaredLicense).map(p=>p.name),missingNotices:packages.filter(p=>!p.notices.length).map(p=>p.name),treeUnchanged:true,limitations:['Installed package metadata and local notice hashes only; no legal compatibility conclusion','Registry integrity strings are recorded, not independently verified against archive downloads','Native files can embed third-party components not enumerated by npm; notice discovery is not an exhaustive component or license audit','Other platform optional packages, model weights, Python runtimes and FFmpeg are outside this inventory']};
await writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({root,packages:packages.length,absentOptional:absentOptional.length,missingDeclarations:report.missingDeclarations,missingNotices:report.missingNotices,native:packages.filter(p=>p.nativeFiles.length).map(p=>({name:p.name,version:p.version,declaredLicense:p.declaredLicense,notices:p.notices.length,nativeFiles:p.nativeFiles.length})),treeUnchanged:true}));
