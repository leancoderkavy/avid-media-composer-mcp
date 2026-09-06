import {it,expect} from "vitest";
import {createServer,createConnection,type Socket} from "node:net";
import {once} from "node:events";
import {verifyWindowsLoopbackOwner,verifyWindowsLoopbackConnection} from "../src/integrations/loopback-owner.js";
import {sha256File} from "../src/analysis/file-inventory.js";

it.skipIf(process.platform!=="win32")("verifies the accepted tuple before releasing bytes and refuses stale identity",async()=>{
 let received=0;const accepted=new Set<Socket>();
 const server=createServer(socket=>{accepted.add(socket);socket.on("close",()=>accepted.delete(socket));socket.on("data",chunk=>{received+=chunk.length;});});
 server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();if(!address||typeof address==="string")throw new Error("Missing socket address");
 let socket:Socket|undefined;
 try{
  const input={port:address.port,address:"127.0.0.1" as const,binary:process.execPath,sha256:await sha256File(process.execPath)};
  const owner=await verifyWindowsLoopbackOwner(input);
  socket=createConnection({host:"127.0.0.1",port:address.port});await once(socket,"connect");const peerPort=socket.localPort!;
  const verified=await verifyWindowsLoopbackConnection({...input,peerPort,expectedIdentity:owner.identity});expect(verified.pid).toBe(process.pid);expect(verified.peerPort).toBe(peerPort);expect(received).toBe(0);
  await expect(verifyWindowsLoopbackConnection({...input,peerPort,expectedIdentity:"1:2000-01-01T00:00:00.000Z"})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});expect(received).toBe(0);
  const closed=once(socket,"close");socket.destroy();await closed;
  await expect(verifyWindowsLoopbackConnection({...input,peerPort,expectedIdentity:owner.identity})).rejects.toMatchObject({code:"PROVIDER_OWNER_UNVERIFIED"});
 }finally{socket?.destroy();for(const current of accepted)current.destroy();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
},120000);
