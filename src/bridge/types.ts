import type {
  AvidArchitecture,
  AvidPlatform,
  CompatibilityResult,
} from "../compatibility/releases.js";

export const AVID_BRIDGE_PROTOCOL_VERSION = 2;

export interface BridgeCapabilities {
  protocolVersion: number;
  extensionVersion: string;
  mediaComposerVersion: string;
  platform: AvidPlatform;
  operatingSystemVersion: string;
  architecture: AvidArchitecture;
  sessionId: string;
  heartbeatAt: string;
  supportedActions: string[];
  supportedEditOperations: string[];
  project?: {
    id?: string;
    name?: string;
    path?: string;
  };
}

export interface BridgeStatus {
  configured: boolean;
  connected: boolean;
  bridgeDir?: string;
  reason?: string;
  heartbeatAgeMs?: number;
  capabilities?: BridgeCapabilities;
  compatibility?: CompatibilityResult;
}

export interface BridgeRequest {
  protocolVersion: number;
  operationId: string;
  createdAt: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface BridgeResponse {
  protocolVersion: number;
  operationId: string;
  completedAt: string;
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
