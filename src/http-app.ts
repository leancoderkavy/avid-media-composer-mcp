import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ServerConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { telemetry } from "./telemetry.js";
import packageJson from "../package.json" with { type: "json" };

export interface HttpServerOptions {
  authToken: string;
  config?: ServerConfig;
  maxRequestBytes?: number;
  maxConcurrentRequests?: number;
  /** @deprecated Use authenticatedRateLimitPerMinute. */
  rateLimitPerMinute?: number;
  publicRateLimitPerMinute?: number;
  unauthorizedRateLimitPerMinute?: number;
  authenticatedRateLimitPerMinute?: number;
  requestBodyTimeoutMs?: number;
}

const MIN_AUTH_TOKEN_BYTES = 32;
const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 32;
const DEFAULT_PUBLIC_RATE_LIMIT_PER_MINUTE = 300;
const DEFAULT_UNAUTHORIZED_RATE_LIMIT_PER_MINUTE = 30;
const DEFAULT_AUTHENTICATED_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_REQUEST_BODY_TIMEOUT_MS = 15_000;

interface RateWindow {
  count: number;
  startedAt: number;
}

class HttpInputError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

function isAuthorized(request: http.IncomingMessage, authToken: string): boolean {
  const header = request.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(authToken);
  const candidate = Buffer.from(supplied);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000",
    ...headers,
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return selected;
}

function consumeRateLimit(
  windows: Map<string, RateWindow>,
  key: string,
  limit: number,
  now: number,
): boolean {
  const prior = windows.get(key);
  const window =
    !prior || now - prior.startedAt >= 60_000 ? { count: 0, startedAt: now } : prior;
  window.count += 1;
  windows.set(key, window);
  return window.count <= limit;
}

async function readJsonBody(
  request: http.IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpInputError(415, "Content-Type must be application/json");
  }

  const declaredLength = request.headers["content-length"];
  if (declaredLength !== undefined) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new HttpInputError(400, "Invalid Content-Length");
    }
    if (parsedLength > maxBytes) {
      throw new HttpInputError(413, "Request body too large");
    }
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  const timeout = setTimeout(() => request.destroy(new Error("Request body timeout")), timeoutMs);
  timeout.unref();
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        throw new HttpInputError(413, "Request body too large");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof HttpInputError) throw error;
    throw new HttpInputError(408, "Request body timed out");
  } finally {
    clearTimeout(timeout);
  }

  if (bytes === 0) {
    throw new HttpInputError(400, "Request body is required");
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    throw new HttpInputError(400, "Request body must be valid JSON");
  }
}

export function createHttpServer(options: HttpServerOptions): http.Server {
  if (Buffer.byteLength(options.authToken, "utf8") < MIN_AUTH_TOKEN_BYTES) {
    throw new Error(`MCP_AUTH_TOKEN must contain at least ${MIN_AUTH_TOKEN_BYTES} bytes`);
  }

  const maxRequestBytes = positiveLimit(
    options.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES,
    "maxRequestBytes",
  );
  const maxConcurrentRequests = positiveLimit(
    options.maxConcurrentRequests,
    DEFAULT_MAX_CONCURRENT_REQUESTS,
    "maxConcurrentRequests",
  );
  const publicRateLimitPerMinute = positiveLimit(
    options.publicRateLimitPerMinute,
    DEFAULT_PUBLIC_RATE_LIMIT_PER_MINUTE,
    "publicRateLimitPerMinute",
  );
  const unauthorizedRateLimitPerMinute = positiveLimit(
    options.unauthorizedRateLimitPerMinute,
    DEFAULT_UNAUTHORIZED_RATE_LIMIT_PER_MINUTE,
    "unauthorizedRateLimitPerMinute",
  );
  const authenticatedRateLimitPerMinute = positiveLimit(
    options.authenticatedRateLimitPerMinute ?? options.rateLimitPerMinute,
    DEFAULT_AUTHENTICATED_RATE_LIMIT_PER_MINUTE,
    "authenticatedRateLimitPerMinute",
  );
  const requestBodyTimeoutMs = positiveLimit(
    options.requestBodyTimeoutMs,
    DEFAULT_REQUEST_BODY_TIMEOUT_MS,
    "requestBodyTimeoutMs",
  );
  const rateWindows = new Map<string, RateWindow>();
  const authFingerprint = createHash("sha256").update(options.authToken).digest("hex").slice(0, 16);
  let activeRequests = 0;

  const httpServer = http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const now = Date.now();
    const requestStartedAt = performance.now();
    response.once("finish", () => {
      telemetry.capture("avid_mcp_request", {
        transport: "streamable-http",
        method: request.method ?? "UNKNOWN",
        route:
          pathname === "/mcp" || pathname === "/health" || pathname === "/" ? pathname : "other",
        status_code: response.statusCode,
        duration_ms: Math.round(performance.now() - requestStartedAt),
      });
    });
    if (rateWindows.size > 10_000) {
      for (const [key, window] of rateWindows) {
        if (now - window.startedAt >= 60_000) rateWindows.delete(key);
      }
    }

    const client = request.socket.remoteAddress ?? "unknown";
    if (pathname !== "/mcp") {
      if (
        !consumeRateLimit(
          rateWindows,
          `public:${client}`,
          publicRateLimitPerMinute,
          now,
        )
      ) {
        sendJson(response, 429, { error: "Too many requests" }, { "Retry-After": "60" });
        return;
      }
    }

    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "avid-media-composer-mcp",
        version: packageJson.version,
        transport: "streamable-http",
        liveAvidBridge: false,
      });
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      sendJson(response, 200, {
        service: "avid-media-composer-mcp",
        version: packageJson.version,
        mcpEndpoint: "/mcp",
        authentication: "Bearer token required",
        scope:
          "Hosted inspection and compatibility service. Local project files and Media Composer control require a local deployment and Extension bridge.",
      });
      return;
    }

    if (pathname !== "/mcp") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    const authorized = isAuthorized(request, options.authToken);
    if (!authorized) {
      if (
        !consumeRateLimit(
          rateWindows,
          `unauthorized:${client}`,
          unauthorizedRateLimitPerMinute,
          now,
        )
      ) {
        sendJson(response, 429, { error: "Too many requests" }, { "Retry-After": "60" });
        return;
      }
      telemetry.capture("avid_mcp_connection_attempt", {
        transport: "streamable-http",
        outcome: "unauthorized",
      });
      sendJson(
        response,
        401,
        { error: "Unauthorized" },
        { "WWW-Authenticate": 'Bearer realm="avid-media-composer-mcp"' },
      );
      return;
    }
    if (
      !consumeRateLimit(
        rateWindows,
        `authenticated:${authFingerprint}`,
        authenticatedRateLimitPerMinute,
        now,
      )
    ) {
      sendJson(response, 429, { error: "Too many requests" }, { "Retry-After": "60" });
      return;
    }
    telemetry.capture("avid_mcp_connection_attempt", {
      transport: "streamable-http",
      outcome: "authorized",
    });

    if (activeRequests >= maxConcurrentRequests) {
      sendJson(response, 503, { error: "Server busy" }, { "Retry-After": "1" });
      return;
    }
    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeRequests -= 1;
    };
    response.once("close", release);
    response.once("finish", release);

    const server = createServer(options.config ?? loadConfig());
    const transport = new StreamableHTTPServerTransport();
    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      const parsedBody =
        request.method === "POST"
          ? await readJsonBody(request, maxRequestBytes, requestBodyTimeoutMs)
          : undefined;
      // SDK 1.29's Node transport declaration is structurally compatible at runtime but conflicts
      // with exactOptionalPropertyTypes because its optional callback getters include undefined.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, parsedBody);
    } catch (error) {
      if (error instanceof HttpInputError && !response.headersSent) {
        sendJson(response, error.status, { error: error.publicMessage });
        return;
      }
      console.error(
        "[avid-media-composer-mcp] HTTP request failed:",
        error instanceof Error ? error.message : String(error),
      );
      if (!response.headersSent) {
        sendJson(response, 500, { error: "Internal server error" });
      }
    }
  });
  httpServer.maxHeadersCount = 100;
  httpServer.headersTimeout = 10_000;
  httpServer.requestTimeout = 30_000;
  httpServer.keepAliveTimeout = 5_000;
  return httpServer;
}
