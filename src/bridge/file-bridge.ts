import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AvidMcpError } from "../errors.js";
import {
  AVID_BRIDGE_PROTOCOL_VERSION,
  type BridgeCapabilities,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeStatus,
} from "./types.js";

const HEARTBEAT_MAX_AGE_MS = 15_000;

function isCapabilities(value: unknown): value is BridgeCapabilities {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BridgeCapabilities>;
  return (
    candidate.protocolVersion === AVID_BRIDGE_PROTOCOL_VERSION &&
    typeof candidate.extensionVersion === "string" &&
    typeof candidate.mediaComposerVersion === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.heartbeatAt === "string" &&
    Array.isArray(candidate.supportedActions) &&
    candidate.supportedActions.every((action) => typeof action === "string") &&
    Array.isArray(candidate.supportedEditOperations) &&
    candidate.supportedEditOperations.every((action) => typeof action === "string")
  );
}

function isResponse(value: unknown, operationId: string): value is BridgeResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BridgeResponse>;
  return (
    candidate.protocolVersion === AVID_BRIDGE_PROTOCOL_VERSION &&
    candidate.operationId === operationId &&
    typeof candidate.completedAt === "string" &&
    typeof candidate.ok === "boolean"
  );
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function getBridgeStatus(bridgeDir: string | undefined): Promise<BridgeStatus> {
  if (!bridgeDir) {
    return {
      configured: false,
      connected: false,
      reason: "AVID_MCP_BRIDGE_DIR is not configured",
    };
  }

  const capabilitiesPath = path.join(bridgeDir, "state", "capabilities.json");
  try {
    const raw = await readJson(capabilitiesPath);
    if (!isCapabilities(raw)) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        reason: "Bridge capability document is invalid or uses a different protocol version",
      };
    }
    const heartbeat = Date.parse(raw.heartbeatAt);
    if (!Number.isFinite(heartbeat)) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        reason: "Bridge heartbeat is not a valid timestamp",
        capabilities: raw,
      };
    }
    const heartbeatAgeMs = Math.max(0, Date.now() - heartbeat);
    return {
      configured: true,
      connected: heartbeatAgeMs <= HEARTBEAT_MAX_AGE_MS,
      bridgeDir,
      heartbeatAgeMs,
      capabilities: raw,
      ...(heartbeatAgeMs > HEARTBEAT_MAX_AGE_MS
        ? { reason: `Bridge heartbeat is stale (${heartbeatAgeMs}ms old)` }
        : {}),
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      bridgeDir,
      reason:
        error instanceof Error
          ? `Bridge state is unavailable: ${error.message}`
          : "Bridge state is unavailable",
    };
  }
}

async function waitForResponse(
  responsePath: string,
  operationId: string,
  timeoutMs: number,
): Promise<BridgeResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await readJson(responsePath);
      if (!isResponse(raw, operationId)) {
        throw new AvidMcpError(
          "BRIDGE_INVALID_RESPONSE",
          "Media Composer Extension returned an invalid response",
          { operationId },
        );
      }
      return raw;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new AvidMcpError("BRIDGE_TIMEOUT", "Media Composer Extension did not respond in time", {
    operationId,
    timeoutMs,
  });
}

export async function sendBridgeCommand(
  bridgeDir: string | undefined,
  action: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  operationId = randomUUID(),
): Promise<BridgeResponse> {
  const status = await getBridgeStatus(bridgeDir);
  if (!status.connected || !status.bridgeDir || !status.capabilities) {
    throw new AvidMcpError(
      "BRIDGE_NOT_CONNECTED",
      status.reason ?? "Media Composer Extension bridge is not connected",
      { status },
    );
  }
  if (!status.capabilities.supportedActions.includes(action)) {
    throw new AvidMcpError("BRIDGE_ACTION_UNSUPPORTED", `Bridge does not support '${action}'`, {
      action,
      supportedActions: status.capabilities.supportedActions,
    });
  }

  const requestDir = path.join(status.bridgeDir, "requests");
  const responseDir = path.join(status.bridgeDir, "responses");
  await Promise.all([
    mkdir(requestDir, { recursive: true }),
    mkdir(responseDir, { recursive: true }),
  ]);

  const request: BridgeRequest = {
    protocolVersion: AVID_BRIDGE_PROTOCOL_VERSION,
    operationId,
    createdAt: new Date().toISOString(),
    action,
    payload,
  };
  const requestPath = path.join(requestDir, `${operationId}.json`);
  const temporaryPath = `${requestPath}.${randomUUID()}.tmp`;
  const responsePath = path.join(responseDir, `${operationId}.json`);
  await writeFile(temporaryPath, `${JSON.stringify(request)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, requestPath);

  const response = await waitForResponse(responsePath, operationId, timeoutMs);
  if (!response.ok) {
    throw new AvidMcpError(
      response.error?.code ?? "BRIDGE_COMMAND_FAILED",
      response.error?.message ?? `Bridge command '${action}' failed`,
      { operationId, ...(response.error?.details ? { bridge: response.error.details } : {}) },
    );
  }
  return response;
}
