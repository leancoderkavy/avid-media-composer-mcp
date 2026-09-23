import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelConfig {
  headers: Array<{
    source: string;
    headers: VercelHeader[];
  }>;
}

describe("landing deployment security", () => {
  it("defines browser hardening headers for every static route", async () => {
    const config = JSON.parse(
      await readFile(path.resolve("landing/vercel.json"), "utf8"),
    ) as VercelConfig;
    expect(config.headers).toHaveLength(1);
    expect(config.headers[0]?.source).toBe("/(.*)");
    const headers = new Map(
      config.headers[0]?.headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");

    const csp = headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    
    // Verify CSP doesn't allow overly-broad URL patterns
    expect(csp).not.toMatch(/\bhttps?:\s/); // bare http: or https: without //
    expect(csp).not.toMatch(/https?:\/\/\*/); // wildcard origins like https://*
    
    // Allowlist specific PostHog ingestion origins (exact match only)
    const allowedOrigins = ["https://us.i.posthog.com", "https://eu.i.posthog.com"];
    const urlPattern = /https?:\/\/[^\s;]+/g;
    const foundUrls = csp.match(urlPattern) || [];
    for (const url of foundUrls) {
      expect(allowedOrigins).toContain(url);
    }
  });
});
