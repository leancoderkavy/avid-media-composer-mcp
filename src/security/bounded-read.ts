import {open,stat} from "node:fs/promises";
import {createHash} from "node:crypto";

/** Bounded-memory hash of one descriptor; refuse detectable writes or path replacement during the read. */
export async function hashBoundedFile(file:string,maxBytes:number){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid hash limit');
  const handle=await open(file,'r');
  try{
    const before=await handle.stat({bigint:true});
    if(!before.isFile()||before.size>BigInt(maxBytes))throw new Error('File exceeds hash limit or is not a regular file');
    const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let bytes=0;
    while(bytes<=maxBytes){
      const read=await handle.read(buffer,0,Math.min(buffer.length,maxBytes+1-bytes),null);
      if(!read.bytesRead)break;
      bytes+=read.bytesRead;if(bytes>maxBytes)throw new Error('File grew beyond hash limit');
      hash.update(buffer.subarray(0,read.bytesRead));
    }
    const after=await handle.stat({bigint:true}),current=await stat(file,{bigint:true});
    for(const candidate of [after,current])if(['dev','ino','size','mtimeNs','ctimeNs'].some(key=>before[key as keyof typeof before]!==candidate[key as keyof typeof candidate]))throw new Error('File changed while hashing');
    if(BigInt(bytes)!==before.size)throw new Error('File length changed while hashing');
    return {sha256:hash.digest('hex'),bytes};
  }finally{await handle.close();}
}

/** Size checks and reads share one descriptor; growth cannot exceed the byte budget. */
export async function readBoundedFile(file:string,maxBytes:number):Promise<Buffer>{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error("Invalid read limit");
  const handle=await open(file,"r");
  try{
    const info=await handle.stat();
    if(!info.isFile()||info.size>maxBytes)throw new Error("File exceeds read limit or is not a regular file");
    const chunks:Buffer[]=[];let total=0;
    while(total<=maxBytes){
      const buffer=Buffer.alloc(Math.min(65536,maxBytes+1-total));
      const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
      if(!bytesRead)break;
      total+=bytesRead;if(total>maxBytes)throw new Error("File grew beyond read limit");
      chunks.push(buffer.subarray(0,bytesRead));
    }
    return Buffer.concat(chunks,total);
  }finally{await handle.close();}
}
export async function readBoundedJson(file:string,maxBytes:number):Promise<unknown>{return JSON.parse((await readBoundedFile(file,maxBytes)).toString("utf8"));}
