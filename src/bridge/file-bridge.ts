import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateCompatibility } from "../compatibility/releases.js";
import { AvidMcpError } from "../errors.js";
import { bridgeCapabilitiesSchema, parseBridgeResponse } from "./schemas.js";
import {
  bridgeAuthConfig,
  createBridgeAuthentication,
  verifyBridgeAuthentication,
} from "./security.js";
import {
  AVID_BRIDGE_PROTOCOL_VERSION,
  type BridgeCapabilities,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeStatus,
} from "./types.js";

const HEARTBEAT_MAX_AGE_MS = 15_000;
const clientSessionId = randomUUID();
const requestSequences = new Map<string, number>();
const SAFE_FILE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function nextRequestSequence(installationId: string): number {
  const next = (requestSequences.get(installationId) ?? 0) + 1;
  requestSequences.set(installationId, next);
  return next;
}

async function ensureRealDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new AvidMcpError(
      "BRIDGE_UNSAFE_PATH",
      "Bridge mailbox directories must be real directories, not links",
    );
  }
}

async function assertRealFile(filePath: string): Promise<void> {
  const details = await lstat(filePath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new AvidMcpError("BRIDGE_UNSAFE_PATH", "Bridge mailbox files must not be links");
  }
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
    await assertRealFile(capabilitiesPath);
    const rawDocument = await readJson(capabilitiesPath);
    const parsedCapabilities = bridgeCapabilitiesSchema.safeParse(rawDocument);
    if (!parsedCapabilities.success) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        reason: "Bridge capability document is invalid or uses a different protocol version",
      };
    }
    const raw = parsedCapabilities.data as BridgeCapabilities;
    const auth = bridgeAuthConfig();
    if (!auth) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        capabilities: raw,
        reason:
          "Bridge authentication is not configured; set a unique AVID_MCP_BRIDGE_AUTH_SECRET of at least 32 characters",
      };
    }
    if (!verifyBridgeAuthentication(rawDocument as Record<string, unknown>, auth)) {
      return {
        configured: true,
        connected: false,
        bridgeDir,
        capabilities: raw,
        reason: "Bridge capability authentication could not be verified",
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
      negotiatedProtocolVersion: AVID_BRIDGE_PROTOCOL_VERSION,
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
  request: BridgeRequest,
  timeoutMs: number,
  auth: NonNullable<ReturnType<typeof bridgeAuthConfig>>,
): Promise<BridgeResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await assertRealFile(responsePath);
      const rawResponse = await readJson(responsePath);
      const response = parseBridgeResponse(rawResponse, request.operationId, request.action);
      if (!response) {
        throw new AvidMcpError(
          "BRIDGE_INVALID_RESPONSE",
          "Media Composer Extension returned an invalid response",
          { operationId: request.operationId },
        );
      }
      if (!verifyBridgeAuthentication(rawResponse as Record<string, unknown>, auth)) {
        throw new AvidMcpError(
          "BRIDGE_AUTHENTICATION_FAILED",
          "Media Composer Extension response authentication could not be verified",
          { operationId: request.operationId },
        );
      }
      if (
        response.clientSessionId !== request.clientSessionId ||
        response.requestSequence !== request.requestSequence ||
        response.requestNonce !== request.nonce
      ) {
        throw new AvidMcpError(
          "BRIDGE_REPLAY_DETECTED",
          "Media Composer Extension response does not bind to this request",
          { operationId: request.operationId },
        );
      }
      if (Date.parse(response.completedAt) < Date.parse(request.createdAt) - 5_000) {
        throw new AvidMcpError(
          "BRIDGE_REPLAY_DETECTED",
          "Media Composer Extension response predates this request",
          { operationId: request.operationId },
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
    operationId: request.operationId,
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
  const auth = bridgeAuthConfig();
  if (!auth) {
    throw new AvidMcpError(
      "BRIDGE_AUTHENTICATION_REQUIRED",
      "Bridge authentication is not configured",
    );
  }
  if (!SAFE_FILE_IDENTIFIER.test(operationId)) {
    throw new AvidMcpError("BRIDGE_INVALID_OPERATION_ID", "Operation ID is not safe for a mailbox file");
  }

  const requestDir = path.join(status.bridgeDir, "requests");
  const responseDir = path.join(status.bridgeDir, "responses");
  await Promise.all([
    ensureRealDirectory(requestDir),
    ensureRealDirectory(responseDir),
  ]);

  const createdAt = new Date().toISOString();
  const request: BridgeRequest = {
    protocolVersion: AVID_BRIDGE_PROTOCOL_VERSION,
    operationId,
    clientSessionId,
    requestSequence: nextRequestSequence(status.capabilities.installationId),
    nonce: randomUUID(),
    createdAt,
    expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
    action,
    payload,
    authentication: {} as BridgeRequest["authentication"],
  };
  request.authentication = createBridgeAuthentication(request as unknown as Record<string, unknown>, auth);
  const requestPath = path.join(requestDir, `${operationId}.json`);
  const reservationPath = `${requestPath}.lock`;
  const temporaryPath = `${requestPath}.${randomUUID()}.tmp`;
  const responsePath = path.join(responseDir, `${operationId}.json`);
  try {
    // Reserving the operation ID before the atomic publish prevents accidental overwrite or
    // duplicate execution when callers retry the same caller-supplied ID concurrently.
    await writeFile(reservationPath, `${clientSessionId}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await assertRealFile(requestPath);
      throw new AvidMcpError("BRIDGE_DUPLICATE_OPERATION", "Bridge request already exists", {
        operationId,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(temporaryPath, `${JSON.stringify(request)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, requestPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  } finally {
    await unlink(reservationPath).catch(() => undefined);
  }

  const response = await waitForResponse(responsePath, request, timeoutMs, auth);
  if (!response.ok) {
    throw new AvidMcpError(
      response.error?.code ?? "BRIDGE_COMMAND_FAILED",
      response.error?.message ?? `Bridge command '${action}' failed`,
      { operationId, ...(response.error?.details ? { bridge: response.error.details } : {}) },
    );
  }
  return response;
}
