import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureLanding, capturePageview } from "../landing/lib/telemetry.js";

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
      timestamp: expect.any(String),
      properties: {
        target: "claude", outcome: "succeeded", $ip: "0.0.0.0",
        $session_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        $geoip_disable: true, $process_person_profile: false,
      },
    });
  });

  it("falls back to the public leancoderkavy project token when no key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    captureLanding("avid_landing_copy", "cli", "failed");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).api_key).toBe("phc_ua4YCP5MJnrHUgWryu23xyuKYMuyVfwPacgYJYRwBVXb");
  });

  it("sends pageviews with standard web analytics properties and no hash or referrer query", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://avid-media-composer-mcp.com", host: "avid-media-composer-mcp.com", pathname: "/faq/", search: "?utm_source=newsletter", hash: "#x" },
    });
    vi.stubGlobal("document", { referrer: "https://www.google.com/search?q=private", title: "FAQ" });
    capturePageview();
    capturePageview();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe("$pageview");
    expect(body.distinct_id).toMatch(/^landing:/);
    expect(body.properties).toMatchObject({
      $current_url: "https://avid-media-composer-mcp.com/faq/?utm_source=newsletter",
      $host: "avid-media-composer-mcp.com",
      $pathname: "/faq/",
      $referrer: "https://www.google.com/search",
      $referring_domain: "www.google.com",
      utm_source: "newsletter",
      $ip: "0.0.0.0",
      $process_person_profile: false,
    });
  });

  it("skips pageviews with privacy signals", () => {
    vi.stubGlobal("window", { location: { origin: "https://a.test", host: "a.test", pathname: "/setup/", search: "" } });
    vi.stubGlobal("document", { referrer: "", title: "" });
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    capturePageview();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing with privacy signals or with an unsupported host", () => {
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
