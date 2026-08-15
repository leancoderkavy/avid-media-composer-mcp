import os from "node:os";

export type AvidPlatform = "windows" | "macos";
export type AvidArchitecture = "x64" | "arm64";
export type CompatibilityStatus = "qualified" | "unqualified" | "unknown";

/**
 * Product-scoped evidence for a compatibility claim. Keeping the product in
 * the record is intentional: several Avid products use similarly shaped
 * version numbers, so a patch number without its product is not evidence.
 */
export interface AvidDocumentationProvenance {
  product: "Media Composer";
  sourceTitle: "Avid Media Composer Documentation and Version Matrix";
  sourceUrl: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087";
  sourceLastUpdated: string;
  retrievedOn: string;
  evidence: {
    releaseLine: string;
    latestPatch: string;
    latestReleaseDate: string;
  };
}

export interface AvidReleaseTrack {
  release: "2025.12" | "2025.6" | "2024.12";
  latestQualifiedPatch: string;
  /** Date on which this repository last checked Avid's version matrix. */
  verifiedOn: string;
  supportTier: "current" | "previous" | "long-term-maintenance";
  extensionSurface: "extensions" | "panel-sdk";
  operatingSystems: {
    windows: Array<{
      version: "10" | "11";
      minimumFeatureUpdate: "22H2";
      editions: ["Professional", "Enterprise"];
    }>;
    macos: Array<{ major: 13 | 14 | 15 | 26; qualifiedThrough: string }>;
  };
  architectures: {
    windows: AvidArchitecture[];
    macos: AvidArchitecture[];
  };
  notes: string[];
  /** @deprecated Use product-scoped provenance.sourceUrl for new consumers. */
  source: string;
  provenance: AvidDocumentationProvenance;
}

export const AVID_RELEASE_TRACKS: readonly AvidReleaseTrack[] = [
  {
    release: "2025.12",
    latestQualifiedPatch: "2025.12.2",
    verifiedOn: "2026-08-15",
    supportTier: "current",
    extensionSurface: "extensions",
    operatingSystems: {
      windows: [
        { version: "11", minimumFeatureUpdate: "22H2", editions: ["Professional", "Enterprise"] },
      ],
      macos: [
        { major: 13, qualifiedThrough: "13.7.x" },
        { major: 14, qualifiedThrough: "14.8.x" },
        { major: 15, qualifiedThrough: "15.7.x" },
        { major: 26, qualifiedThrough: "26.6" },
      ],
    },
    architectures: { windows: ["x64"], macos: ["x64", "arm64"] },
    notes: [
      "The Media Composer Extensions SDK name replaces Panel SDK terminology in this release line.",
      "Windows 10 is not qualified for releases newer than 2025.6.",
      "License dongles are not supported on Apple silicon.",
    ],
    source: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
    provenance: {
      product: "Media Composer",
      sourceTitle: "Avid Media Composer Documentation and Version Matrix",
      sourceUrl: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
      sourceLastUpdated: "2026-06-23",
      retrievedOn: "2026-08-15",
      evidence: {
        releaseLine: "2025.12",
        latestPatch: "2025.12.2",
        latestReleaseDate: "2026-04-07",
      },
    },
  },
  {
    release: "2025.6",
    latestQualifiedPatch: "2025.6",
    verifiedOn: "2026-08-15",
    supportTier: "previous",
    extensionSurface: "panel-sdk",
    operatingSystems: {
      windows: [
        { version: "10", minimumFeatureUpdate: "22H2", editions: ["Professional", "Enterprise"] },
        { version: "11", minimumFeatureUpdate: "22H2", editions: ["Professional", "Enterprise"] },
      ],
      macos: [
        { major: 13, qualifiedThrough: "13.7.x" },
        { major: 14, qualifiedThrough: "14.7.x" },
        { major: 15, qualifiedThrough: "15.5" },
      ],
    },
    architectures: { windows: ["x64"], macos: ["x64", "arm64"] },
    notes: [
      "This is the final feature release line qualified for Windows 10.",
      "macOS Monterey 12.x and earlier are not supported.",
      "License dongles are not supported on Apple silicon.",
    ],
    source: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
    provenance: {
      product: "Media Composer",
      sourceTitle: "Avid Media Composer Documentation and Version Matrix",
      sourceUrl: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
      sourceLastUpdated: "2026-06-23",
      retrievedOn: "2026-08-15",
      evidence: {
        releaseLine: "2025.6",
        latestPatch: "2025.6",
        latestReleaseDate: "2025-06-30",
      },
    },
  },
  {
    release: "2024.12",
    latestQualifiedPatch: "2024.12.6",
    verifiedOn: "2026-08-15",
    supportTier: "long-term-maintenance",
    extensionSurface: "panel-sdk",
    operatingSystems: {
      windows: [
        { version: "10", minimumFeatureUpdate: "22H2", editions: ["Professional", "Enterprise"] },
        { version: "11", minimumFeatureUpdate: "22H2", editions: ["Professional", "Enterprise"] },
      ],
      macos: [
        { major: 13, qualifiedThrough: "13.7.x" },
        { major: 14, qualifiedThrough: "14.7.x" },
        { major: 15, qualifiedThrough: "15.4.x" },
      ],
    },
    architectures: { windows: ["x64"], macos: ["x64", "arm64"] },
    notes: [
      "Avid continues to qualify 2024.12.x maintenance patches on Windows 10.",
      "Apple silicon support includes M1 through M4 families according to Avid's version matrix.",
      "License dongles are not supported on Apple silicon.",
    ],
    source: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
    provenance: {
      product: "Media Composer",
      sourceTitle: "Avid Media Composer Documentation and Version Matrix",
      sourceUrl: "https://kb.avid.com/pkb/articles/en_US/compatibility/en267087",
      sourceLastUpdated: "2026-06-23",
      retrievedOn: "2026-08-15",
      evidence: {
        releaseLine: "2024.12",
        latestPatch: "2024.12.6",
        latestReleaseDate: "2026-03-17",
      },
    },
  },
] as const;

export interface CompatibilityInput {
  mediaComposerVersion: string;
  platform: AvidPlatform;
  operatingSystemVersion?: string;
  architecture?: AvidArchitecture;
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  input: CompatibilityInput;
  release?: AvidReleaseTrack;
  checks: {
    release: CompatibilityStatus;
    platform: CompatibilityStatus;
    architecture: CompatibilityStatus;
  };
  issues: string[];
  warnings: string[];
}

export function resolveReleaseTrack(version: string): AvidReleaseTrack | undefined {
  const match = version.trim().match(/^(\d{4})\.(\d{1,2})(?:\.\d+)?/);
  if (!match) return undefined;
  const line = `${match[1]}.${Number(match[2])}`;
  return AVID_RELEASE_TRACKS.find((candidate) => candidate.release === line);
}

function featureUpdateRank(value: string): number | undefined {
  const match = value.toUpperCase().match(/(\d{2})H([12])/);
  if (!match) return undefined;
  return Number(match[1]) * 2 + Number(match[2]);
}

function evaluateWindows(
  release: AvidReleaseTrack,
  version: string | undefined,
  issues: string[],
  warnings: string[],
): CompatibilityStatus {
  if (!version?.trim()) {
    warnings.push("Windows version was not supplied; OS qualification could not be confirmed.");
    return "unknown";
  }
  const major = version.match(/\b(10|11)\b/)?.[1];
  if (!major) {
    warnings.push(`Could not parse Windows version '${version}'.`);
    return "unknown";
  }
  const qualified = release.operatingSystems.windows.find((item) => item.version === major);
  if (!qualified) {
    issues.push(`Windows ${major} is not qualified for Media Composer ${release.release}.`);
    return "unqualified";
  }
  const suppliedUpdate = featureUpdateRank(version);
  const minimumUpdate = featureUpdateRank(qualified.minimumFeatureUpdate);
  if (suppliedUpdate !== undefined && minimumUpdate !== undefined && suppliedUpdate < minimumUpdate) {
    issues.push(
      `Windows ${major} ${version} is older than the qualified ${qualified.minimumFeatureUpdate} minimum.`,
    );
    return "unqualified";
  }
  if (suppliedUpdate === undefined) {
    warnings.push(
      `Windows ${major} is eligible, but feature update ${qualified.minimumFeatureUpdate} or later must be verified.`,
    );
    return "unknown";
  }
  return "qualified";
}

function evaluateMacos(
  release: AvidReleaseTrack,
  version: string | undefined,
  issues: string[],
  warnings: string[],
): CompatibilityStatus {
  if (!version?.trim()) {
    warnings.push("macOS version was not supplied; OS qualification could not be confirmed.");
    return "unknown";
  }
  const match = version.match(/(\d+)(?:\.(\d+))?/);
  if (!match) {
    warnings.push(`Could not parse macOS version '${version}'.`);
    return "unknown";
  }
  const major = Number(match[1]);
  const rule = release.operatingSystems.macos.find((item) => item.major === major);
  if (!rule) {
    issues.push(`macOS ${major} is not qualified for Media Composer ${release.release}.`);
    return "unqualified";
  }
  const maximumMinor = rule.qualifiedThrough.match(/^\d+\.(\d+)/)?.[1];
  const suppliedMinor = match[2];
  if (
    maximumMinor !== undefined &&
    suppliedMinor !== undefined &&
    Number(suppliedMinor) > Number(maximumMinor)
  ) {
    issues.push(`macOS ${version} is newer than Avid's qualified ${rule.qualifiedThrough} range.`);
    return "unqualified";
  }
  return "qualified";
}

export function evaluateCompatibility(input: CompatibilityInput): CompatibilityResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const release = resolveReleaseTrack(input.mediaComposerVersion);
  if (!release) {
    return {
      status: "unqualified",
      input,
      checks: { release: "unqualified", platform: "unknown", architecture: "unknown" },
      issues: [
        `Media Composer ${input.mediaComposerVersion} is outside the supported 2025.12.x, 2025.6, and 2024.12.x release tracks.`,
      ],
      warnings,
    };
  }

  const platform =
    input.platform === "windows"
      ? evaluateWindows(release, input.operatingSystemVersion, issues, warnings)
      : evaluateMacos(release, input.operatingSystemVersion, issues, warnings);
  const architecture = input.architecture;
  let architectureStatus: CompatibilityStatus = "unknown";
  if (!architecture) {
    warnings.push("CPU architecture was not supplied; architecture qualification could not be confirmed.");
  } else if (!release.architectures[input.platform].includes(architecture)) {
    architectureStatus = "unqualified";
    issues.push(
      `${architecture} is not a qualified ${input.platform} architecture for Media Composer ${release.release}.`,
    );
  } else {
    architectureStatus = "qualified";
  }

  const statuses: CompatibilityStatus[] = ["qualified", platform, architectureStatus];
  const status = statuses.includes("unqualified")
    ? "unqualified"
    : statuses.includes("unknown")
      ? "unknown"
      : "qualified";
  return {
    status,
    input,
    release,
    checks: { release: "qualified", platform, architecture: architectureStatus },
    issues,
    warnings,
  };
}

export function detectHostPlatform(): {
  platform?: AvidPlatform;
  operatingSystemVersion?: string;
  architecture?: AvidArchitecture;
  raw: { platform: NodeJS.Platform; release: string; architecture: string };
} {
  const raw = { platform: process.platform, release: os.release(), architecture: os.arch() };
  const architecture = raw.architecture === "x64" || raw.architecture === "arm64"
    ? raw.architecture
    : undefined;
  if (process.platform === "win32") {
    const build = Number(raw.release.split(".").at(-1));
    const windowsMajor = Number.isFinite(build) ? (build >= 22_000 ? "11" : "10") : undefined;
    return {
      platform: "windows",
      ...(windowsMajor ? { operatingSystemVersion: windowsMajor } : {}),
      ...(architecture ? { architecture } : {}),
      raw,
    };
  }
  if (process.platform === "darwin") {
    return { platform: "macos", ...(architecture ? { architecture } : {}), raw };
  }
  return { ...(architecture ? { architecture } : {}), raw };
}
