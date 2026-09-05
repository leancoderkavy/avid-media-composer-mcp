import {mkdtemp,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {it,expect,vi} from "vitest";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";
const mock=vi.hoisted(()=>({locator:""}));
vi.mock("../src/process.js",()=>({runProcess:async()=>({exitCode:0,stderr:"",stdout:JSON.stringify({masters:[{mobId:"urn:smpte:umid:aa",name:"fixture",slots:[]}],locators:[mock.locator]})})}));
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-aaf-")),template=path.join(root,"source.aaf");await writeFile(template,"fixture");return {root,template,builder:new AafBuilder(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}))};}
it("rejects network locators before exposing an exportable template",async()=>{const {builder,template}=await fixture();mock.locator="https://example.com/media.mp4";await expect(builder.inspect(template)).rejects.toThrow("local file locators");});
it("rechecks referenced media against current roots and returns hashes for permitted files",async()=>{
  const {builder,template,root}=await fixture();const outside=await mkdtemp(path.join(os.tmpdir(),"avid-outside-")),file=path.join(outside,"media.mp4");await writeFile(file,"outside");mock.locator=pathToFileURL(file).href;await expect(builder.inspect(template)).rejects.toThrow();
  const permitted=path.join(root,"media.mp4");await writeFile(permitted,"permitted");mock.locator=pathToFileURL(permitted).href;expect((await builder.inspect(template)).media[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
});
