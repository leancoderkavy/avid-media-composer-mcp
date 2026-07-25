import { spawn } from "node:child_process";
import { AvidMcpError } from "./errors.js";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
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
    let timedOut = false;

    const finishWithError = (error: AvidMcpError): void => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };

    const collect = (target: Buffer[], chunk: Buffer): void => {
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
      timedOut = true;
      finishWithError(
        new AvidMcpError("PROCESS_TIMEOUT", `Process exceeded ${options.timeoutMs}ms`, {
          executable,
        }),
      );
    }, options.timeoutMs);
    timer.unref();

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      finishWithError(
        new AvidMcpError(
          error.code === "ENOENT" ? "EXECUTABLE_NOT_FOUND" : "PROCESS_START_FAILED",
          `Could not start ${executable}: ${error.message}`,
          { executable, code: error.code },
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled || timedOut) return;
      settled = true;
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
