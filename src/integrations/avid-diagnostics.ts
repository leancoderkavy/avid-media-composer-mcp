import { access } from "node:fs/promises";

export type AvidIntegrationSurface = "ama" | "amt" | "avx" | "aax" | "nexis" | "distributed-processing";
export type IntegrationAvailability = "installed" | "not-detected" | "public-documentation" | "provider-gated";

export interface IntegrationDiagnostic {
  surface: AvidIntegrationSurface;
  availability: IntegrationAvailability;
  purpose: string;
  evidence: string;
  safeScope: string;
  warnings: string[];
}

const SURFACES: Record<AvidIntegrationSurface, Omit<IntegrationDiagnostic, "availability" | "evidence">> = {
  ama: { surface: "ama", purpose: "Media format linking and plug-in based import/export.", safeScope: "Report detected plug-ins and format prerequisites only.", warnings: ["AMA is not a general Media Composer timeline-control API."] },
  amt: { surface: "amt", purpose: "Licensed Avid Media Toolkit workflows for OP-Atom media and matching AAF metadata.", safeScope: "Report whether a workflow needs a licensed toolkit.", warnings: ["Do not represent open-source AAF writing as Avid Media Toolkit output."] },
  avx: { surface: "avx", purpose: "Media Composer video effect plug-in development.", safeScope: "Classify installed effect components only.", warnings: ["AVX is not editorial automation."] },
  aax: { surface: "aax", purpose: "Avid audio plug-in development.", safeScope: "Classify installed audio plug-in components only.", warnings: ["AAX is not a Media Composer editing API."] },
  nexis: { surface: "nexis", purpose: "Shared-storage and workspace client environment.", safeScope: "Report local client/path evidence without storage administration.", warnings: ["Never perform NEXIS administration or assume shared-storage permissions."] },
  "distributed-processing": { surface: "distributed-processing", purpose: "Distributed processing infrastructure.", safeScope: "Report infrastructure evidence only.", warnings: ["Distributed Processing release versions must not be used as Media Composer application versions."] },
};

export async function diagnoseAvidIntegrations(installedPaths: Partial<Record<AvidIntegrationSurface, string>> = {}, pathAccess: (path: string) => Promise<unknown> = access): Promise<IntegrationDiagnostic[]> {
  return Promise.all((Object.keys(SURFACES) as AvidIntegrationSurface[]).map(async (surface) => {
    const candidate = installedPaths[surface];
    let availability: IntegrationAvailability = surface === "ama" ? "public-documentation" : "provider-gated";
    let evidence = surface === "ama" ? "Avid publicly documents AMA as a plug-in architecture." : "Requires licensed SDK access, eligible infrastructure, or local installation evidence.";
    if (candidate) {
      try { await pathAccess(candidate); availability = "installed"; evidence = "Local path was accessible; functionality and license were not verified."; }
      catch { availability = "not-detected"; evidence = "Configured local path was not accessible."; }
    }
    return { ...SURFACES[surface], availability, evidence };
  }));
}

export function assessProductVersionEvidence(subjectProduct: "media-composer", sourceProduct: string, version: string): { accepted: boolean; reason?: string } {
  if (subjectProduct === "media-composer" && sourceProduct.trim().toLowerCase() !== "media composer") {
    return { accepted: false, reason: `Rejected ${sourceProduct} ${version}: product versions are not transferable to Media Composer.` };
  }
  return { accepted: true };
}
