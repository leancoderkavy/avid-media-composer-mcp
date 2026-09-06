import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {diarizationRuntimeStatus} from '../../dist/library/diarization-runtime.js';
import {runProcess} from '../../dist/process.js';
const cache=path.resolve(process.argv[2]??'.avid-mcp-analysis/diarization-audited-models'),root=path.resolve('.avid-mcp-analysis',`diarization-native-${randomUUID()}`);await mkdir(root);
const before=await diarizationRuntimeStatus(cache);assert.ok(before.unchanged);
const probe=await runProcess(before.executable,['-B',path.resolve('scripts/research/inspect-diarization-native.py')],{timeoutMs:60000,maxOutputBytes:1024*1024});assert.equal(probe.exitCode,0,probe.stderr);const native=JSON.parse(probe.stdout);
async function retrieve(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000),headers:{'User-Agent':'avid-mcp-native-audit'}});assert.ok(response.ok&&response.body,`${response.status} ${url}`);const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;assert.ok(total<=2*1024*1024);chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}return Buffer.concat(chunks,total);}
assert.match(native.reported.git_sha1,/^[a-f0-9]{7,40}$/);
const commit=JSON.parse((await retrieve(`https://api.github.com/repos/k2-fsa/sherpa-onnx/commits/${native.reported.git_sha1}`)).toString('utf8'));assert.ok(commit.sha.startsWith(native.reported.git_sha1));
const sourceBase=`https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/${commit.sha}`,documents=[];
const urls=[...['LICENSE','CMakeLists.txt','cmake/onnxruntime-win-x64.cmake','cmake/espeak-ng-for-piper.cmake','cmake/piper-phonemize.cmake','cmake/hclust-cpp.cmake','cmake/kaldi-native-fbank.cmake','cmake/kaldi-decoder.cmake','cmake/openfst.cmake','cmake/simple-sentencepiece.cmake','cmake/eigen.cmake'].map(file=>`${sourceBase}/${file}`),
 'https://raw.githubusercontent.com/csukuangfj/espeak-ng/ed530aa113046142eb5115cf2fc9157854d0ffe1/COPYING',
 `https://raw.githubusercontent.com/microsoft/onnxruntime/v${native.reported.onnxruntime_version}/LICENSE`,
 `https://raw.githubusercontent.com/microsoft/onnxruntime/v${native.reported.onnxruntime_version}/ThirdPartyNotices.txt`,
 'https://raw.githubusercontent.com/OpenMathLib/OpenBLAS/v0.3.29/LICENSE'];
for(const [index,url] of urls.entries()){try{const data=await retrieve(url),file=path.join(root,`source-${index}.txt`);await writeFile(file,data,{flag:'wx'});documents.push({url,file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}catch(error){documents.push({url,error:error.message});}}
const packageUrl=`https://pypi.org/pypi/onnxruntime/${native.reported.onnxruntime_version}/json`;let advisoryLookup;
try{const bytes=await retrieve(packageUrl),data=JSON.parse(bytes.toString('utf8'));assert.equal(data.info.version,native.reported.onnxruntime_version);assert.ok(Array.isArray(data.vulnerabilities));await writeFile(path.join(root,'onnxruntime.pypi.json'),bytes,{flag:'wx'});advisoryLookup={url:packageUrl,vulnerabilities:data.vulnerabilities,scope:'Version-correlated Python release feed, not native wheel or binary coverage'};}catch(error){advisoryLookup={url:packageUrl,error:error.message};}
const commitLookups=[];
const candidates=[{repo:'k2-fsa/sherpa-onnx',ref:commit.sha},{repo:'microsoft/onnxruntime',ref:`v${native.reported.onnxruntime_version}`},{repo:'OpenMathLib/OpenBLAS',ref:'v0.3.29'},{repo:'csukuangfj/espeak-ng',ref:'ed530aa113046142eb5115cf2fc9157854d0ffe1'}];
for(const candidate of candidates){
  try{const resolved=JSON.parse((await retrieve(`https://api.github.com/repos/${candidate.repo}/commits/${candidate.ref}`)).toString('utf8'));assert.match(resolved.sha,/^[a-f0-9]{40}$/);const pages=[];let pageToken;
    do{assert.ok(pages.length<20,'OSV page limit exceeded');const query={commit:resolved.sha,...(pageToken?{page_token:pageToken}:{})},data=JSON.parse((await retrieve('https://api.osv.dev/v1/query',{method:'POST',body:JSON.stringify(query)})).toString('utf8'));assert.ok(!data.error&&(!data.vulns||Array.isArray(data.vulns)));pages.push(data);pageToken=data.next_page_token;}while(pageToken);
    commitLookups.push({...candidate,commit:resolved.sha,pages,scope:'Source-commit advisory lookup, not binary build attestation or complete dependency coverage'});
  }catch(error){commitLookups.push({...candidate,error:error.message});}
}
const after=await diarizationRuntimeStatus(cache);assert.ok(after.unchanged);assert.equal(after.treeSha256,before.treeSha256);
await writeFile(path.join(root,'evidence.json'),JSON.stringify({checkedAt:new Date().toISOString(),runtime:before,native,sherpaCommit:commit.sha,documents,advisoryLookup,commitLookups,treeUnchanged:true,scope:'Windows wheel-owned binary hashes, reported build versions, exact-source recipes/notices and limited version-correlated advisory lookup. Strings and source recipes indicate bundled phonemizer code but are not a complete link manifest, SBOM, license determination or security acceptance.'},null,2));console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),reported:native.reported,binaries:native.binaries.length,phonemizerBinaries:native.binaries.filter(file=>file.phonemizerStringCount).length,sourceErrors:documents.filter(document=>document.error),advisoryLookup,commitLookups:commitLookups.map(({pages,...item})=>({...item,advisoryEntries:pages?.flatMap(page=>page.vulns??[]).length}))}));
