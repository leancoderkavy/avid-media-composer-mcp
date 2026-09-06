import path from "node:path";
import {realpath} from "node:fs/promises";
import {z} from "zod";
import {runProcess} from "../process.js";
import {sha256File} from "../analysis/file-inventory.js";
import {AvidMcpError} from "../errors.js";

const ownerSchema=z.object({path:z.string().min(1),pid:z.number().int().positive(),started:z.string().datetime({offset:true})});
const fail=(message:string)=>new AvidMcpError("PROVIDER_OWNER_UNVERIFIED",message);

/** Windows preflight evidence, not cryptographic authentication of an HTTP connection. */
export async function verifyWindowsLoopbackOwner(input:{port:number;address:"127.0.0.1"|"::1";binary:string;sha256:string;expectedIdentity?:string}){
  if(process.platform!=="win32")throw fail("Listener ownership verification is Windows-only");
  if(!Number.isInteger(input.port)||input.port<1||input.port>65535||!["127.0.0.1","::1"].includes(input.address)||!path.isAbsolute(input.binary)||!/^[a-f0-9]{64}$/.test(input.sha256))throw fail("Invalid listener qualification parameters");
  const configured=await realpath(input.binary);
  const result=await runProcess("powershell.exe",["-NoProfile","-NonInteractive","-Command",
    `$ErrorActionPreference='Stop'; @(Get-NetTCPConnection -State Listen -LocalPort ${input.port} | Where-Object { $_.LocalAddress -eq '${input.address}' } | ForEach-Object { $p=Get-Process -Id $_.OwningProcess; @{path=$p.Path;pid=$p.Id;started=$p.StartTime.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress`],{timeoutMs:30000,maxOutputBytes:8192});
  if(result.exitCode!==0)throw fail("Cannot identify the configured loopback listener");
  let parsed:unknown;try{parsed=JSON.parse(result.stdout);}catch{throw fail("Listener identity response is invalid");}
  const owners=z.array(ownerSchema).length(1).safeParse(Array.isArray(parsed)?parsed:[parsed]);
  if(!owners.success)throw fail("Expected exactly one qualified listener owner");
  const owner=owners.data[0]!;
  if((await realpath(owner.path)).toLowerCase()!==configured.toLowerCase())throw fail("Listener executable does not match the configured provider");
  if(await sha256File(configured)!==input.sha256)throw fail("Provider executable checksum changed");
  const identity=`${owner.pid}:${owner.started}`;
  if(input.expectedIdentity!==undefined&&identity!==input.expectedIdentity)throw fail("Provider process identity changed");
  return {identity,pid:owner.pid,started:owner.started,binary:configured,sha256:input.sha256,port:input.port,address:input.address};
}
