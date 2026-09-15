import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const INSTALLATION_ID_FILE = "avid-mcp-installation-id";

async function tryReadInstallationId(configDir: string): Promise<string | null> {
  try {
    const content = await readFile(join(configDir, INSTALLATION_ID_FILE), "utf8");
    const trimmed = content.trim();
    if (trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

async function tryWriteInstallationId(configDir: string, id: string): Promise<boolean> {
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, INSTALLATION_ID_FILE), `${id}\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export interface InstallationIdOptions {
  configDirs?: string[];
}

export async function getOrCreateInstallationId(
  options: InstallationIdOptions = {},
): Promise<string> {
  const configDirs =
    options.configDirs ||
    [
      join(homedir(), ".config", "avid-media-composer-mcp"),
      join(tmpdir(), "avid-media-composer-mcp"),
    ];

  for (const configDir of configDirs) {
    const existing = await tryReadInstallationId(configDir);
    if (existing) return existing;
  }

  const newId = randomUUID();

  for (const configDir of configDirs) {
    if (await tryWriteInstallationId(configDir, newId)) {
      return newId;
    }
  }

  return newId;
}
