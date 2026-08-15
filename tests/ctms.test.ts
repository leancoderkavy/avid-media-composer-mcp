import { describe, expect, it } from "vitest";
import { CtmsReadClient } from "../src/integrations/ctms.js";

describe("CTMS read client", () => {
  it("discovers only allowlisted HAL links, bounds responses, and strips credentials", async () => {
    const calls: string[] = [];
    const client = new CtmsReadClient({
      registryUrl: "https://ctms.example.test/registry",
      allowedOrigins: ["https://ctms.example.test"],
      accessToken: "private-token",
      fetcher: async (url, init) => {
        calls.push(`${url}:${init.headers.authorization}`);
        if (url.endsWith("/registry")) return { status: 200, body: { token: "never", _links: { assets: { href: "/assets" }, evil: { href: "http://evil.test/steal" } } } };
        return { status: 200, body: { name: "Asset", authorization: "omit", nested: { password: "omit", id: 2 } } };
      },
    });
    const discovery = await client.discover();
    expect(discovery.links).toEqual({ assets: "https://ctms.example.test/assets" });
    expect(discovery.resource).toEqual({ _links: { assets: { href: "/assets" }, evil: { href: "http://evil.test/steal" } } });
    await expect(client.readRelation("evil")).rejects.toMatchObject({ code: "CTMS_RELATION_UNAVAILABLE" });
    expect(await client.readRelation("assets")).toEqual({ name: "Asset", nested: { id: 2 } });
    expect(calls.join(" ")).toContain("Bearer private-token");
  });

  it("rejects non-HTTPS or non-allowlisted registry origins", () => {
    expect(() => new CtmsReadClient({ registryUrl: "http://ctms.example.test/registry", allowedOrigins: ["http://ctms.example.test"], accessToken: "x", fetcher: async () => ({ status: 200, body: {} }) })).toThrow(/HTTPS/);
    expect(() => new CtmsReadClient({ registryUrl: "https://ctms.example.test/registry", allowedOrigins: ["https://other.example.test"], accessToken: "x", fetcher: async () => ({ status: 200, body: {} }) })).toThrow(/allowlisted/);
  });
});
