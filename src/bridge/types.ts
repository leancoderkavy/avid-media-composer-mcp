import type {
  AvidArchitecture,
  AvidPlatform,
  CompatibilityResult,
} from "../compatibility/releases.js";

export const AVID_BRIDGE_PROTOCOL_VERSION = 3;

export interface BridgeAuthentication {
  algorithm: "hmac-sha256";
  keyId: string;
  nonce: string;
  signedAt: string;
  signature: string;
}

export interface BridgeCapabilities {
  protocolVersion: number;
  supportedProtocolVersions: number[];
  extensionId: string;
  installationId: string;
  extensionVersion: string;
  mediaComposerVersion: string;
  platform: AvidPlatform;
  operatingSystemVersion: string;
  architecture: AvidArchitecture;
  sessionId: string;
  heartbeatAt: string;
  stateRevision?: string;
  supportedActions: string[];
  supportedEditOperations: string[];
  project?: {
    id?: string;
    name?: string;
    path?: string;
  };
  authentication: BridgeAuthentication;
}

export interface BridgeStatus {
  configured: boolean;
  connected: boolean;
  bridgeDir?: string;
  reason?: string;
  heartbeatAgeMs?: number;
  capabilities?: BridgeCapabilities;
  compatibility?: CompatibilityResult;
  negotiatedProtocolVersion?: number;
}

export interface BridgeRequest {
  protocolVersion: number;
  operationId: string;
  clientSessionId: string;
  requestSequence: number;
  nonce: string;
  createdAt: string;
  expiresAt: string;
  action: string;
  payload: Record<string, unknown>;
  authentication: BridgeAuthentication;
}

export interface BridgeInspectStateData {
  stateRevision: string;
  project?: {
    id?: string;
    name?: string;
    path?: string;
  };
  state: BridgeLiveState;
}

export interface BridgeLiveState {
  activeBin?: { id: string; name?: string; locked?: boolean };
  activeSequence?: { id: string; name?: string; durationFrames?: number; editRate?: number };
  selection?: { ids: string[]; kind?: string };
  playhead?: { frame?: number; timecode?: string };
  marks?: { inFrame?: number; outFrame?: number };
  tracks?: Array<{
    id: string;
    name?: string;
    kind?: "video" | "audio" | "data" | "unknown";
    enabled?: boolean;
    targeted?: boolean;
    locked?: boolean;
    muted?: boolean;
    solo?: boolean;
  }>;
  busy?: boolean;
  modal?: boolean;
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
  clientSessionId: string;
  requestSequence: number;
  requestNonce: string;
  completedAt: string;
  ok: boolean;
  data?: BridgeInspectStateData | BridgeEditPlanData;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  authentication: BridgeAuthentication;
}
