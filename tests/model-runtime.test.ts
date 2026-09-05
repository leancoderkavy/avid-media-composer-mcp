import {mkdtemp,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {it,expect} from "vitest";
import {modelRuntime} from "../src/library/model-runtime.js";
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
 const loaded=await modelRuntime(root),revision="a".repeat(40);
 for(const task of ["summarization","automatic-speech-recognition","text-generation"] as const)await loaded.pipeline(task,"owner/fixture",{revision,local_files_only:false,cache_dir:"wrong",dtype:"q8"});
 const internal=await import(pathToFileURL(entry).href);expect(internal.env).toMatchObject({allowRemoteModels:false,cacheDir:path.resolve(root)});expect(internal.calls).toHaveLength(7);
 for(const call of internal.calls){expect(call.model).toBe(path.resolve(root,"owner/fixture",revision));expect(call.options).toMatchObject({revision,local_files_only:true,cache_dir:path.resolve(root),dtype:"q8"});}
 await expect(loaded.pipeline("summarization","owner/fixture",{})).rejects.toThrow("fixed model revision");
 await expect(loaded.pipeline("feature-extraction","owner/fixture",{revision})).rejects.toThrow("Unsupported");
});
