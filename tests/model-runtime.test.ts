import {mkdtemp,mkdir,writeFile,realpath,unlink,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {it,expect} from "vitest";
import {modelRuntime} from "../src/library/model-runtime.js";
import {runtimeManifest,modelRuntimeStatus} from "../src/library/model-runtime-install.js";
import {packageTreeHash} from "../src/package-lifecycle.js";
it("rejects a changed runtime before executing its entry module",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-runtime-refusal-")),runtime=path.join(root,"runtime"),directory=path.join(runtime,"node_modules","@huggingface","transformers");
 await mkdir(path.join(directory,"dist"),{recursive:true});await writeFile(path.join(runtime,"package.json"),JSON.stringify(runtimeManifest));await writeFile(path.join(directory,"package.json"),JSON.stringify({version:"4.2.0"}));
 const entry=path.join(directory,"dist","transformers.node.mjs");await writeFile(entry,'throw new Error("UNVERIFIED_MODULE_EXECUTED");');
 await writeFile(path.join(runtime,"installation.json"),JSON.stringify({schema:1,kind:"avid-model-runtime",transformers:"4.2.0",treeSha256:"0".repeat(64),checkedAt:new Date().toISOString(),nodeVersion:process.versions.node,checks:{scriptsDisabled:true,auditHighPassed:true,importPassed:true},adoptedLegacy:false}));
 await expect(modelRuntime(root)).rejects.toThrow("tree changed");
 await writeFile(path.join(directory,"package.json")," ".repeat(1024*1024+1));
 await expect(modelRuntime(root)).rejects.toThrow(/limit|large|size/i);
});
it("bypasses pipeline preflight and enforces local pinned component options",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"avid-pinned-runtime-")),directory=path.join(root,"runtime","node_modules","@huggingface","transformers"),entry=path.join(directory,"dist","transformers.node.mjs");
 await mkdir(path.dirname(entry),{recursive:true});await writeFile(path.join(directory,"package.json"),JSON.stringify({version:"4.2.0"}));
 await writeFile(entry,`
 export const env={};export const calls=[];
 export const pipeline=()=>{throw Error("Unsafe preflight called");};
 function loader(kind){return {from_pretrained:async(model,options)=>{calls.push({kind,model,options});return {};}};}
 export const AutoTokenizer=loader("tokenizer"),AutoProcessor=loader("processor"),AutoModelForSeq2SeqLM=loader("summary"),AutoModelForSpeechSeq2Seq=loader("speech"),AutoModelForCausalLM=loader("text");
 export class SummarizationPipeline{constructor(options){Object.assign(this,options);}}
 export class AutomaticSpeechRecognitionPipeline{constructor(options){Object.assign(this,options);}}
 export class TextGenerationPipeline{constructor(options){Object.assign(this,options);}}
 `);
 await writeFile(path.join(root,"runtime","package.json"),JSON.stringify(runtimeManifest));
 await expect(modelRuntime(root)).rejects.toThrow("no installation receipt");
 const treeSha256=await packageTreeHash(path.join(root,"runtime"));
 await writeFile(path.join(root,"runtime","installation.json"),JSON.stringify({schema:1,kind:"avid-model-runtime",transformers:"4.2.0",treeSha256,checkedAt:new Date().toISOString(),nodeVersion:process.versions.node,checks:{scriptsDisabled:true,auditHighPassed:true,importPassed:true},adoptedLegacy:false}));
 const setupLock=path.join(root,'.runtime-install.lock');await writeFile(setupLock,'unknown retained owner',{flag:'wx'});
 expect(await modelRuntimeStatus(root)).toMatchObject({managed:true,unchanged:true,inferencePreflight:{state:'setup_lock_present',passed:false}});
 await expect(modelRuntime(root)).rejects.toThrow('setup lock exists');expect(await readFile(setupLock,'utf8')).toBe('unknown retained owner');
 await unlink(setupLock); // This test created the fixture lock and has no setup worker.
 const loaded=await modelRuntime(root),revision="a".repeat(40);
 for(const task of ["summarization","automatic-speech-recognition","text-generation"] as const)await loaded.pipeline(task,"owner/fixture",{revision,local_files_only:false,cache_dir:"wrong",dtype:"q8"});
 const internal=await import(pathToFileURL(await realpath(entry)).href);expect(internal.env).toMatchObject({allowRemoteModels:false,cacheDir:path.resolve(root)});expect(internal.calls).toHaveLength(7);
 for(const call of internal.calls){expect(call.model).toBe(path.resolve(root,"owner/fixture",revision));expect(call.options).toMatchObject({revision,local_files_only:true,cache_dir:path.resolve(root),dtype:"q8"});}
 await expect(loaded.pipeline("summarization","owner/fixture",{})).rejects.toThrow("fixed model revision");
 await expect(loaded.pipeline("feature-extraction","owner/fixture",{revision})).rejects.toThrow("Unsupported");
 await writeFile(path.join(root,"runtime","unexpected.txt"),"changed dependency tree");
 await expect(modelRuntime(root)).rejects.toThrow("tree changed");
});
