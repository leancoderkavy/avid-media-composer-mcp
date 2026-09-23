import { PostHog } from "posthog-node";
import { SERVER_VERSION } from "./version.js";

export type TelemetryEvent =
  | "avid_mcp_server_started"
  | "avid_mcp_connection_attempt"
  | "avid_mcp_request"
  | "avid_mcp_tool_call";

export type TelemetryProperties = Record<string, boolean | number | string | null>;

export interface Telemetry {
  readonly enabled: boolean;
  capture(event: TelemetryEvent, properties?: TelemetryProperties, distinctId?: string): void;
  shutdown(): Promise<void>;
}

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const ALLOWED_POSTHOG_ORIGINS = new Set(["https://us.i.posthog.com", "https://eu.i.posthog.com"]);

const noopTelemetry: Telemetry = {
  enabled: false,
  capture: () => undefined,
  shutdown: async () => undefined,
};

function defaultDistinctId(env: NodeJS.ProcessEnv): string {
  return (
    env.POSTHOG_DISTINCT_ID?.trim() ||
    `service:${env.FLY_APP_NAME?.trim() || "avid-media-composer-mcp"}`
  );
}

export function createTelemetry(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (apiKey: string, host: string) => PostHog = (apiKey, host) =>
    new PostHog(apiKey, {
      host,
      flushAt: 10,
      flushInterval: 5_000,
      enableExceptionAutocapture: false,
    }),
): Telemetry {
  const apiKey = env.POSTHOG_API_KEY?.trim();
  if (!apiKey) return noopTelemetry;

  const hostString = env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  
  // Validate host using proper URL parsing to prevent incomplete substring sanitization
  let host: string;
  try {
    const url = new URL(hostString);
    if (!ALLOWED_POSTHOG_ORIGINS.has(url.origin)) {
      console.warn(`[avid-media-composer-mcp] Invalid PostHog origin: ${url.origin}. Telemetry disabled.`);
      return noopTelemetry;
    }
    host = url.origin;
  } catch {
    console.warn(`[avid-media-composer-mcp] Invalid PostHog URL: ${hostString}. Telemetry disabled.`);
    return noopTelemetry;
  }
  
  const fallbackDistinctId = defaultDistinctId(env);
  const client = clientFactory(apiKey, host);

  return {
    enabled: true,
    capture(event, properties = {}, distinctId) {
      void client
        .captureImmediate({
          distinctId: distinctId || fallbackDistinctId,
          event,
          properties: {
            ...properties,
            service: "avid-media-composer-mcp",
            server_version: SERVER_VERSION,
            environment: env.NODE_ENV?.trim() || "development",
            $geoip_disable: true,
            $process_person_profile: false,
          },
          disableGeoip: true,
        })
        .catch((error: unknown) => {
          console.error(
            `[avid-media-composer-mcp] PostHog capture failed: ${
              error instanceof Error ? error.name : "UnknownError"
            }`,
          );
        });
    },
    async shutdown() {
      await client._shutdown(5_000);
    },
  };
}

export const telemetry = createTelemetry();
