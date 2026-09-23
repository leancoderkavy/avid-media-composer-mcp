import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureLanding } from "../landing/lib/telemetry.js";

describe("landing telemetry privacy", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-project-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    fetchMock.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("sends only bounded metadata without credentials or referrer", () => {
    captureLanding("avid_landing_copy", "claude", "succeeded");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(request.credentials).toBe("omit");
    expect(request.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(request.body)).toEqual({
      api_key: "test-project-token",
      event: "avid_landing_copy",
      distinct_id: expect.stringMatching(/^landing:/),
      properties: {
        target: "claude", outcome: "succeeded", $ip: "0.0.0.0",
        $geoip_disable: true, $process_person_profile: false,
      },
    });
  });

  it("does nothing without a key, with privacy signals, or with an unsupported host", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    captureLanding("avid_landing_copy", "cli", "failed");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-project-token");
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    captureLanding("avid_landing_copy", "cli", "failed");
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    captureLanding("avid_landing_copy", "cli", "failed");
    vi.stubGlobal("navigator", {});
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://untrusted.example");
    captureLanding("avid_landing_copy", "cli", "failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects free text and never throws when transport fails", async () => {
    captureLanding("avid_landing_copy", "/private/media.mov" as never, "failed");
    captureLanding("avid_landing_copy", "cli", "secret" as never);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new Error("private detail"));
    expect(() => captureLanding("avid_landing_copy", "cli", "failed")).not.toThrow();
    await Promise.resolve();
    fetchMock.mockImplementationOnce(() => { throw new Error("blocked"); });
    expect(() => captureLanding("avid_landing_client_selected", "cursor")).not.toThrow();
  });
});
