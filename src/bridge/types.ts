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

export interface BridgeInspectStateData {
  stateRevision: string;
  project?: {
    id?: string;
    name?: string;
    path?: string;
  };
  state: Record<string, unknown>;
}

export interface BridgeEditOperationResult {
  index: number;
  action: string;
  status: "applied" | "verified" | "failed" | "skipped";
  targetId?: string;
  verified: boolean;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface BridgeEditPlanData {
  applied: number;
  partialApply: boolean;
  preStateRevision: string;
  postStateRevision?: string;
  undoGroupId?: string;
  results: BridgeEditOperationResult[];
  outputs?: Record<string, unknown>;
}

export interface BridgeResponse {
  protocolVersion: number;
  operationId: string;
  completedAt: string;
  ok: boolean;
  data?: BridgeInspectStateData | BridgeEditPlanData;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
