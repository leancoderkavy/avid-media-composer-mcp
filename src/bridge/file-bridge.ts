import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateCompatibility } from "../compatibility/releases.js";
import { AvidMcpError } from "../errors.js";
import { bridgeCapabilitiesSchema, parseBridgeResponse } from "./schemas.js";
import {
  AVID_BRIDGE_PROTOCOL_VERSION,
  type BridgeCapabilities,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeStatus,
} from "./types.js";

const HEARTBEAT_MAX_AGE_MS = 15_000;

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
    const parsedCapabilities = bridgeCapabilitiesSchema.safeParse(await readJson(capabilitiesPath));
    if (!parsedCapabilities.success) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        reason: "Bridge capability document is invalid or uses a different protocol version",
      };
    }
    const raw = parsedCapabilities.data as BridgeCapabilities;
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
    const compatibility = evaluateCompatibility({
      mediaComposerVersion: raw.mediaComposerVersion,
      platform: raw.platform,
      operatingSystemVersion: raw.operatingSystemVersion,
      architecture: raw.architecture,
    });
    const compatible = compatibility.status === "qualified";
    return {
      configured: true,
      connected: heartbeatAgeMs <= HEARTBEAT_MAX_AGE_MS && compatible,
      bridgeDir,
      heartbeatAgeMs,
      capabilities: raw,
      compatibility,
      ...(heartbeatAgeMs > HEARTBEAT_MAX_AGE_MS
        ? { reason: `Bridge heartbeat is stale (${heartbeatAgeMs}ms old)` }
        : !compatible
          ? {
              reason:
                compatibility.status === "unqualified"
                  ? "Bridge host is outside the qualified Media Composer/platform matrix"
                  : "Bridge host compatibility could not be fully verified",
            }
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
  action: string,
  timeoutMs: number,
): Promise<BridgeResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = parseBridgeResponse(await readJson(responsePath), operationId, action);
      if (!response) {
        throw new AvidMcpError(
          "BRIDGE_INVALID_RESPONSE",
          "Media Composer Extension returned an invalid response",
          { operationId },
        );
      }
      return response;
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

  const response = await waitForResponse(responsePath, operationId, action, timeoutMs);
  if (!response.ok) {
    throw new AvidMcpError(
      response.error?.code ?? "BRIDGE_COMMAND_FAILED",
      response.error?.message ?? `Bridge command '${action}' failed`,
      { operationId, ...(response.error?.details ? { bridge: response.error.details } : {}) },
    );
  }
  return response;
}
