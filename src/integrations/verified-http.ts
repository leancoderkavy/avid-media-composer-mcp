import {Agent, request} from "node:http";
import {createConnection} from "node:net";
import {AvidMcpError} from "../errors.js";

/** A fresh socket is withheld from HTTP until its accepted peer is verified. */
export async function verifiedHttpJson(input:{url:URL;body?:string;licenseKey:string;timeoutMs:number;maxResponseBytes:number;verify:(peerPort:number)=>Promise<unknown>}):Promise<unknown>{
  const fail=(code:string,message:string)=>new AvidMcpError(`JUMPER_${code}`,message);
  const agent=new Agent({keepAlive:false});
  const controller=new AbortController();
  let socket:ReturnType<typeof createConnection>|undefined;
  const timer=setTimeout(()=>controller.abort(),input.timeoutMs);
  agent.createConnection=(_options,callback)=>{
    // Returning undefined prevents ClientRequest from flushing buffered headers.
    socket=createConnection({host:input.url.hostname.replace(/^\[|\]$/g,""),port:Number(input.url.port||80)});
    const connected=socket;
    let settled=false;
    const finish=(error:Error|null)=>{
      if(settled)return;
      settled=true;
      if(error)connected.destroy();
      callback?.(error,connected);
    };
    connected.once("error",error=>finish(error));
    connected.once("close",()=>finish(new Error("Connection closed before verification")));
    controller.signal.addEventListener("abort",()=>{connected.destroy();finish(new Error("Request expired"));},{once:true});
    connected.once("connect",()=>{
      void Promise.resolve().then(()=>input.verify(connected.localPort!)).then(()=>{
        if(controller.signal.aborted||connected.destroyed)finish(new Error("Connection expired"));
        else finish(null);
      },error=>finish(error instanceof Error?error:new Error("Verification failed")));
    });
    return undefined;
  };
  try{
    return await new Promise<unknown>((resolve,reject)=>{
      const req=request(input.url,{agent,signal:controller.signal,method:input.body===undefined?"GET":"POST",headers:{accept:"application/json",...(input.body===undefined?{}:{"content-type":"application/json","X-License-Key":input.licenseKey})}},res=>{
        const refuse=(error:Error)=>{reject(error);res.destroy();};
        if(!res.statusCode||res.statusCode<200||res.statusCode>=300){refuse(fail("HTTP",`Provider returned HTTP ${res.statusCode}`));return;}
        if(res.headers["content-type"]?.split(";",1)[0]?.trim().toLowerCase()!=="application/json"){refuse(fail("CONTENT_TYPE","Provider did not return JSON"));return;}
        const chunks:Buffer[]=[];let size=0;
        res.on("error",reject);
        res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>input.maxResponseBytes)refuse(fail("SIZE","Provider response exceeds configured bound"));else chunks.push(chunk);});
        res.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch(error){reject(error);}});
      });
      req.on("error",reject);
      req.end(input.body);
    });
  }catch(error){
    if(error instanceof AvidMcpError)throw error;
    throw fail("REQUEST","Provider request failed or returned invalid JSON");
  }finally{clearTimeout(timer);socket?.destroy();agent.destroy();}
}
