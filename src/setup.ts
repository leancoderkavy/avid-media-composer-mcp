import {resolveCapabilities} from "./security/capabilities.js";
import path from "node:path";
import { realpath,stat } from "node:fs/promises";
import {sha256File} from "./analysis/file-inventory.js";
import {changeConfiguration} from "./setup-lifecycle.js";
import { fileURLToPath } from "node:url";
import type { ServerConfig } from "./config.js";
import type { DependencyStatus } from "./types.js";
import { NativeAdapter } from "./native/adapter.js";
import { probeFfmpeg, probeFfprobe } from "./analysis/media.js";
import { probePythonInspector } from "./analysis/python-sidecar.js";

export type SetupClient = "claude" | "cursor" | "vscode" | "lmstudio" | "generic";
export async function resolveSetupEntry(file:string,expectedSha256:string){
  if(!path.isAbsolute(file)||!/^[a-f0-9]{64}$/.test(expectedSha256))throw new Error("Server entry requires an absolute path and lowercase SHA-256");
  const entry=await realpath(file);if(!(await stat(entry)).isFile())throw new Error("Server entry must be a file");
  if(await sha256File(entry)!==expectedSha256)throw new Error("Server entry checksum mismatch");return entry;
}
export interface ClientRuntimeOptions {modelDirectory?:string|undefined;capabilities?:string|undefined;ffmpeg?:string|undefined;ffprobe?:string|undefined;python?:string|undefined;}
export function clientConfiguration(client: SetupClient, roots: string[], outputRoot?: string, nativeBinary?: string,serverEntry=fileURLToPath(new URL("./index.js", import.meta.url)),runtime:ClientRuntimeOptions={}) {
  if (!roots.length || roots.some(root => !path.isAbsolute(root)||root.includes(path.delimiter))) throw new Error("Absolute allowed roots without path-list separators are required");
  if(!path.isAbsolute(serverEntry))throw new Error("Server entry must be absolute");
  if(runtime.capabilities!==undefined&&!runtime.capabilities.trim())throw new Error("Capabilities must be a nonempty comma-separated list");
  const capabilities=[...resolveCapabilities(runtime.capabilities).capabilities].join(",");
  if(!capabilities)throw new Error("Capabilities must contain at least one known capability");
  for(const [name,value] of Object.entries(runtime)){if(name!=="capabilities"&&value!==undefined&&!path.isAbsolute(value))throw new Error(`${name} must be an absolute path for client configuration`);}
  const entry = { command: process.execPath, args: [serverEntry], env: {
    AVID_MCP_ALLOWED_ROOTS: roots.join(path.delimiter), AVID_MCP_CAPABILITIES: capabilities,
    ...(runtime.modelDirectory ? {AVID_MCP_MODEL_DIR:runtime.modelDirectory} : {}),
    ...(runtime.ffmpeg ? {AVID_MCP_FFMPEG:runtime.ffmpeg} : {}),
    ...(runtime.ffprobe ? {AVID_MCP_FFPROBE:runtime.ffprobe} : {}),
    ...(runtime.python ? {AVID_MCP_PYTHON:runtime.python} : {}),
    ...(outputRoot ? { AVID_MCP_OUTPUT_ROOT: path.resolve(outputRoot) } : {}),
    ...(nativeBinary ? { AVID_MCP_NATIVE_BINARY: path.resolve(nativeBinary) } : {}),
  } };
  return client === "vscode" ? { servers: { "avid-media-composer": { type: "stdio", ...entry } } } : { mcpServers: { "avid-media-composer": entry } };
}

export async function installConfiguration(file: string, config: ReturnType<typeof clientConfiguration>) {
  const key = "servers" in config ? "servers" : "mcpServers";
  return changeConfiguration(file,{action:"install",key,entry:(config as Record<string, any>)[key]["avid-media-composer"]});
}

/** Codex owns its TOML configuration; generate argv instead of editing it as JSON. */
export function codexSetupCommand(roots:string[],outputRoot?:string,nativeBinary?:string,serverEntry?:string,runtime:ClientRuntimeOptions={}){
  const config=clientConfiguration("generic",roots,outputRoot,nativeBinary,serverEntry,runtime);
  const entry=config.mcpServers!["avid-media-composer"];
  const args=["mcp","add","avid-media-composer"];
  for(const [key,value] of Object.entries(entry.env))args.push("--env",`${key}=${value}`);
  args.push("--",entry.command,...entry.args);
  return {command:"codex",args,note:"Run this argument array with the installed Codex CLI, without a shell. Codex writes its own configuration. Inspect any existing avid-media-composer entry before replacing it."};
}

export async function doctor(config: ServerConfig) {
  const check = async (fn: () => Promise<unknown>) => { try { return {ok:true,data:await fn()}; } catch(error) { return {ok:false,error:(error as Error).message}; } };
  const dependencyCheck = async (fn: () => Promise<DependencyStatus>) => {
    try {
      const data = await fn();
      return {ok:data.available,data,...(!data.available ? {error:data.error ?? "Dependency is unavailable"} : {})};
    } catch(error) { return {ok:false,error:(error as Error).message}; }
  };
  const [roots, outputDirectory, ffmpeg, ffprobe, python, native] = await Promise.all([
    check(() => {
      if(!config.allowedRoots.length)throw new Error("No allowed roots are configured");
      return Promise.all(config.allowedRoots.map(root => realpath(root)));
    }),
    config.outputRoot ? check(async () => {
      const resolved=await realpath(config.outputRoot!);
      if(!(await stat(resolved)).isDirectory())throw new Error("Configured output root is not a directory");
      return {path:resolved,scope:"Directory existence only; write permission and capacity are not tested"};
    }) : Promise.resolve({ok:false,error:"Output directory is not explicitly configured"}),
    dependencyCheck(() => probeFfmpeg(config.ffmpegExecutable ?? "ffmpeg", config.commandTimeoutMs)),
    dependencyCheck(() => probeFfprobe(config.ffprobeExecutable, config.commandTimeoutMs)),
    dependencyCheck(() => probePythonInspector({pythonExecutable:config.pythonExecutable,timeoutMs:config.commandTimeoutMs})),
    config.nativeBinary ? check(() => new NativeAdapter(config).read("app")) : Promise.resolve({ok:false,error:"Native adapter is not configured"}),
  ]);
  return { platform:process.platform, node:process.versions.node, roots, outputDirectory, ffmpeg, ffprobe, python, native,
    enabledCapabilities:[...config.capabilities], outputRoot:config.outputRoot ?? null,
    note:"Dependency presence is not host editing qualification. Mac native support is not qualified." };
}
