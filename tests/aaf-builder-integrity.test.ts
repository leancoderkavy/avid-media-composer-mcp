import {it,expect,vi} from "vitest";
import {mkdtemp,readFile,writeFile,realpath} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {sha256File} from "../src/analysis/file-inventory.js";
import {AafBuilder} from "../src/library/aaf-builder.js";
import {loadConfig} from "../src/config.js";

const state=vi.hoisted(()=>({mode:"intact",media:""}));
vi.mock("../src/process.js",()=>({runProcess:async(_binary:string,args:string[])=>{
  const request=JSON.parse(await readFile(args[1]!,"utf8"));
  let result:unknown={masters:[{mobId:"urn:smpte:umid:aa",name:"fixture",slots:[]}],locators:[pathToFileURL(state.media).href]};
  if(request.action==="build"){
    await writeFile(request.output,"verified fixture");
    result={output:request.output,sha256:await sha256File(request.output),conformanceVerified:true,sourceGraphVerified:true};
    if(state.mode==="output")await writeFile(request.output,"changed after verification");
    if(state.mode==="template")await writeFile(request.source,"changed template");
  }
  return {exitCode:0,stderr:"",stdout:JSON.stringify(result)};
}}));

it.each(["intact","output","template"])("binds Python build evidence to current %s bytes",async mode=>{
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"avid-aaf-integrity-")));
  const template=path.join(root,"source.aaf");state.media=path.join(root,"media.mov");state.mode=mode;
  await writeFile(template,"template");await writeFile(state.media,"media");
  const builder=new AafBuilder(loadConfig({AVID_MCP_ALLOWED_ROOTS:root,AVID_MCP_OUTPUT_ROOT:root,AVID_MCP_CAPABILITIES:"inspect,export"}));
  const operation=builder.build({template,expectedSha256:await sha256File(template),name:"Selects",rate:"30",tracks:[{name:"V1",kind:"picture"}],selects:[{mobId:"urn:smpte:umid:aa",start:0,length:1,slotIds:[1]}]});
  if(mode==="intact")expect(await operation).toMatchObject({sourceGraphVerified:true,conformanceVerified:true,sourceModified:false});
  else await expect(operation).rejects.toThrow(mode==="output"?"output changed after conformance":"template changed after conformance");
});

