import path from "node:path";
import * as z from "zod/v4";
import {resolveReadablePath} from "../security/path-policy.js";
import {edlCutContract,verifyEdlCuts} from "./edl-verifier.js";

/** Post-dispatch verification only; it cannot authorize where Avid writes beforehand. */
export async function verifyNativeEdlOutput(directory:string,response:unknown,existingPaths:string[],contract:z.infer<typeof edlCutContract>){
  z.array(z.string().min(1).max(32768)).max(4096).parse(existingPaths);
  const root=await resolveReadablePath(directory,[directory],"directory");
  const bodies=z.array(z.object({path:z.string().min(1).max(32768),dialog_contents:z.array(z.string()).max(32).optional()}).strict()).length(1).parse(response);
  const body=bodies[0]!;
  if(body.dialog_contents?.some(value=>value.trim()))throw new Error("Native EDL export reported a dialog; inspect before another attempt");
  if(!path.isAbsolute(body.path))throw new Error("Native EDL output must be absolute");
  const output=await resolveReadablePath(body.path,[root],"file");
  if(path.dirname(output)!==root||path.extname(output).toLowerCase()!==".edl")throw new Error("Native EDL output must be an EDL file directly inside the authorized export directory");
  const key=(file:string)=>process.platform==="win32"?path.resolve(file).toLowerCase():path.resolve(file);
  if(existingPaths.some(file=>key(file)===key(output)))throw new Error("Native EDL output existed before export; new artifact identity is unverified");
  return {output,...await verifyEdlCuts(output,contract)};
}
