import {expect,it} from "vitest";
import {createServer} from "node:http";
import {mkdtemp,writeFile,unlink,rmdir,realpath} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {JumperReadClient,configuredJumperClient} from "../src/integrations/jumper.js";

it("keeps the optional provider disabled or fully paired and rejects partial configuration without leaking keys",()=>{
  expect(configuredJumperClient({},[])).toBeUndefined();
  expect(()=>configuredJumperClient({AVID_MCP_JUMPER_LICENSE_KEY:"private-test-key"},[])).toThrow("Provider configuration requires");
  const env={AVID_MCP_JUMPER_LICENSE_KEY:"private-test-key",AVID_MCP_JUMPER_BINARY:process.execPath,AVID_MCP_JUMPER_SHA256:"a".repeat(64),AVID_MCP_JUMPER_IDENTITY:"1:2000-01-01T00:00:00Z"};
  expect(configuredJumperClient(env,[])).toBeInstanceOf(JumperReadClient);
  expect(()=>configuredJumperClient({...env,AVID_MCP_JUMPER_IDENTITY:""},[])).toThrow("Provider configuration requires");
  expect(()=>new JumperReadClient({licenseKey:"private-test-key",allowedRoots:[],owner:{binary:process.execPath,sha256:"a".repeat(64),identity:undefined as unknown as string}})).toThrow("Provider pairing requires");
});

it("refuses remote, named-host, credential-bearing and altered-path endpoints",()=>{
  for(const baseUrl of ["https://127.0.0.1/api/v1","http://localhost:6699/api/v1","http://example.com/api/v1","http://key@127.0.0.1/api/v1","http://127.0.0.1/api/v1?key=x","http://127.0.0.1/other"]){
    expect(()=>new JumperReadClient({baseUrl,licenseKey:"test",allowedRoots:[]})).toThrow();
  }
});

it("times out stalled bodies and rejects malformed protocol responses without echoing them",async()=>{
  let mode="stall";
  const server=createServer((_req,res)=>{
    res.setHeader("content-type",mode==="type"?"text/application/json-spoof":"application/json; charset=utf-8");
    if(mode==="stall"){res.write('{"status":');return;}
    res.end(mode==="json"?'secret-invalid-json':mode==="schema"?'{"status":"secret-unexpected"}':'{"status":"ok"}');
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("No test address");
  const options={baseUrl:`http://127.0.0.1:${address.port}/api/v1`,licenseKey:"test",allowedRoots:[],timeoutMs:100,maxResponseBytes:1024};
  const client=new JumperReadClient(options);
  // Changing the caller's object after construction must not remove validated bounds.
  options.timeoutMs=120000;options.maxResponseBytes=Infinity;
  try{
    await expect(client.health()).rejects.toMatchObject({code:"JUMPER_REQUEST",message:"Provider request failed or returned invalid JSON"});
    mode="type";await expect(client.health()).rejects.toMatchObject({code:"JUMPER_CONTENT_TYPE"});
    mode="json";await expect(client.health()).rejects.toMatchObject({code:"JUMPER_REQUEST",message:"Provider request failed or returned invalid JSON"});
    mode="schema";await expect(client.health()).rejects.toMatchObject({code:"JUMPER_SCHEMA"});
    mode="normal";expect(await client.health()).toMatchObject({status:"ok"});
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

it("enforces scope, suppresses images and secrets, and bounds real loopback responses",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"avid-jumper-")),file=path.join(root,"clip.mp4"),other=path.join(root,"other.mp4");
  await writeFile(file,"fixture");await writeFile(other,"other");
  let mode="normal",requests=0,healthKey:unknown,posted:Record<string,unknown>|undefined;
  const server=createServer(async(req,res)=>{
    requests++;let body="";for await(const chunk of req)body+=chunk;
    if(mode==="redirect"){res.writeHead(302,{location:"http://127.0.0.1:1/secret"});res.end();return;}
    res.setHeader("content-type","application/json");
    if(mode==="error"){res.statusCode=401;res.end('test-license-secret');return;}
    if(mode==="large"){res.end(JSON.stringify({data:"x".repeat(2000)}));return;}
    if(req.url==="/api/v1/health"){healthKey=req.headers["x-license-key"];res.end('{"status":"ok"}');return;}
    posted=JSON.parse(body);expect(req.headers["x-license-key"]).toBe("test-license-secret");
    if(req.url==="/api/v1/search/transcript"){
      if(mode==="bulk"){
        res.end(JSON.stringify({matches:Array.from({length:5},()=>({media_path:file,hash_str:"crc",start_seconds:2,end_seconds:3,text:"x".repeat(60000),start_timestamp:"00:00:02",end_timestamp:"00:00:03"}))}));return;
      }
      res.end(JSON.stringify({matches:[{...(mode==="unresolved"?{}:{media_path:mode==="scope"?other:file}),hash_str:"crc",start_seconds:2,end_seconds:mode==="reversed"?1:3,text:"hello world",start_timestamp:"00:00:02",end_timestamp:"00:00:03",speaker:"SPEAKER_00",speaker_name:"Anna",license_key:"test-license-secret"}]}));return;
    }
    res.end(JSON.stringify({matches:[{frame_idx:"2",timestamp:"00:00:02",scene_start_timestamp:"00:00:01",scene_end_timestamp:"00:00:03",original_index:0,hash_str:"crc",video_path:mode==="scope"?other:file,image:"private-image",license_key:"test-license-secret"}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("No test address");
  const client=new JumperReadClient({baseUrl:`http://127.0.0.1:${address.port}/api/v1`,licenseKey:"test-license-secret",allowedRoots:[root],maxResponseBytes:1024});
  const search=()=>client.searchText({query:"scene",cacheDirectory:root,mediaPaths:[file],limit:1});
  try{
    expect(await client.health()).toMatchObject({status:"ok",runtimeVersionVerified:false,ownershipPreflight:"not_configured"});expect(healthKey).toBeUndefined();
    const result=await search();expect(result.matches).toHaveLength(1);expect(JSON.stringify(result)).not.toMatch(/private-image|test-license-secret/);
    expect(posted).toMatchObject({search_all:false,max_results:1,media_paths:[await realpath(file)]});
    const transcript=()=>client.searchTranscript({query:"hello",cacheDirectory:root,mediaPaths:[file],limit:1,speaker:"Anna"});
    const spoken=await transcript();expect(spoken.matches[0]).toMatchObject({text:"hello world",start_seconds:2,end_seconds:3});
    expect(JSON.stringify(spoken)).not.toContain("test-license-secret");expect(posted).toMatchObject({search_all:false,speaker:"Anna"});
    mode="unresolved";await expect(transcript()).rejects.toMatchObject({code:"JUMPER_SCHEMA"});
    mode="reversed";await expect(transcript()).rejects.toMatchObject({code:"JUMPER_SCHEMA"});
    mode="scope";await expect(transcript()).rejects.toMatchObject({code:"JUMPER_SCOPE"});mode="normal";
    mode="bulk";
    const largerWireClient=new JumperReadClient({baseUrl:`http://127.0.0.1:${address.port}/api/v1`,licenseKey:"test-license-secret",allowedRoots:[root]});
    await expect(largerWireClient.searchTranscript({query:"hello",cacheDirectory:root,mediaPaths:[file],limit:5})).rejects.toMatchObject({code:"JUMPER_OUTPUT_SIZE"});
    mode="normal";
    const before=requests;await expect(client.searchText({query:"scene",cacheDirectory:root,mediaPaths:[],limit:1})).rejects.toThrow();expect(requests).toBe(before);
    mode="scope";await expect(search()).rejects.toMatchObject({code:"JUMPER_SCOPE"});
    mode="large";await expect(search()).rejects.toMatchObject({code:"JUMPER_SIZE"});
    mode="redirect";await expect(search()).rejects.toMatchObject({code:"JUMPER_REQUEST"});
    mode="error";await expect(search()).rejects.toMatchObject({code:"JUMPER_HTTP",message:"Provider returned HTTP 401"});
  }finally{
    server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await unlink(file);await unlink(other);await rmdir(root);
  }
});
