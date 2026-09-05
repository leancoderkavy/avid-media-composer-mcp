import { mkdir, open, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withNativeLock<T>(operation: () => Promise<T>): Promise<T> {
  const directory = path.join(os.homedir(), ".avid-mcp");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "native-write.lock");
  // An abandoned lock requires inspection, never timeout-based stealing.
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await operation();
  } finally {
    await handle.close();
    await unlink(file);
  }
}
