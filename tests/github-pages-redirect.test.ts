import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GitHub Pages publishes `main:/docs` at https://leancoderkavy.github.io/avid-media-composer-mcp/.
 * docs/WEBSITE_SEO.md requires every canonical, Open Graph and redirect URL to name the apex
 * domain, so the Pages stub must not hand search engines the legacy `*.vercel.app` alias.
 */
const apex = "https://avid-media-composer-mcp.com/";
const readDoc = (name: string) => readFile(path.resolve("docs", name), "utf8");

describe("GitHub Pages redirect stub", () => {
  it("redirects and canonicalises on the apex domain, never the legacy alias", async () => {
    const html = await readDoc("index.html");
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${apex}">`);
    expect(html).toContain(`<link rel="canonical" href="${apex}">`);
    expect(html).toContain(`<meta property="og:url" content="${apex}">`);
    expect(html).toContain(`window.location.replace("${apex}" + window.location.hash)`);
    expect(html).not.toContain("vercel.app");
  });

  it("keeps the not-found page pointed at the project Pages root", async () => {
    const html = await readDoc("404.html");
    // A project Pages site is served under /avid-media-composer-mcp/, so both the
    // stylesheet and the recovery link have to carry that prefix to survive a
    // request for a nested missing path.
    expect(html).toContain('href="/avid-media-composer-mcp/styles.css"');
    expect(html).toContain('href="/avid-media-composer-mcp/"');
    expect(html).not.toContain("vercel.app");
  });
});
