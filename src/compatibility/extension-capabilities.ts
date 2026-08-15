import { EDIT_ACTION_CATALOG, type EditActionDefinition } from "../edit/catalog.js";

/**
 * The status is deliberately more constrained than the edit catalog. A
 * catalog entry is a design contract; it is not an Avid SDK claim.
 */
export type SdkAccessStatus = "pending-avid-onboarding" | "not-verified" | "available";
export type CapabilityImplementationStatus = "not-started" | "implemented" | "host-verified";
export type CapabilityDocumentationStatus = "internal-catalog" | "avid-sdk-documentation";

export interface ExtensionCapabilityManifestEntry {
  action: string;
  category: string;
  risk: EditActionDefinition["risk"];
  destructive: boolean;
  adapter: "media-composer-extension";
  documentation: CapabilityDocumentationStatus;
  sdkAccess: SdkAccessStatus;
  sdkMethod: string | null;
  minimumHostVersion: string | null;
  implementation: CapabilityImplementationStatus;
  hostEvidence: readonly string[];
  fallback: "none";
}

export interface ExtensionCapabilityManifest {
  schemaVersion: 1;
  product: "Media Composer";
  generatedFrom: "EDIT_ACTION_CATALOG";
  catalogActionCount: number;
  capabilities: readonly ExtensionCapabilityManifestEntry[];
}

/**
 * Machine-readable inventory for SDK onboarding. Every entry begins as an
 * internal catalog contract and remains unavailable to a live bridge until a
 * sanctioned SDK method and real-host evidence are recorded.
 */
export const EXTENSION_CAPABILITY_MANIFEST: ExtensionCapabilityManifest = {
  schemaVersion: 1,
  product: "Media Composer",
  generatedFrom: "EDIT_ACTION_CATALOG",
  catalogActionCount: EDIT_ACTION_CATALOG.length,
  capabilities: EDIT_ACTION_CATALOG.map((definition) => ({
    action: definition.action,
    category: definition.category,
    risk: definition.risk,
    destructive: definition.destructive,
    adapter: definition.adapter,
    documentation: "internal-catalog",
    sdkAccess: "pending-avid-onboarding",
    sdkMethod: null,
    minimumHostVersion: null,
    implementation: "not-started",
    hostEvidence: [],
    fallback: "none",
  })),
};

export function validateExtensionCapabilityManifest(
  manifest: ExtensionCapabilityManifest = EXTENSION_CAPABILITY_MANIFEST,
): string[] {
  const issues: string[] = [];
  if (manifest.catalogActionCount !== EDIT_ACTION_CATALOG.length) {
    issues.push(
      `Manifest reports ${manifest.catalogActionCount} actions but the edit catalog contains ${EDIT_ACTION_CATALOG.length}.`,
    );
  }

  const catalogByAction = new Map(EDIT_ACTION_CATALOG.map((item) => [item.action, item]));
  const seenActions = new Set<string>();
  for (const capability of manifest.capabilities) {
    const catalogEntry = catalogByAction.get(capability.action);
    if (!catalogEntry) {
      issues.push(`Manifest action '${capability.action}' is not present in the edit catalog.`);
      continue;
    }
    if (seenActions.has(capability.action)) {
      issues.push(`Manifest action '${capability.action}' is duplicated.`);
    }
    seenActions.add(capability.action);
    if (
      capability.category !== catalogEntry.category ||
      capability.risk !== catalogEntry.risk ||
      capability.destructive !== catalogEntry.destructive ||
      capability.adapter !== catalogEntry.adapter
    ) {
      issues.push(`Manifest action '${capability.action}' does not match its edit catalog definition.`);
    }
    if (
      capability.documentation === "internal-catalog" &&
      (capability.sdkMethod !== null || capability.minimumHostVersion !== null || capability.hostEvidence.length > 0)
    ) {
      issues.push(
        `Catalog-only action '${capability.action}' cannot claim an SDK method, host version, or host evidence.`,
      );
    }
  }
  for (const action of catalogByAction.keys()) {
    if (!seenActions.has(action)) {
      issues.push(`Edit catalog action '${action}' is missing from the capability manifest.`);
    }
  }
  return issues;
}
