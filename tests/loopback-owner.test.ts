import {expect,it} from "vitest";
import {createServer} from "node:http";
import {verifyWindowsLoopbackOwner} from "../src/integrations/loopback-owner.js";
import {sha256File} from "../src/analysis/file-inventory.js";

it.skipIf(process.platform!=="win32")("verifies an actual owned listener and refuses changed checksum/process identity",async()=>{
  const server=createServer((_req,res)=>res.end());
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Missing listener");
  const args={port:address.port,address:"127.0.0.1" as const,binary:process.execPath,sha256:await sha256File(process.execPath)};
  try{
    const owner=await verifyWindowsLoopbackOwner(args);
    expect(owner.pid).toBe(process.pid);
    await expect(verifyWindowsLoopbackOwner({...args,sha256:"0".repeat(64)})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
    await expect(verifyWindowsLoopbackOwner({...args,expectedIdentity:"different-process"})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
},40000);
