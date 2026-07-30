import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release and deployment policy", () => {
  it("keeps the hosted service read-only and rooted at /data", async () => {
    const fly = await readFile("fly.toml", "utf8");
    expect(fly).toContain('AVID_MCP_CAPABILITIES = "inspect"');
    expect(fly).toContain('AVID_MCP_ALLOWED_ROOTS = "/data"');
    expect(fly).toContain('POSTHOG_HOST = "https://us.i.posthog.com"');
    expect(fly).toContain('POSTHOG_DISTINCT_ID = "service:avid-media-composer-mcp"');
    expect(fly).not.toContain("POSTHOG_API_KEY");
    expect(fly).not.toContain("unsafe-automation");
  });

  it("requires the authenticated HTTP entry point in the production image", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain('CMD ["node", "dist/http-server.js"]');
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("ARG GIT_COMMIT=unknown");
    expect(dockerfile).toContain('org.opencontainers.image.revision="${GIT_COMMIT}"');
    expect(dockerfile).not.toContain("ALLOW_UNAUTHENTICATED");
  });

  it("validates and refuses duplicate npm versions before provenance publication", async () => {
    const workflow = await readFile(".github/workflows/npm-publish.yml", "utf8");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("Refuse duplicate version");
    expect(workflow).toContain("npm publish --access public --provenance");
    expect(workflow).toContain('--tag "$NPM_TAG"');
    expect(workflow).toContain("id-token: write");
  });

  it("audits and builds the static landing in CI and Dependabot", async () => {
    const [workflow, dependabot] = await Promise.all([
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile(".github/dependabot.yml", "utf8"),
    ]);
    expect(workflow).toContain("landing:");
    expect(workflow).toContain("npm audit --audit-level=high");
    expect(workflow).toContain("working-directory: landing");
    expect(dependabot).toContain("directory: /landing");
  });
});
