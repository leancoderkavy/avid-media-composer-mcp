import {opendir} from "node:fs/promises";
import type {Dirent} from "node:fs";

/** Select the next lexical entries without retaining the entire directory listing.
 * Enumerates the directory to completion because filesystem iteration is unordered.
 */
export async function directoryPage(directory:string,limit:number,accept:(entry:Dirent)=>boolean,signal?:AbortSignal){
  if(!Number.isInteger(limit)||limit<1||limit>10001)throw new Error("Directory page limit must be 1–10001");
  signal?.throwIfAborted();
  const heap:Dirent[]=[];
  for await(const entry of await opendir(directory,{bufferSize:32})){
    signal?.throwIfAborted();
    if(!accept(entry))continue;
    if(heap.length<limit){
      heap.push(entry);let index=heap.length-1;
      while(index>0){const parent=Math.floor((index-1)/2);if(heap[parent]!.name>=heap[index]!.name)break;[heap[parent],heap[index]]=[heap[index]!,heap[parent]!];index=parent;}
    }else if(entry.name<heap[0]!.name){
      heap[0]=entry;let index=0;
      for(;;){
        const left=index*2+1,right=left+1;if(left>=heap.length)break;
        const larger=right<heap.length&&heap[right]!.name>heap[left]!.name?right:left;
        if(heap[index]!.name>=heap[larger]!.name)break;
        [heap[index],heap[larger]]=[heap[larger]!,heap[index]!];index=larger;
      }
    }
  }
  signal?.throwIfAborted();
  return heap.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
