import { access } from "node:fs/promises";
import path from "node:path";
import type { AvidPlatform } from "./releases.js";

export interface AvidInstallationCandidate {
  platform: AvidPlatform;
  path: string;
  source: "environment" | "standard-location";
  /** Whether this candidate is an application bundle rather than an executable. */
  applicationBundle: boolean;
  exists: boolean;
}

export async function detectInstallations(
  platform: AvidPlatform,
  env: NodeJS.ProcessEnv = process.env,
  accessPath: (candidate: string) => Promise<unknown> = access,
): Promise<{ platform: AvidPlatform; candidates: AvidInstallationCandidate[]; detected: string[] }> {
  const configured = env.AVID_MCP_APPLICATION_PATH?.trim();
  const paths =
    platform === "windows"
      ? [
          ...(configured
            ? [
                {
                  path: path.resolve(configured),
                  source: "environment" as const,
                  applicationBundle: false,
                },
              ]
            : []),
          {
            path: path.join(
              env.ProgramFiles ?? "C:\\Program Files",
              "Avid",
              "Avid Media Composer",
              "AvidMediaComposer.exe",
            ),
            source: "standard-location" as const,
            applicationBundle: false,
          },
          {
            path: path.join(
              env.ProgramFiles ?? "C:\\Program Files",
              "Avid",
              "Avid Media Composer",
              "Avid Media Composer.exe",
            ),
            source: "standard-location" as const,
            applicationBundle: false,
          },
        ]
      : [
          ...(configured
            ? [
                {
                  path: path.resolve(configured),
                  source: "environment" as const,
                  applicationBundle: configured.toLowerCase().endsWith(".app"),
                },
              ]
            : []),
          {
            path: "/Applications/Avid Media Composer/AvidMediaComposer.app",
            source: "standard-location" as const,
            applicationBundle: true,
          },
          {
            path: "/Applications/Avid Media Composer.app",
            source: "standard-location" as const,
            applicationBundle: true,
          },
        ];
  const unique = [...new Map(paths.map((item) => [item.path, item])).values()];
  const candidates = await Promise.all(
    unique.map(async (candidate) => ({
      platform,
      ...candidate,
      exists: await existsWith(candidate.path, accessPath),
    })),
  );
  return {
    platform,
    candidates,
    detected: candidates.filter((candidate) => candidate.exists).map((candidate) => candidate.path),
  };
}

async function existsWith(
  candidate: string,
  accessPath: (candidate: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    await accessPath(candidate);
    return true;
  } catch {
    return false;
  }
}
