import {open} from "node:fs/promises";

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
