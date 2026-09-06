import {expect,it} from "vitest";
import {createServer} from "node:http";
import {verifyWindowsLoopbackOwner} from "../src/integrations/loopback-owner.js";
import {sha256File} from "../src/analysis/file-inventory.js";
import {JumperReadClient} from "../src/integrations/jumper.js";
import path from "node:path";
import {runProcess} from "../src/process.js";
import {createServer as createMcpServer} from "../src/server.js";
import {loadConfig} from "../src/config.js";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";

it.skipIf(process.platform!=="win32")("verifies an actual owned listener and refuses changed checksum/process identity",async()=>{
  let requests=0,license:unknown;
  const server=createServer((req,res)=>{requests++;license=req.headers["x-license-key"];res.setHeader("content-type","application/json");res.end('{"matches":[]}');});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Missing listener");
  const args={port:address.port,address:"127.0.0.1" as const,binary:process.execPath,sha256:await sha256File(process.execPath)};
  try{
    const owner=await verifyWindowsLoopbackOwner(args);
    expect(owner.pid).toBe(process.pid);
    const cliArgs=["--import","tsx",path.resolve("src/cli.ts"),"--pair-jumper",process.execPath,"--jumper-sha256",args.sha256,"--jumper-port",String(args.port)];
    const paired=await runProcess(process.execPath,cliArgs,{timeoutMs:15000,maxOutputBytes:8192});
    expect(paired.exitCode).toBe(0);
    expect(JSON.parse(paired.stdout)).toMatchObject({provider:"jumper",owner:{identity:owner.identity,sha256:args.sha256}});
    const invalid=await runProcess(process.execPath,[...cliArgs,"--doctor"],{timeoutMs:15000,maxOutputBytes:8192});
    expect(invalid.exitCode).toBe(1);expect(invalid.stdout).toBe("");
    const options={baseUrl:`http://127.0.0.1:${address.port}/api/v1`,licenseKey:"fixture-license",allowedRoots:[process.cwd()],owner:{binary:process.execPath,sha256:args.sha256,identity:owner.identity}};
    const client=new JumperReadClient(options);
    // Mutation of pairing configuration after construction must not affect dispatch.
    options.owner.identity="1:2000-01-01T00:00:00.000Z";
    const search={query:"fixture",cacheDirectory:process.cwd(),mediaPaths:[path.resolve("package.json")]};
    expect(await client.searchText(search)).toMatchObject({matches:[]});
    expect(requests).toBe(1);expect(license).toBe("fixture-license");
    const mcp=createMcpServer(loadConfig({AVID_MCP_ALLOWED_ROOTS:process.cwd(),AVID_MCP_JUMPER_URL:options.baseUrl,AVID_MCP_JUMPER_LICENSE_KEY:"fixture-license",AVID_MCP_JUMPER_BINARY:process.execPath,AVID_MCP_JUMPER_SHA256:args.sha256,AVID_MCP_JUMPER_IDENTITY:owner.identity}));
    const mcpClient=new Client({name:"paired-provider-test",version:"1.0"});
    const [left,right]=InMemoryTransport.createLinkedPair();
    await Promise.all([mcp.connect(right),mcpClient.connect(left)]);
    try{
      const result=await mcpClient.callTool({name:"avid_jumper_read",arguments:{operation:"search",...search}});
      expect(result.isError).not.toBe(true);expect(result.structuredContent).toMatchObject({ok:true,data:{matches:[],imagesOmitted:true}});
      const transcript=await mcpClient.callTool({name:"avid_jumper_read",arguments:{operation:"transcript",...search,speaker:"Anna"}});
      expect(transcript.isError).not.toBe(true);expect(transcript.structuredContent).toMatchObject({ok:true,data:{matches:[],speakerBasis:"transcript-local labels, not face identities"}});
    }finally{await mcpClient.close();await mcp.close();}
    expect(requests).toBe(3);
    const refused=new JumperReadClient(options);
    await expect(refused.searchText(search)).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
    expect(requests).toBe(3);
    await expect(verifyWindowsLoopbackOwner({...args,sha256:"0".repeat(64)})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
    await expect(verifyWindowsLoopbackOwner({...args,expectedIdentity:"different-process"})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
},40000);
