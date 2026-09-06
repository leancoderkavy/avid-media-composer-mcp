import {expect,it} from "vitest";
import {createServer} from "node:http";
import type {Socket} from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {verifiedHttpJson} from "../src/integrations/verified-http.js";

async function fixture(port=0){
  let bytes=0,requests=0,received="",license:unknown;
  const sockets=new Set<Socket>();
  const server=createServer((req,res)=>{
    requests++;license=req.headers["x-license-key"];
    req.on("data",chunk=>received+=chunk);
    req.on("end",()=>{
      if(req.url==="/redirect"){res.writeHead(302,{location:"/ok"});res.end();return;}
      res.setHeader("content-type",req.url==="/mime"?"text/plain":"application/json");
      if(req.url==="/stall"){res.write('{"pending":');return;}
      res.end(req.url==="/large"?'"'+"x".repeat(2048)+'"':req.url==="/invalid"?"secret-not-json":'{"ok":true}');
    });
  });
  server.on("connection",socket=>{sockets.add(socket);socket.on("data",chunk=>bytes+=chunk.length);socket.on("close",()=>sockets.delete(socket));});
  await new Promise<void>(resolve=>server.listen(port,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("No address");
  return {call:(verify:(port:number)=>Promise<unknown>,route="/ok",timeoutMs=2000)=>verifiedHttpJson({url:new URL(`http://127.0.0.1:${address.port}${route}`),body:'{"private":"query"}',licenseKey:"fixture-secret",timeoutMs,maxResponseBytes:1024,verify}),
    port:address.port,state:()=>({bytes,requests,received,license,sockets:sockets.size}),
    close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

it("withholds headers and body until verification and uses the same accepted socket",async()=>{
  const f=await fixture();let approve!:()=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>started=resolve);
  try{
    const result=f.call(async port=>{expect(port).toBeGreaterThan(0);started();await new Promise<void>(resolve=>approve=resolve);});
    await began;await delay(30);
    expect(f.state()).toMatchObject({bytes:0,requests:0,sockets:1});
    approve();expect(await result).toEqual({ok:true});
    expect(f.state()).toMatchObject({requests:1,received:'{"private":"query"}',license:"fixture-secret"});
  }finally{await f.close();}
});

it("does not reconnect or release bytes after the accepted peer closes during verification",async()=>{
  const original=await fixture();let replacement:Awaited<ReturnType<typeof fixture>>|undefined;
  let approve!:()=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>started=resolve);
  try{
    const result=original.call(async()=>{started();await new Promise<void>(resolve=>approve=resolve);});
    // Attach rejection handling before closing the socket.
    const rejected=expect(result).rejects.toMatchObject({code:"JUMPER_REQUEST"});
    await began;
    await original.close();
    replacement=await fixture(original.port);
    approve();await rejected;await delay(30);
    expect(original.state()).toMatchObject({bytes:0,requests:0});
    expect(replacement.state()).toMatchObject({bytes:0,requests:0,sockets:0});
    expect(await replacement.call(async()=>{})).toEqual({ok:true});
  }finally{await replacement?.close();await original.close();}
});

it("sends zero application bytes on rejection or approval after timeout",async()=>{
  const f=await fixture();let approve!:()=>void;
  try{
    await expect(f.call(async()=>{throw new Error("fixture-secret");})).rejects.toMatchObject({code:"JUMPER_REQUEST",message:"Provider request failed or returned invalid JSON"});
    await expect(f.call(()=>new Promise<void>(resolve=>approve=resolve),"/ok",100)).rejects.toMatchObject({code:"JUMPER_REQUEST"});
    approve();await delay(30);
    expect(f.state()).toMatchObject({bytes:0,requests:0,sockets:0});
  }finally{await f.close();}
});

it("bounds replies, refuses redirects and malformed responses, and recovers after timeout",async()=>{
  const f=await fixture();
  try{
    for(const [route,code] of [["/redirect","HTTP"],["/mime","CONTENT_TYPE"],["/large","SIZE"],["/invalid","REQUEST"],["/stall","REQUEST"]]){
      await expect(f.call(async()=>{},route,200)).rejects.toMatchObject({code:`JUMPER_${code}`});
    }
    expect(await f.call(async()=>{})).toEqual({ok:true});
    expect(f.state().requests).toBe(6);
  }finally{await f.close();}
});
