import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const localPython = path.resolve(
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const executable = existsSync(localPython)
  ? localPython
  : process.env.AVID_MCP_PYTHON || (process.platform === "win32" ? "python" : "python3");
const result = spawnSync(
  executable,
  ["-m", "unittest", "discover", "-s", "python/tests", "-p", "test_*.py"],
  { stdio: "inherit", shell: false, windowsHide: true },
);
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
