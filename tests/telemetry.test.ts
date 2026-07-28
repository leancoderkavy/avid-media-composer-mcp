import { describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/telemetry.js";

describe("PostHog telemetry", () => {
  it("is a no-op unless explicitly configured", async () => {
    const factory = vi.fn();
    const telemetry = createTelemetry({}, factory);

    telemetry.capture("avid_mcp_server_started", { transport: "stdio" });
    await telemetry.shutdown();

    expect(telemetry.enabled).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it("captures only supplied bounded operational metadata and disables profiles", async () => {
    const capture = vi.fn();
    const shutdown = vi.fn(async () => undefined);
    const telemetry = createTelemetry(
      {
        POSTHOG_API_KEY: "test-project-key",
        POSTHOG_HOST: "https://example.posthog.test",
        POSTHOG_DISTINCT_ID: "service:test",
        NODE_ENV: "test",
      },
      () => ({ capture, _shutdown: shutdown }) as never,
    );

    telemetry.capture("avid_mcp_tool_call", {
      tool: "avid_ping",
      outcome: "succeeded",
      duration_ms: 3,
    });
    await telemetry.shutdown();

    expect(telemetry.enabled).toBe(true);
    expect(capture).toHaveBeenCalledWith({
      distinctId: "service:test",
      event: "avid_mcp_tool_call",
      properties: {
        tool: "avid_ping",
        outcome: "succeeded",
        duration_ms: 3,
        service: "avid-media-composer-mcp",
        server_version: "0.2.0",
        environment: "test",
        $geoip_disable: true,
        $process_person_profile: false,
      },
      disableGeoip: true,
    });
    expect(shutdown).toHaveBeenCalledWith(5_000);
  });
});
