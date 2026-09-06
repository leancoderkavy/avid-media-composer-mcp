import {z} from "zod";
import {AvidMcpError} from "../errors.js";
import {resolveReadablePath} from "../security/path-policy.js";
import {verifyWindowsLoopbackOwner} from "./loopback-owner.js";

const matchSchema=z.object({
  frame_idx:z.string().regex(/^\d+$/).max(20),timestamp:z.string().max(32),
  scene_start_timestamp:z.string().max(32),scene_end_timestamp:z.string().max(32),
  original_index:z.number().int().nonnegative(),hash_str:z.string().max(256),video_path:z.string().max(32768),
});
const responseSchema=z.object({matches:z.array(matchSchema).max(100)});
const fail=(code:string,message:string)=>new AvidMcpError(`JUMPER_${code}`,message);
interface JumperOptions {baseUrl?:string;licenseKey:string;allowedRoots:readonly string[];timeoutMs?:number;maxResponseBytes?:number;owner?:{binary:string;sha256:string;identity:string}}

/** Optional licensed provider. No SDK, model downloads, analysis writes or image output. */
export class JumperReadClient {
  private readonly base:string;
  private readonly options:Readonly<JumperOptions>;
  constructor(options:JumperOptions){
    const base=new URL(options.baseUrl??"http://127.0.0.1:6699/api/v1");
    if(base.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(base.hostname)||base.username||base.password||base.search||base.hash||base.pathname!=="/api/v1")throw fail("ENDPOINT","Provider must use a literal loopback HTTP address and /api/v1 path");
    if(!options.licenseKey.trim()||/[\r\n]/.test(options.licenseKey))throw fail("LICENSE","A local provider license key is required");
    for(const [name,value,min,max] of [["timeout",options.timeoutMs??10000,1,120000],["response limit",options.maxResponseBytes??8*1024*1024,1024,32*1024*1024]] as const){
      if(!Number.isSafeInteger(value)||value<min||value>max)throw fail("LIMIT",`Invalid ${name}`);
    }
    this.base=base.href;
    this.options=Object.freeze({...options,allowedRoots:Object.freeze([...options.allowedRoots]),...(options.owner?{owner:Object.freeze({...options.owner})}:{})});
  }
  private async request(endpoint:"/health"|"/search/text",body?:unknown):Promise<unknown>{
    if(this.options.owner){
      const url=new URL(this.base);
      await verifyWindowsLoopbackOwner({port:Number(url.port||80),address:url.hostname==="[::1]"?"::1":"127.0.0.1",binary:this.options.owner.binary,sha256:this.options.owner.sha256,expectedIdentity:this.options.owner.identity});
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??10000);
    try{
      const response=await fetch(this.base+endpoint,{method:body===undefined?"GET":"POST",redirect:"error",signal:controller.signal,
        headers:{accept:"application/json",...(body===undefined?{}:{"content-type":"application/json","X-License-Key":this.options.licenseKey})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok){await response.body?.cancel();throw fail("HTTP",`Provider returned HTTP ${response.status}`);}
      if(response.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json"){await response.body?.cancel();throw fail("CONTENT_TYPE","Provider did not return JSON");}
      if(!response.body)throw fail("BODY","Provider response is empty");
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;
        if(size>(this.options.maxResponseBytes??8*1024*1024)){await reader.cancel();throw fail("SIZE","Provider response exceeds configured bound");}chunks.push(item.value);
      }}finally{reader.releaseLock();}
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    }catch(error){
      if(error instanceof AvidMcpError)throw error;
      // Never propagate provider bodies, transport URLs or potentially echoed keys.
      throw fail("REQUEST","Provider request failed or returned invalid JSON");
    }finally{clearTimeout(timer);}
  }
  async health(){
    const result=z.object({status:z.literal("ok")}).safeParse(await this.request("/health"));
    if(!result.success)throw fail("SCHEMA","Provider health response does not match the public contract");
    return {status:result.data.status,provider:"jumper",runtimeVersionVerified:false};
  }
  async searchText(input:{query:string;cacheDirectory:string;mediaPaths:string[];limit?:number}){
    const args=z.object({query:z.string().trim().min(1).max(4096),cacheDirectory:z.string().min(1),mediaPaths:z.array(z.string().min(1)).min(1).max(100),limit:z.number().int().min(1).max(100).default(50)}).parse(input);
    const cache=await resolveReadablePath(args.cacheDirectory,this.options.allowedRoots,"directory");
    const media=[...new Set(await Promise.all(args.mediaPaths.map(file=>resolveReadablePath(file,this.options.allowedRoots,"file"))))];
    const parsed=responseSchema.safeParse(await this.request("/search/text",{query:args.query,cache_dir:cache,media_paths:media,max_results:args.limit,search_all:false}));
    if(!parsed.success||parsed.data.matches.length>args.limit)throw fail("SCHEMA","Provider search response does not match the bounded public contract");
    const matches=[];
    for(const match of parsed.data.matches){
      const file=await resolveReadablePath(match.video_path,this.options.allowedRoots,"file");
      if(!media.includes(file))throw fail("SCOPE","Provider returned media outside the requested selection");
      matches.push({...match,video_path:file});
    }
    return {provider:"jumper",matches,imagesOmitted:true,scoreAvailable:false,indexBasis:"one frame per second; not source edit frames",runtimeVersionVerified:false};
  }
}
