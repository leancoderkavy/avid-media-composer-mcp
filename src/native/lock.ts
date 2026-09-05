import { mkdir, open, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {AvidMcpError} from "../errors.js";

export class NativeExportUncertain extends AvidMcpError {
  constructor(output:string,cause:string){super("NATIVE_EXPORT_UNCERTAIN","Export outcome requires inspection; native write lock retained. Do not replay the export.",{output,cause});}
}

export async function withNativeLock<T>(operation: () => Promise<T>): Promise<T> {
  const directory = path.join(os.homedir(), ".avid-mcp");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "native-write.lock");
  // An abandoned lock requires inspection, never timeout-based stealing.
  const handle = await open(file, "wx", 0o600);
  let retain=false;
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await operation();
  } catch(error) {
    if(error instanceof NativeExportUncertain){retain=true;await handle.writeFile("\n"+JSON.stringify({state:"export-unresolved",...error.details}));await handle.sync();}
    throw error;
  } finally {
    await handle.close();
    if(!retain)await unlink(file);
  }
}
