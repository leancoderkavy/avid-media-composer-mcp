import {access} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {installModelRuntime,modelRuntimeStatus} from "./model-runtime-install.js";

/** ML is installed as a separate optional application, so its overrides are
 * effective at the dependency root and do not burden the core MCP install. */
export async function modelRuntime(cache:string,install=false):Promise<typeof import("@huggingface/transformers")>{
  const runtime=path.resolve(cache,"runtime");
  if(install)await installModelRuntime(cache);
  const entry=path.join(runtime,"node_modules","@huggingface","transformers","dist","transformers.node.mjs");
  try{await access(entry);}catch{throw new Error("Optional model runtime is missing; run avid-mcp --download-models --model-dir PATH explicitly");}
  const status=await modelRuntimeStatus(cache);
  if(!status.managed)throw new Error("Model runtime has no installation receipt; explicitly run --install-model-runtime --model-dir PATH to audit and adopt it");
  if(status.inferencePreflight.state==="setup_lock_present")throw new Error(status.inferencePreflight.nextStep);
  if(!status.unchanged)throw new Error("Model runtime tree changed; refusing dependency import. Use a fresh model directory");
  const loaded=await import(pathToFileURL(status.entry).href) as typeof import("@huggingface/transformers");
  loaded.env.cacheDir=path.resolve(cache);
  loaded.env.allowRemoteModels=install;
  // 4.2.0 pipeline() preflight drops revision/cache/local-only options. Build
  // the supported pipeline components directly so every load retains them.
  const pipeline=async(task:string,model:string,options:Parameters<typeof loaded.pipeline>[2]={})=>{
    const pinned={...options,cache_dir:path.resolve(cache),local_files_only:!install};
    if(!/^[a-f0-9]{40}$/.test(String(pinned.revision??"")))throw new Error("A fixed model revision is required");
    if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(model)||model.split("/").some(part=>part==="."||part===".."))throw new Error("Unsupported model identifier");
    const location=install?model:path.resolve(cache,model,String(pinned.revision));
    if(task==="summarization"){
      const tokenizer=await loaded.AutoTokenizer.from_pretrained(location,pinned);
      const instance=await loaded.AutoModelForSeq2SeqLM.from_pretrained(location,pinned);
      return new loaded.SummarizationPipeline({task:"summarization",tokenizer,model:instance});
    }
    if(task==="automatic-speech-recognition"){
      const tokenizer=await loaded.AutoTokenizer.from_pretrained(location,pinned);
      const processor=await loaded.AutoProcessor.from_pretrained(location,pinned);
      const instance=await loaded.AutoModelForSpeechSeq2Seq.from_pretrained(location,pinned);
      return new loaded.AutomaticSpeechRecognitionPipeline({task:"automatic-speech-recognition",tokenizer,processor,model:instance});
    }
    if(task==="text-generation"){
      const tokenizer=await loaded.AutoTokenizer.from_pretrained(location,pinned);
      const instance=await loaded.AutoModelForCausalLM.from_pretrained(location,pinned);
      return new loaded.TextGenerationPipeline({task:"text-generation",tokenizer,model:instance});
    }
    throw new Error("Unsupported pinned local pipeline task");
  };
  return {...loaded,pipeline:pipeline as typeof loaded.pipeline};
}
