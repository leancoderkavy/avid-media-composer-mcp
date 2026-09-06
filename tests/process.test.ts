import { describe, expect, it } from "vitest";
import { runProcess, runBinaryProcess } from "../src/process.js";

describe("bounded process execution", () => {
  it("preserves arbitrary PCM bytes including invalid UTF-8 and NUL", async () => {
    const result = await runBinaryProcess(process.execPath,
      ["-e", "process.stdout.write(Buffer.from([0,255,128,192,1,2,3,4]));process.stderr.write('diagnostic')"],
      {timeoutMs: 5000, maxOutputBytes: 64});
    expect(result.stdout).toEqual(Buffer.from([0,255,128,192,1,2,3,4]));
    expect(result.stderr).toBe("diagnostic"); expect(result.exitCode).toBe(0);
  });
  it("bounds binary stdout and stderr together", async () => {
    await expect(runBinaryProcess(process.execPath,
      ["-e", "process.stdout.write(Buffer.alloc(40));process.stderr.write('x'.repeat(40))"],
      {timeoutMs: 5000, maxOutputBytes: 64})).rejects.toMatchObject({code: "PROCESS_OUTPUT_LIMIT"});
  });
  it("captures stdout, stderr, and nonzero exit codes without a shell", async () => {
    const result = await runProcess(
      process.execPath,
      ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"],
      { timeoutMs: 5_000 },
    );
    expect(result).toEqual({ exitCode: 3, stdout: "out", stderr: "err" });
  });

  it("rejects missing executables with a stable code", async () => {
    await expect(
      runProcess("definitely-not-an-avid-mcp-executable", [], { timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "EXECUTABLE_NOT_FOUND" });
  });

  it("terminates processes that exceed output limits", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(2048))"], {
        timeoutMs: 5_000,
        maxOutputBytes: 64,
      }),
    ).rejects.toMatchObject({ code: "PROCESS_OUTPUT_LIMIT" });
  });

  it("terminates processes that exceed time limits", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({ code: "PROCESS_TIMEOUT" });
  });
});
