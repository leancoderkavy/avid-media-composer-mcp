import path from "node:path";
import {opendir} from "node:fs/promises";
import * as z from "zod/v4";
import {resolveReadablePath} from "../security/path-policy.js";
import {edlCutContract,verifyEdlCuts} from "./edl-verifier.js";

/** Complete bounded filename inventory, not an atomic filesystem snapshot. */
export async function inventoryEdlDirectory(directory:string,allowedRoots:readonly string[],maxEntries=4096){
  z.number().int().min(1).max(4096).parse(maxEntries);
  const root=await resolveReadablePath(directory,[...allowedRoots],"directory");
  const entries:string[]=[];
  const handle=await opendir(root);
  for await(const entry of handle){
    if(entries.length>=maxEntries)throw new Error("EDL export directory inventory exceeds its limit; export must not proceed");
    if(entry.isSymbolicLink())throw new Error("EDL export directory contains a symbolic link; export must not proceed");
    if(!entry.isFile()&&!entry.isDirectory())throw new Error("EDL export directory contains an unsupported entry");
    entries.push(path.join(root,entry.name));
  }
  return {directory:root,existingPaths:entries.sort(),scope:"Complete names from one bounded directory scan; not atomic or a content-preservation guarantee."};
}

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
