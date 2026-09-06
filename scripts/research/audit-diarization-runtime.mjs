import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {diarizationRuntimeStatus} from '../../dist/library/diarization-runtime.js';
import {runProcess} from '../../dist/process.js';
const cache=path.resolve(process.argv[2]??'.avid-mcp-analysis/models'),root=path.resolve('.avid-mcp-analysis',`diarization-audit-${randomUUID()}`);await mkdir(root);
const status=await diarizationRuntimeStatus(cache);assert.ok(status.unchanged);
const code=`import importlib.metadata as m,json,hashlib
records=[]
for d in m.distributions():
 licenses=[]
 for f in d.files or []:
  if any(s in str(f).lower() for s in ['license','copying','notice']):
   p=d.locate_file(f); data=p.read_bytes(); licenses.append({'path':str(f),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 records.append({'name':d.metadata['Name'],'version':d.version,'license':d.metadata.get('License-Expression') or d.metadata.get('License'),'requires':d.requires,'licenseFiles':licenses})
print(json.dumps(records))`;
const inventory=await runProcess(status.executable,['-B','-c',code],{timeoutMs:30000,maxOutputBytes:1024*1024});assert.equal(inventory.exitCode,0,inventory.stderr);const packages=JSON.parse(inventory.stdout),reports=[];
for(const item of packages){
  assert.match(item.name,/^[a-zA-Z0-9._-]+$/);assert.match(item.version,/^[a-zA-Z0-9.+-]+$/);
  const url=`https://pypi.org/pypi/${encodeURIComponent(item.name)}/${encodeURIComponent(item.version)}/json`,response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok&&response.body);
  const reader=response.body.getReader(),chunks=[];let count=0;try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;assert.ok(count<=2*1024*1024);chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks,count).toString('utf8'));assert.equal(data.info.version,item.version);assert.equal(data.info.name.toLowerCase().replace(/[-_.]+/g,'-'),item.name.toLowerCase().replace(/[-_.]+/g,'-'));assert.ok(Array.isArray(data.vulnerabilities));
  const responseFile=path.join(root,`${item.name}-${item.version}.pypi.json`);await writeFile(responseFile,JSON.stringify(data),{flag:'wx'});
  reports.push({...item,source:url,vulnerabilities:data.vulnerabilities,responseFile});
}
assert.ok((await diarizationRuntimeStatus(cache)).unchanged);
const active=reports.flatMap(report=>report.vulnerabilities.filter(value=>!value.withdrawn).map(value=>({package:report.name,...value}))),cves=[...new Set(active.flatMap(value=>(value.aliases??[]).filter(alias=>alias.startsWith('CVE-'))))].sort();
await writeFile(path.join(root,'evidence.json'),JSON.stringify({checkedAt:new Date().toISOString(),status,reports,activeAdvisoryEntries:active.length,uniqueCves:cves,treeUnchanged:true,scope:'Exact installed Python distribution/version inventory queried against PyPI release vulnerability records; duplicate aliases retained. Not a native binary component scan, exploitability determination, future guarantee or complete redistribution license audit.'},null,2));
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),packages:reports.map(({name,version,licenseFiles,vulnerabilities})=>({name,version,licenseFiles:licenseFiles.length,advisoryEntries:vulnerabilities.filter(value=>!value.withdrawn).length})),uniqueCves:cves}));
