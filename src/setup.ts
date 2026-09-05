import path from "node:path";
import { realpath,stat } from "node:fs/promises";
import {sha256File} from "./analysis/file-inventory.js";
import {changeConfiguration} from "./setup-lifecycle.js";
import { fileURLToPath } from "node:url";
import type { ServerConfig } from "./config.js";
import { NativeAdapter } from "./native/adapter.js";
import { probeFfprobe } from "./analysis/media.js";
import { probePythonInspector } from "./analysis/python-sidecar.js";

export type SetupClient = "claude" | "cursor" | "vscode" | "lmstudio" | "generic";
export async function resolveSetupEntry(file:string,expectedSha256:string){
  if(!path.isAbsolute(file)||!/^[a-f0-9]{64}$/.test(expectedSha256))throw new Error("Server entry requires an absolute path and lowercase SHA-256");
  const entry=await realpath(file);if(!(await stat(entry)).isFile())throw new Error("Server entry must be a file");
  if(await sha256File(entry)!==expectedSha256)throw new Error("Server entry checksum mismatch");return entry;
}
export function clientConfiguration(client: SetupClient, roots: string[], outputRoot?: string, nativeBinary?: string,serverEntry=fileURLToPath(new URL("./index.js", import.meta.url))) {
  if (!roots.length || roots.some(root => !path.isAbsolute(root))) throw new Error("Absolute allowed roots are required");
  if(!path.isAbsolute(serverEntry))throw new Error("Server entry must be absolute");
  const entry = { command: process.execPath, args: [serverEntry], env: {
    AVID_MCP_ALLOWED_ROOTS: roots.join(path.delimiter), AVID_MCP_CAPABILITIES: "inspect",
    ...(outputRoot ? { AVID_MCP_OUTPUT_ROOT: path.resolve(outputRoot) } : {}),
    ...(nativeBinary ? { AVID_MCP_NATIVE_BINARY: path.resolve(nativeBinary) } : {}),
  } };
  return client === "vscode" ? { servers: { "avid-media-composer": { type: "stdio", ...entry } } } : { mcpServers: { "avid-media-composer": entry } };
}

export async function installConfiguration(file: string, config: ReturnType<typeof clientConfiguration>) {
  const key = "servers" in config ? "servers" : "mcpServers";
  return changeConfiguration(file,{action:"install",key,entry:(config as Record<string, any>)[key]["avid-media-composer"]});
}

export async function doctor(config: ServerConfig) {
  const check = async (fn: () => Promise<unknown>) => { try { return {ok:true,data:await fn()}; } catch(error) { return {ok:false,error:(error as Error).message}; } };
  const [roots, ffprobe, python, native] = await Promise.all([
    check(() => Promise.all(config.allowedRoots.map(root => realpath(root)))),
    check(() => probeFfprobe(config.ffprobeExecutable, config.commandTimeoutMs)),
    check(() => probePythonInspector({pythonExecutable:config.pythonExecutable,timeoutMs:config.commandTimeoutMs})),
    config.nativeBinary ? check(() => new NativeAdapter(config).read("app")) : Promise.resolve({ok:false,error:"Native adapter is not configured"}),
  ]);
  return { platform:process.platform, node:process.versions.node, roots, ffprobe, python, native,
    enabledCapabilities:[...config.capabilities], outputRoot:config.outputRoot ?? null,
    note:"Dependency presence is not host editing qualification. Mac native support is not qualified." };
}
