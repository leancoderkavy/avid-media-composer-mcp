import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { BridgeAuthentication } from "./types.js";

const MAX_AUTH_CLOCK_SKEW_MS = 60_000;

export interface BridgeAuthConfig {
  keyId: string;
  secret: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!isRecord(value)) throw new Error("Bridge envelopes must contain JSON objects only");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function unsignedEnvelope(value: Record<string, unknown>): Record<string, unknown> {
  const authentication = value.authentication;
  if (!isRecord(authentication)) throw new Error("Bridge envelope has no authentication object");
  const { signature: _signature, ...unsignedAuthentication } = authentication;
  return { ...value, authentication: unsignedAuthentication };
}

export function bridgeAuthConfig(env: NodeJS.ProcessEnv = process.env): BridgeAuthConfig | undefined {
  const secret = env.AVID_MCP_BRIDGE_AUTH_SECRET?.trim();
  const keyId = env.AVID_MCP_BRIDGE_AUTH_KEY_ID?.trim() || "local-installation";
  // A short passphrase is not an authentication boundary. The secret is intentionally not
  // persisted by the MCP or emitted in status, audit, request, or response documents.
  if (!secret || secret.length < 32 || keyId.length > 256) return undefined;
  return { keyId, secret };
}

export function signBridgeEnvelope(
  value: Record<string, unknown>,
  config: BridgeAuthConfig,
): string {
  return createHmac("sha256", config.secret).update(canonical(unsignedEnvelope(value))).digest("base64url");
}

export function createBridgeAuthentication(
  value: Record<string, unknown>,
  config: BridgeAuthConfig,
  options: { nonce?: string; signedAt?: string } = {},
): BridgeAuthentication {
  const authentication: BridgeAuthentication = {
    algorithm: "hmac-sha256",
    keyId: config.keyId,
    nonce: options.nonce ?? randomUUID(),
    signedAt: options.signedAt ?? new Date().toISOString(),
    signature: "",
  };
  const signed = { ...value, authentication };
  return { ...authentication, signature: signBridgeEnvelope(signed, config) };
}

export function verifyBridgeAuthentication(
  value: Record<string, unknown>,
  config: BridgeAuthConfig,
  now = Date.now(),
): boolean {
  const authentication = value.authentication;
  if (!isRecord(authentication)) return false;
  if (
    authentication.algorithm !== "hmac-sha256" ||
    authentication.keyId !== config.keyId ||
    typeof authentication.signature !== "string" ||
    typeof authentication.signedAt !== "string"
  ) {
    return false;
  }
  const signedAt = Date.parse(authentication.signedAt);
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > MAX_AUTH_CLOCK_SKEW_MS) return false;
  const expected = signBridgeEnvelope(value, config);
  const actual = Buffer.from(authentication.signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}
