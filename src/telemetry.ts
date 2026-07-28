import { PostHog } from "posthog-node";

export type TelemetryEvent =
  | "avid_mcp_server_started"
  | "avid_mcp_connection_attempt"
  | "avid_mcp_request"
  | "avid_mcp_tool_call";

export type TelemetryProperties = Record<string, boolean | number | string | null>;

export interface Telemetry {
  readonly enabled: boolean;
  capture(event: TelemetryEvent, properties?: TelemetryProperties): void;
  shutdown(): Promise<void>;
}

const SERVER_VERSION = "0.2.0";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

const noopTelemetry: Telemetry = {
  enabled: false,
  capture: () => undefined,
  shutdown: async () => undefined,
};

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

  const host = env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  const distinctId =
    env.POSTHOG_DISTINCT_ID?.trim() ||
    `service:${env.FLY_APP_NAME?.trim() || "avid-media-composer-mcp"}`;
  const client = clientFactory(apiKey, host);

  return {
    enabled: true,
    capture(event, properties = {}) {
      void client
        .captureImmediate({
          distinctId,
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
