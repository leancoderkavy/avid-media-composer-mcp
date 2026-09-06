import {terminateWindowsTree,type TreeTermination} from "./process-tree.js";
import { spawn } from "node:child_process";
import { AvidMcpError } from "./errors.js";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BinaryProcessResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}

export interface ProcessOptions {
  timeoutMs: number;
  maxOutputBytes?: number;
  cwd?: string;
}

export function runProcess(
  executable: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  return runBinaryProcess(executable, args, options).then(result => ({...result, stdout: result.stdout.toString("utf8")}));
}

/** Capture exact stdout bytes with the same combined output/time/tree bounds as
 * text execution. Never decode arbitrary media bytes as UTF-8. */
export function runBinaryProcess(
  executable: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<BinaryProcessResult> {
  const maxOutputBytes = options.maxOutputBytes ?? 20 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let failure: AvidMcpError | undefined;
    let treePending=false,closed=false,closedCode:number|null=null;
    let tree:TreeTermination|undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;

    const finishWithError = (error: AvidMcpError): void => {
      if (settled || failure) return;
      failure = error;
      // A kill request is not evidence of exit; wait for close before rejecting.
      const direct=()=>{if(closed)return;child.kill();escalation=setTimeout(()=>{if(!settled&&!closed)child.kill("SIGKILL");},1000);escalation.unref();};
      const request=terminateWindowsTree(child);
      if(!request){direct();return;}
      treePending=true;
      void request.then(outcome=>{tree=outcome;if(!outcome.succeeded)direct();},()=>{tree={method:"windows-taskkill",succeeded:false,reason:"Tree termination failed"};direct();}).finally(()=>{treePending=false;settleClosed();});
    };

    const collect = (target: Buffer[], chunk: Buffer): void => {
      if (failure || settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        finishWithError(
          new AvidMcpError(
            "PROCESS_OUTPUT_LIMIT",
            `Process output exceeded ${maxOutputBytes} bytes`,
            { executable },
          ),
        );
        return;
      }
      target.push(chunk);
    };

    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));

    const timer = setTimeout(() => {
      finishWithError(
        new AvidMcpError("PROCESS_TIMEOUT", `Process exceeded ${options.timeoutMs}ms`, {
          executable,
        }),
      );
    }, options.timeoutMs);
    timer.unref();

    child.on("error", (error: NodeJS.ErrnoException) => {
      const wrapped = new AvidMcpError(
          child.pid ? "PROCESS_RUNTIME_ERROR" : error.code === "ENOENT" ? "EXECUTABLE_NOT_FOUND" : "PROCESS_START_FAILED",
          child.pid ? `Process error for ${executable}: ${error.message}` : `Could not start ${executable}: ${error.message}`,
          { executable, code: error.code },
        );
      if (!child.pid) {
        clearTimeout(timer);
        if (escalation) clearTimeout(escalation);
        if (!settled) { settled = true; reject(wrapped); }
      } else {
        // A failed kill can emit error while the child is still running.
        finishWithError(wrapped);
      }
    });

    const settleClosed=()=>{
      if(settled||!closed||treePending)return;
      settled = true;
      if (failure) { reject(tree?new AvidMcpError(failure.code,failure.message,{...failure.details,treeTermination:tree}):failure); return; }
      resolve({
        exitCode: closedCode ?? -1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    };
    child.on("close",code=>{closed=true;closedCode=code;clearTimeout(timer);if(escalation)clearTimeout(escalation);settleClosed();});
  });
}
