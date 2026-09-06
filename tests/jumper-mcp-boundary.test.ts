import {expect,it,vi} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {createServer} from "../src/server.js";
import {loadConfig} from "../src/config.js";
import {verifyWindowsLoopbackOwner} from "../src/integrations/loopback-owner.js";

vi.mock("../src/integrations/loopback-owner.js",()=>({verifyWindowsLoopbackOwner:vi.fn(()=>{throw new Error("Unexpected listener inspection");})}));

it.each([
  {name:"missing reference",capabilities:"inspect",partial:false,args:{operation:"image",cacheDirectory:process.cwd(),mediaPaths:["package.json"]},message:"Reference search requires"},
  {name:"missing frame time",capabilities:"inspect",partial:false,args:{operation:"frame",referencePath:"package.json",cacheDirectory:process.cwd(),mediaPaths:["package.json"]},message:"Frame search requires timeSeconds"},
  {name:"time on image",capabilities:"inspect",partial:false,args:{operation:"image",referencePath:"package.json",timeSeconds:0,cacheDirectory:process.cwd(),mediaPaths:["package.json"]},message:"Image search does not accept timeSeconds"},
  {name:"reference on text",capabilities:"inspect",partial:false,args:{operation:"search",referencePath:"package.json",query:"scene",cacheDirectory:process.cwd(),mediaPaths:["package.json"]},message:"Reference fields require"},
  {name:"authority",capabilities:"export",partial:false,args:{operation:"health"},message:"CAPABILITY_DENIED"},
  {name:"partial configuration",capabilities:"inspect",partial:true,args:{operation:"health"},message:"JUMPER_CONFIG"},
  {name:"health with search fields",capabilities:"inspect",partial:false,args:{operation:"health",query:"scene"},message:"Health does not accept search fields"},
  {name:"missing search scope",capabilities:"inspect",partial:false,args:{operation:"search",query:"scene"},message:"Search requires"},
  {name:"empty media list",capabilities:"inspect",partial:false,args:{operation:"search",query:"scene",cacheDirectory:process.cwd(),mediaPaths:[]},message:""},
  {name:"excessive results",capabilities:"inspect",partial:false,args:{operation:"search",query:"scene",cacheDirectory:process.cwd(),mediaPaths:["package.json"],limit:101},message:""},
])("rejects $name before listener inspection and suppresses credentials",async test=>{
  vi.mocked(verifyWindowsLoopbackOwner).mockClear();
  const env={AVID_MCP_CAPABILITIES:test.capabilities,AVID_MCP_ALLOWED_ROOTS:process.cwd(),AVID_MCP_JUMPER_LICENSE_KEY:"private-fixture-license",
    ...(!test.partial?{AVID_MCP_JUMPER_BINARY:process.execPath,AVID_MCP_JUMPER_SHA256:"a".repeat(64),AVID_MCP_JUMPER_IDENTITY:"1:2000-01-01T00:00:00Z"}:{})};
  const server=createServer(loadConfig(env)),client=new Client({name:"provider-boundary-test",version:"1.0"});
  const [left,right]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(right),client.connect(left)]);
  try{
    const result=await client.callTool({name:"avid_jumper_read",arguments:test.args});
    expect(result.isError).toBe(true);
    const serialized=JSON.stringify(result);
    expect(serialized).not.toContain("private-fixture-license");
    if(test.message)expect(serialized).toContain(test.message);
    expect(verifyWindowsLoopbackOwner).not.toHaveBeenCalled();
    expect((await client.callTool({name:"avid_ping",arguments:{}})).isError).not.toBe(true);
  }finally{await client.close();await server.close();}
});
