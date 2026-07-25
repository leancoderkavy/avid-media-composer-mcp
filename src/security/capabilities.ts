import { randomUUID } from "node:crypto";
import { AvidMcpError } from "../errors.js";

export const CAPABILITIES = [
  "inspect",
  "edit",
  "project-write",
  "export",
  "unsafe-automation",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface CapabilityConfig {
  capabilities: ReadonlySet<Capability>;
  source: "default" | "environment" | "explicit";
}

const KNOWN = new Set<string>(CAPABILITIES);

export function resolveCapabilities(value: string | undefined): CapabilityConfig {
  if (value === undefined || value.trim() === "") {
    return { capabilities: new Set<Capability>(["inspect"]), source: "default" };
  }

  const capabilities = new Set<Capability>();
  for (const raw of value.split(",")) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (!KNOWN.has(name)) {
      throw new AvidMcpError("UNKNOWN_CAPABILITY", `Unknown Avid MCP capability: ${name}`, {
        known: CAPABILITIES,
      });
    }
    capabilities.add(name as Capability);
  }
  return { capabilities, source: "environment" };
}

export function requireCapability(
  enabled: ReadonlySet<Capability>,
  required: Capability,
  operationId = randomUUID(),
): string {
  if (!enabled.has(required)) {
    throw new AvidMcpError(
      "CAPABILITY_DENIED",
      `Operation ${operationId} requires the '${required}' capability`,
      { required, enabled: [...enabled].sort(), operationId },
    );
  }
  return operationId;
}
