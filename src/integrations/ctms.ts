import { AvidMcpError } from "../errors.js";

export interface CtmsFetchResponse { status: number; headers?: Record<string, string | undefined>; body: unknown; }
export type CtmsFetch = (url: string, init: { method: "GET"; headers: Record<string, string> }) => Promise<CtmsFetchResponse>;

export interface CtmsClientOptions {
  registryUrl: string;
  allowedOrigins: readonly string[];
  accessToken: string;
  maxResponseBytes?: number;
  fetcher: CtmsFetch;
}

type JsonRecord = Record<string, unknown>;
const SENSITIVE_KEY = /authorization|password|secret|token|cookie|credential/i;

function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new AvidMcpError("CTMS_HTTPS_REQUIRED", "CTMS endpoints must use HTTPS", { origin: url.origin });
  return url.origin;
}
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => SENSITIVE_KEY.test(key) ? [] : [[key, sanitize(child)] as const]));
}
function responseSize(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function extractLinks(value: unknown): Record<string, string> {
  if (!isRecord(value) || !isRecord(value._links)) return {};
  const links: Record<string, string> = {};
  for (const [rel, candidate] of Object.entries(value._links)) {
    const candidateLink = Array.isArray(candidate) ? candidate[0] : candidate;
    if (isRecord(candidateLink) && typeof candidateLink.href === "string") links[rel] = candidateLink.href;
  }
  return links;
}

/** Session-scoped CTMS HAL reader. It never mutates CTMS and never exposes its bearer token. */
export class CtmsReadClient {
  private readonly allowedOrigins: Set<string>;
  private readonly cache = new Map<string, string>();
  private readonly maxResponseBytes: number;
  private initialized = false;

  constructor(private readonly options: CtmsClientOptions) {
    if (!options.accessToken.trim()) throw new AvidMcpError("CTMS_TOKEN_REQUIRED", "A CTMS access token is required");
    this.allowedOrigins = new Set(options.allowedOrigins.map(normalizedOrigin));
    const registryOrigin = normalizedOrigin(options.registryUrl);
    if (!this.allowedOrigins.has(registryOrigin)) throw new AvidMcpError("CTMS_REGISTRY_ORIGIN_NOT_ALLOWED", "CTMS registry origin is not allowlisted", { registryOrigin });
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes < 1_024) throw new AvidMcpError("CTMS_MAX_RESPONSE_INVALID", "maxResponseBytes must be at least 1024");
  }

  private assertAllowed(urlValue: string): string {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !this.allowedOrigins.has(url.origin)) throw new AvidMcpError("CTMS_ENDPOINT_NOT_ALLOWED", "CTMS endpoint is not an allowlisted HTTPS origin", { origin: url.origin });
    return url.toString();
  }
  private async get(urlValue: string): Promise<unknown> {
    const url = this.assertAllowed(urlValue);
    const response = await this.options.fetcher(url, { method: "GET", headers: { accept: "application/hal+json, application/json", authorization: `Bearer ${this.options.accessToken}` } });
    if (response.status < 200 || response.status >= 300) throw new AvidMcpError("CTMS_READ_FAILED", "CTMS read request failed", { status: response.status, endpoint: new URL(url).pathname });
    if (responseSize(response.body) > this.maxResponseBytes) throw new AvidMcpError("CTMS_RESPONSE_TOO_LARGE", "CTMS response exceeds configured bound", { endpoint: new URL(url).pathname, maxResponseBytes: this.maxResponseBytes });
    return sanitize(response.body);
  }
  async discover(): Promise<{ links: Record<string, string>; resource: unknown }> {
    const resource = await this.get(this.options.registryUrl);
    const links = extractLinks(resource);
    for (const [rel, href] of Object.entries(links)) {
      try { this.cache.set(rel, this.assertAllowed(new URL(href, this.options.registryUrl).toString())); } catch { /* untrusted HAL links are omitted */ }
    }
    this.initialized = true;
    return { links: Object.fromEntries(this.cache), resource };
  }
  async readRelation(relation: string): Promise<unknown> {
    if (!this.initialized) await this.discover();
    const endpoint = this.cache.get(relation);
    if (!endpoint) throw new AvidMcpError("CTMS_RELATION_UNAVAILABLE", "CTMS registry did not advertise this relation", { relation });
    return this.get(endpoint);
  }
  clearSession(): void { this.cache.clear(); this.initialized = false; }
}
