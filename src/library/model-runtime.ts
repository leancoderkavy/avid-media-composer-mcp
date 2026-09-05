import {mkdir,access,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {runProcess} from "../process.js";

/** ML is installed as a separate optional application, so its overrides are
 * effective at the dependency root and do not burden the core MCP install. */
export async function modelRuntime(cache:string,install=false):Promise<typeof import("@huggingface/transformers")>{
  const runtime=path.resolve(cache,"runtime");
  if(install){
    await mkdir(runtime,{recursive:true});
    const manifest={name:"avid-mcp-local-model-runtime",version:"1.0.0",private:true,type:"module",
      dependencies:{"@huggingface/transformers":"4.2.0"},overrides:{sharp:"0.35.4","adm-zip":"0.6.0"}};
    const file=path.join(runtime,"package.json");
    try{
      const existing=JSON.parse(await readFile(file,"utf8"));
      if(JSON.stringify(existing)!==JSON.stringify(manifest))throw new Error("Existing model runtime differs; use a fresh model directory");
    }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;await writeFile(file,JSON.stringify(manifest),{flag:"wx"});}
    const npmCli=path.join(path.dirname(process.execPath),"node_modules","npm","bin","npm-cli.js");
    await access(npmCli);
    const result=await runProcess(process.execPath,[npmCli,"install","--ignore-scripts","--no-fund"],{cwd:runtime,timeoutMs:180000,maxOutputBytes:1024*1024});
    if(result.exitCode!==0)throw new Error("Optional model runtime installation failed");
    const audit=await runProcess(process.execPath,[npmCli,"audit","--omit=dev","--audit-level=high"],{cwd:runtime,timeoutMs:30000,maxOutputBytes:1024*1024});
    if(audit.exitCode!==0)throw new Error("Optional model runtime audit failed; models were not loaded");
  }
  const entry=path.join(runtime,"node_modules","@huggingface","transformers","dist","transformers.node.mjs");
  try{await access(entry);}catch{throw new Error("Optional model runtime is missing; run avid-mcp --download-models --model-dir PATH explicitly");}
  return import(pathToFileURL(entry).href);
}
