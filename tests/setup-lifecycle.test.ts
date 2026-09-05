import {mkdtemp,writeFile,readFile,open,unlink} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {it,expect} from "vitest";
import {changeConfiguration,configurationStatus} from "../src/setup-lifecycle.js";
const name="avid-media-composer",key="mcpServers" as const;
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-setup-")),file=path.join(root,"client.json");await writeFile(file,JSON.stringify({theme:"dark",mcpServers:{other:{command:"other"}}}));return {root,file};}
it("installs, updates, removes and rolls back only Avid while preserving subsequent unrelated edits",async()=>{
  const {file}=await fixture();const install=await changeConfiguration(file,{action:"install",key,entry:{command:"old"}});
  const update=await changeConfiguration(file,{action:"update",key,entry:{command:"new"},expectedSha256:install.sha256});
  let current=JSON.parse(await readFile(file,"utf8"));current.theme="light";current.mcpServers.additional={command:"extra"};await writeFile(file,JSON.stringify(current));
  const restore=await changeConfiguration(file,{action:"restore",key,backup:update.backup!,expectedSha256:(await configurationStatus(file)).sha256});
  current=JSON.parse(await readFile(file,"utf8"));expect(current.theme).toBe("light");expect(current.mcpServers.additional.command).toBe("extra");expect(current.mcpServers[name].command).toBe("old");
  const removed=await changeConfiguration(file,{action:"remove",key,expectedSha256:restore.sha256});expect((await configurationStatus(file)).configuredIn).toEqual([]);
  await changeConfiguration(file,{action:"restore",key,backup:removed.backup!,expectedSha256:removed.sha256});expect((await configurationStatus(file)).configuredIn).toEqual([key]);
});
it("rejects stale checksums and backups for another configuration without modifying current data",async()=>{
  const {file}=await fixture();const installed=await changeConfiguration(file,{action:"install",key,entry:{command:"old"}}),before=await readFile(file,"utf8");
  await expect(changeConfiguration(file,{action:"remove",key,expectedSha256:"stale"})).rejects.toThrow("changed");
  await expect(changeConfiguration(file,{action:"restore",key,expectedSha256:installed.sha256,backup:`${file}.other`})).rejects.toThrow("exact configuration");expect(await readFile(file,"utf8")).toBe(before);
});
it("refuses an active lifecycle lock and invalid JSON without replacing them",async()=>{
  const {file}=await fixture(),lock=`${file}.avid-lock`,handle=await open(lock,"wx");
  try{await expect(changeConfiguration(file,{action:"install",key,entry:{command:"x"}})).rejects.toThrow();}finally{await handle.close();await unlink(lock);}
  await writeFile(file,"not json");await expect(changeConfiguration(file,{action:"install",key,entry:{command:"x"}})).rejects.toThrow();expect(await readFile(file,"utf8")).toBe("not json");
});
it("does not expose other entries or environment values through status",async()=>{
  const {file}=await fixture();await writeFile(file,JSON.stringify({mcpServers:{[name]:{env:{SECRET:"fixture-secret-8d1e7c"}}}}));const status=await configurationStatus(file);expect(JSON.stringify(status)).not.toContain("fixture-secret-8d1e7c");expect(status.sha256).toMatch(/^[a-f0-9]{64}$/);
});

it("binds an older server entry to its supplied checksum before configuration generation",async()=>{
  const {resolveSetupEntry,clientConfiguration}=await import("../src/setup.js"),{sha256File}=await import("../src/analysis/file-inventory.js");
  const {root}=await fixture(),file=path.join(root,"older-server.js");await writeFile(file,"// original server");const hash=await sha256File(file),entry=await resolveSetupEntry(file,hash);
  expect(clientConfiguration("generic",[root],undefined,undefined,entry)).toMatchObject({mcpServers:{[name]:{args:[entry]}}});
  await writeFile(file,"// changed server");await expect(resolveSetupEntry(file,hash)).rejects.toThrow(/checksum mismatch/);
  await expect(resolveSetupEntry("relative.js",hash)).rejects.toThrow(/absolute/);
});
