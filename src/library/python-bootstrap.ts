import {writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
export const PIP_VERSION="26.2.1";
const asset={name:"pip-26.2.1-py3-none-any.whl",bytes:1816632,sha256:"71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e",url:"https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl"};
/** Explicit installation only: hash verification precedes executing wheel code. */
export async function preparePipWheel(directory:string){
  const response=await fetch(asset.url,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw new Error("Pip bootstrap download failed");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>asset.bytes)throw new Error("Pip wheel exceeds expected size");chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}
  const bytes=Buffer.concat(chunks,total);if(total!==asset.bytes||createHash("sha256").update(bytes).digest("hex")!==asset.sha256)throw new Error("Pip wheel checksum/size mismatch");
  const file=path.join(directory,asset.name);await writeFile(file,bytes,{flag:"wx",mode:0o600});return file;
}
