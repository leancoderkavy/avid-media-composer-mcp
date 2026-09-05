import path from "node:path";import * as z from "zod/v4";import {runProcess} from "../process.js";
export const speakerOwner=z.object({schema:z.literal(1),analysisId:z.string().uuid(),id:z.string().regex(/^[a-f0-9]{64}$/),pid:z.number().int().positive(),executables:z.array(z.string().min(1).max(255).refine(value=>path.basename(value)===value&&!/[\\/]/.test(value))).min(1).max(3)}).strict();
export async function assertSpeakerStopped(directory:string,owner:z.infer<typeof speakerOwner>){
 if(process.platform!=="win32")throw new Error("Speaker cleanup requires Windows process qualification");
 try{process.kill(owner.pid,0);throw new Error("Speaker owner process is still present; cleanup refused");}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error;}
 const quoted=(value:string)=>"'"+value.replaceAll("'","''")+"'",names=owner.executables.map(quoted).join(","),target=quoted(directory);
 const script=`$ErrorActionPreference='Stop'; $names=@(${names}); $processes=@(Get-CimInstance Win32_Process); if(@($processes | Where-Object { $_.Name -in $names -and -not $_.CommandLine }).Count -gt 0){throw 'Relevant process command line unavailable'}; @($processes | Where-Object {  $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf(${target},[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count`;
 const result=await runProcess("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{timeoutMs:15000,maxOutputBytes:4096});
 if(result.exitCode!==0||!/^\d+$/.test(result.stdout.trim()))throw new Error("Speaker writer process state unavailable; files retained");if(Number(result.stdout.trim())!==0)throw new Error("A process references the speaker directory; files retained");
}
