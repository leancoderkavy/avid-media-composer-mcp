import {it,expect} from "vitest";
import path from "node:path";
import {clientConfiguration,codexSetupCommand,type SetupClient} from "../src/setup.js";
import {loadConfig} from "../src/config.js";
it("carries explicit runtime paths and capabilities through all client formats",()=>{
 const root=path.resolve("fixture"),modelDirectory=path.join(root,"model files"),ffmpeg=path.join(root,"bin","ffmpeg"),ffprobe=path.join(root,"bin","ffprobe"),python=path.join(root,"bin","python");
 for(const client of ["claude","cursor","vscode","lmstudio","generic"] as SetupClient[]){
  const result=clientConfiguration(client,[root],root,undefined,undefined,{modelDirectory,ffmpeg,ffprobe,python,capabilities:"inspect, export,project-write,inspect"});
  const entry=("servers" in result?result.servers:result.mcpServers)["avid-media-composer"];
  const config=loadConfig(entry.env);expect(config.modelDirectory).toBe(modelDirectory);expect(config.ffmpegExecutable).toBe(ffmpeg);expect(config.ffprobeExecutable).toBe(ffprobe);expect(config.pythonExecutable).toBe(python);expect([...config.capabilities]).toEqual(["inspect","export","project-write"]);
 }
});
it("keeps default configuration inspect-only without ambient runtime settings",()=>{
 const root=path.resolve("fixture"),result=clientConfiguration("generic",[root]),env=result.mcpServers!["avid-media-composer"].env;
 expect(env.AVID_MCP_CAPABILITIES).toBe("inspect");expect(env).not.toHaveProperty("AVID_MCP_MODEL_DIR");expect(env).not.toHaveProperty("AVID_MCP_PYTHON");
});
it("generates shell-free Codex argv preserving special characters and scoped runtime options",()=>{
 const root=path.resolve('fixture space $value & literal'),entry=path.join(root,'server.js'),modelDirectory=path.join(root,'models');
 const generated=codexSetupCommand([root],root,undefined,entry,{modelDirectory,capabilities:'inspect,export'});
 expect(generated.command).toBe('codex');expect(generated.args.slice(0,3)).toEqual(['mcp','add','avid-media-composer']);
 expect(generated.args.slice(-3)).toEqual(['--',process.execPath,entry]);
 const envArgs=generated.args.slice(3,-3),env:Record<string,string>={};
 for(let i=0;i<envArgs.length;i+=2){expect(envArgs[i]).toBe('--env');const value=envArgs[i+1]!,separator=value.indexOf('=');env[value.slice(0,separator)]=value.slice(separator+1);}
 expect(env).toEqual(clientConfiguration('generic',[root],root,undefined,entry,{modelDirectory,capabilities:'inspect,export'}).mcpServers!['avid-media-composer'].env);
 expect(()=>codexSetupCommand(['relative'])).toThrow('Absolute');
});
it("rejects unknown or empty capabilities and ambiguous executable/model paths",()=>{
 const root=path.resolve("fixture");
 expect(()=>clientConfiguration("generic",[path.join(root,"one"+path.delimiter+"two")])).toThrow("path-list");
 for(const capabilities of ["",",,,","inspect,publish","unknown"])expect(()=>clientConfiguration("generic",[root],undefined,undefined,undefined,{capabilities})).toThrow();
 for(const key of ["modelDirectory","ffmpeg","ffprobe","python"])expect(()=>clientConfiguration("generic",[root],undefined,undefined,undefined,{[key]:"relative"})).toThrow("absolute");
});
