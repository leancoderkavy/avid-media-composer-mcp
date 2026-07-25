import { access } from "node:fs/promises";
import path from "node:path";
import type { AvidPlatform } from "./releases.js";

export interface AvidInstallationCandidate {
  platform: AvidPlatform;
  path: string;
  source: "environment" | "standard-location";
  exists: boolean;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function detectInstallations(
  platform: AvidPlatform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ platform: AvidPlatform; candidates: AvidInstallationCandidate[]; detected: string[] }> {
  const configured = env.AVID_MCP_APPLICATION_PATH?.trim();
  const paths =
    platform === "windows"
      ? [
          ...(configured ? [{ path: path.resolve(configured), source: "environment" as const }] : []),
          {
            path: path.join(
              env.ProgramFiles ?? "C:\\Program Files",
              "Avid",
              "Avid Media Composer",
              "AvidMediaComposer.exe",
            ),
            source: "standard-location" as const,
          },
          {
            path: path.join(
              env.ProgramFiles ?? "C:\\Program Files",
              "Avid",
              "Avid Media Composer",
              "Avid Media Composer.exe",
            ),
            source: "standard-location" as const,
          },
        ]
      : [
          ...(configured ? [{ path: path.resolve(configured), source: "environment" as const }] : []),
          {
            path: "/Applications/Avid Media Composer/AvidMediaComposer.app",
            source: "standard-location" as const,
          },
          {
            path: "/Applications/Avid Media Composer.app",
            source: "standard-location" as const,
          },
        ];
  const unique = [...new Map(paths.map((item) => [item.path, item])).values()];
  const candidates = await Promise.all(
    unique.map(async (candidate) => ({
      platform,
      ...candidate,
      exists: await exists(candidate.path),
    })),
  );
  return {
    platform,
    candidates,
    detected: candidates.filter((candidate) => candidate.exists).map((candidate) => candidate.path),
  };
}
