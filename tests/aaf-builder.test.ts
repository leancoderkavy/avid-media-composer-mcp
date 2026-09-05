import {mkdtemp,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {it,expect,vi} from "vitest";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";
const mock=vi.hoisted(()=>({locator:"",composition:undefined as unknown}));
vi.mock("../src/process.js",()=>({runProcess:async()=>({exitCode:0,stderr:"",stdout:JSON.stringify({masters:[{mobId:"urn:smpte:umid:aa",name:"fixture",slots:[]}],locators:[mock.locator],composition:mock.composition})})}));
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),"avid-aaf-")),template=path.join(root,"source.aaf");await writeFile(template,"fixture");return {root,template,builder:new AafBuilder(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}))};}
it("rejects network locators before exposing an exportable template",async()=>{const {builder,template}=await fixture();mock.locator="https://example.com/media.mp4";await expect(builder.inspect(template)).rejects.toThrow("local file locators");});
it("rechecks referenced media against current roots and returns hashes for permitted files",async()=>{
  const {builder,template,root}=await fixture();const outside=await mkdtemp(path.join(os.tmpdir(),"avid-outside-")),file=path.join(outside,"media.mp4");await writeFile(file,"outside");mock.locator=pathToFileURL(file).href;await expect(builder.inspect(template)).rejects.toThrow();
  const permitted=path.join(root,"media.mp4");await writeFile(permitted,"permitted");mock.locator=pathToFileURL(permitted).href;expect((await builder.inspect(template)).media[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
});
it("requires composition evidence and preserves its cuts with permitted source hashes",async()=>{
 const {builder,template,root}=await fixture(),media=path.join(root,"media.mp4");await writeFile(media,"media");mock.locator=pathToFileURL(media).href;
 mock.composition=undefined;await expect(builder.inspectSelects(template)).rejects.toThrow();
 mock.composition={mobId:"urn:smpte:umid:bb",name:"Selects",rate:"30",frames:60,tracks:[{slotId:1,name:"V1",kind:"picture",cuts:[{mobId:"urn:smpte:umid:aa",slotId:1,start:20,length:60,position:0}]}]};
 const result=await builder.inspectSelects(template);expect(result.composition).toEqual(mock.composition);expect(result.media[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);expect(result.hostImportVerified).toBe(false);
 mock.locator="https://example.com/media.mp4";await expect(builder.inspectSelects(template)).rejects.toThrow("local file locators");
 mock.composition=undefined;
});
